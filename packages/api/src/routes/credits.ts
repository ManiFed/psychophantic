import { FastifyInstance, FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { redisHelpers } from '../lib/redis.js';
import {
  DAILY_FREE_CREDITS,
  DAILY_FREE_CREDITS_CENTS,
  CREDIT_PACKAGES,
  CreditPackageId,
  SUBSCRIPTION_PLANS,
  EXTRA_USAGE_PACKAGES,
  ExtraUsagePackageId,
  FREE_TIER_MODELS,
  getFreeTierCreditCost,
} from '../shared/index.js';

// Initialize Stripe client (only if key is available)
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

interface TransactionsQuery extends RouteGenericInterface {
  Querystring: { limit?: string; offset?: string };
}

type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const purchaseSchema = z.object({
  packageId: z.enum(['pack_100', 'pack_500', 'pack_2000', 'pack_5000'] as const),
});

export async function creditRoutes(server: FastifyInstance) {
  // Get balance
  server.get(
    '/balance',
    { preHandler: [authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.user.id;

      // Check cache first
      const cached = await redisHelpers.getCachedCredits(userId);

      // Get or create balance
      let balance = await prisma.creditBalance.findUnique({
        where: { userId },
      });

      if (!balance) {
        balance = await prisma.creditBalance.create({
          data: {
            userId,
            freeCreditsCents: DAILY_FREE_CREDITS_CENTS,
            purchasedCreditsCents: 0,
          },
        });
      }

      // Check if daily reset is needed
      const now = new Date();
      const lastReset = new Date(balance.lastFreeReset);
      const todayMidnightUTC = new Date(now);
      todayMidnightUTC.setUTCHours(0, 0, 0, 0);

      const lastResetDay = new Date(lastReset);
      lastResetDay.setUTCHours(0, 0, 0, 0);

      if (todayMidnightUTC > lastResetDay) {
        // Reset free credits
        balance = await prisma.creditBalance.update({
          where: { userId },
          data: {
            freeCreditsCents: DAILY_FREE_CREDITS_CENTS,
            lastFreeReset: now,
          },
        });

        // Log the reset
        await prisma.creditTransaction.create({
          data: {
            userId,
            amountCents: DAILY_FREE_CREDITS_CENTS,
            transactionType: 'daily_reset',
            sourceType: 'free',
            description: 'Daily free credit reset',
            balanceAfterCents:
              balance.freeCreditsCents + balance.purchasedCreditsCents,
          },
        });
      }

      // Update cache
      await redisHelpers.setCachedCredits(
        userId,
        balance.freeCreditsCents,
        balance.purchasedCreditsCents,
        balance.lastFreeReset
      );

      // Check for active subscription
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      const activeSub = subscription && subscription.status === 'active' &&
        new Date(subscription.currentPeriodEnd) > new Date()
        ? subscription
        : null;

      if (activeSub) {
        const plan = SUBSCRIPTION_PLANS[activeSub.plan as keyof typeof SUBSCRIPTION_PLANS];
        const budgetCents = plan?.budgetCents ?? 0;
        const usedCents = activeSub.usageCents;
        const extraCents = activeSub.extraUsageCents;
        const totalBudget = budgetCents + extraCents;
        const usagePercent = totalBudget > 0 ? Math.min(100, Math.round((usedCents / totalBudget) * 100)) : 0;

        return {
          freeCents: balance.freeCreditsCents,
          purchasedCents: balance.purchasedCreditsCents,
          totalCents: balance.freeCreditsCents + balance.purchasedCreditsCents,
          lastFreeReset: balance.lastFreeReset.toISOString(),
          subscription: {
            plan: activeSub.plan,
            planName: plan?.name ?? activeSub.plan,
            budgetCents,
            usageCents: usedCents,
            extraUsageCents: extraCents,
            totalBudgetCents: totalBudget,
            remainingCents: Math.max(0, totalBudget - usedCents),
            usagePercent,
            currentPeriodEnd: activeSub.currentPeriodEnd.toISOString(),
            autoReloadCents: activeSub.autoReloadCents,
          },
        };
      }

      return {
        freeCents: balance.freeCreditsCents,
        purchasedCents: balance.purchasedCreditsCents,
        totalCents: balance.freeCreditsCents + balance.purchasedCreditsCents,
        freeCredits: balance.freeCreditsCents, // alias for the new credit system
        lastFreeReset: balance.lastFreeReset.toISOString(),
        subscription: null,
      };
    }
  );

  // Get transactions
  server.get<TransactionsQuery>(
    '/transactions',
    { preHandler: [authenticate] },
    async (request) => {
      const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      const [transactions, total] = await Promise.all([
        prisma.creditTransaction.findMany({
          where: { userId: request.user.id },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.creditTransaction.count({
          where: { userId: request.user.id },
        }),
      ]);

      return { transactions, total };
    }
  );

  // Purchase credits (returns Stripe client secret)
  server.post(
    '/purchase',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!stripe) {
          return reply.status(503).send({
            error: 'Payment processing is not configured. Please set STRIPE_SECRET_KEY.',
          });
        }

        const body = purchaseSchema.parse(request.body);
        const pack = CREDIT_PACKAGES[body.packageId];

        if (!pack) {
          return reply.status(400).send({ error: 'Invalid package' });
        }

        const user = await prisma.user.findUnique({
          where: { id: request.user.id },
          include: { stripeCustomer: true },
        });

        if (!user) {
          return reply.status(404).send({ error: 'User not found' });
        }

        // Get or create Stripe customer
        let stripeCustomerId = user.stripeCustomer?.stripeCustomerId;

        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: user.email,
            metadata: {
              userId: user.id,
            },
          });

          stripeCustomerId = customer.id;

          await prisma.stripeCustomer.create({
            data: {
              userId: user.id,
              stripeCustomerId,
            },
          });
        }

        // Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: pack.priceCents,
          currency: 'usd',
          customer: stripeCustomerId,
          metadata: {
            userId: user.id,
            packageId: body.packageId,
            creditsCents: pack.cents.toString(),
          },
          automatic_payment_methods: {
            enabled: true,
          },
        });

        return {
          clientSecret: paymentIntent.client_secret,
          packageId: body.packageId,
          priceCents: pack.priceCents,
          creditsCents: pack.cents,
        };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Validation error',
            details: err.errors,
          });
        }
        console.error('Stripe error:', err);
        return reply.status(500).send({
          error: 'Payment processing failed',
        });
      }
    }
  );

  // Stripe webhook (for payment confirmation)
  // IMPORTANT: This endpoint must receive raw body for signature verification
  server.post(
    '/webhook',
    {
      config: {
        rawBody: true,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!stripe) {
        return reply.status(503).send({ error: 'Stripe not configured' });
      }

      const sig = request.headers['stripe-signature'] as string;

      if (!sig) {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }

      if (!STRIPE_WEBHOOK_SECRET) {
        console.error('STRIPE_WEBHOOK_SECRET not configured');
        return reply.status(503).send({ error: 'Webhook secret not configured' });
      }

      let event: Stripe.Event;

      try {
        // Get raw body for signature verification
        const rawBody = (request as any).rawBody || request.body;
        const bodyString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

        event = stripe.webhooks.constructEvent(
          bodyString,
          sig,
          STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Webhook signature verification failed:', message);
        return reply.status(400).send({ error: `Webhook Error: ${message}` });
      }

      // Handle the event
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const { userId, packageId, creditsCents } = paymentIntent.metadata;

          if (!userId || !creditsCents) {
            console.error('Missing metadata in PaymentIntent:', paymentIntent.id);
            break;
          }

          const creditsToAdd = parseInt(creditsCents, 10);

          // Add credits to user's balance
          const result = await prisma.$transaction(async (tx: TransactionClient) => {
            // Get or create balance
            let balance = await tx.creditBalance.findUnique({
              where: { userId },
            });

            if (!balance) {
              balance = await tx.creditBalance.create({
                data: {
                  userId,
                  freeCreditsCents: DAILY_FREE_CREDITS_CENTS,
                  purchasedCreditsCents: 0,
                },
              });
            }

            // Add purchased credits
            const updated = await tx.creditBalance.update({
              where: { userId },
              data: {
                purchasedCreditsCents: { increment: creditsToAdd },
              },
            });

            // Record transaction
            await tx.creditTransaction.create({
              data: {
                userId,
                amountCents: creditsToAdd,
                transactionType: 'purchase',
                sourceType: 'stripe',
                referenceId: paymentIntent.id,
                description: `Credit purchase: ${packageId}`,
                balanceAfterCents:
                  updated.freeCreditsCents + updated.purchasedCreditsCents,
              },
            });

            return updated;
          });

          // Invalidate cache
          await redisHelpers.invalidateCreditCache(userId);

          console.log(`Added ${creditsToAdd} credits to user ${userId}`);
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log(`Payment failed for PaymentIntent ${paymentIntent.id}`);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      return { received: true };
    }
  );

  // Get available packages
  server.get('/packages', async () => {
    const packages = Object.entries(CREDIT_PACKAGES).map(([id, pack]) => ({
      id,
      ...pack,
    }));

    return { packages };
  });

  // Get subscription plans
  server.get('/plans', async () => {
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
      id,
      ...plan,
    }));
    return { plans };
  });

  // Get available models for the user's tier
  server.get(
    '/models',
    { preHandler: [authenticate] },
    async (request: FastifyRequest) => {
      const userId = request.user.id;

      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      const hasActiveSub = subscription && subscription.status === 'active' &&
        new Date(subscription.currentPeriodEnd) > new Date();

      if (hasActiveSub) {
        // Paid users get all models from OpenRouter
        return { tier: 'paid', plan: subscription!.plan, models: 'all' };
      }

      // Free users get limited models
      return {
        tier: 'free',
        plan: null,
        models: FREE_TIER_MODELS,
      };
    }
  );

  // Subscribe to a plan (creates Stripe subscription or manual for now)
  server.post(
    '/subscribe',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = z.object({
          plan: z.enum(['plus', 'pro', 'max']),
        }).parse(request.body);

        const userId = request.user.id;

        // Check for existing active subscription
        const existing = await prisma.subscription.findUnique({
          where: { userId },
        });

        if (existing && existing.status === 'active') {
          return reply.status(400).send({ error: 'Already subscribed. Cancel first to change plans.' });
        }

        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const subscription = await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: body.plan,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            usageCents: 0,
            extraUsageCents: 0,
          },
          update: {
            plan: body.plan,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            usageCents: 0,
            extraUsageCents: 0,
          },
        });

        return { subscription };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Validation error', details: err.errors });
        }
        console.error('Error subscribing:', err);
        return reply.status(500).send({ error: 'Failed to subscribe' });
      }
    }
  );

  // Cancel subscription
  server.post(
    '/cancel-subscription',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user.id;

      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription || subscription.status !== 'active') {
        return reply.status(400).send({ error: 'No active subscription' });
      }

      await prisma.subscription.update({
        where: { userId },
        data: { status: 'cancelled' },
      });

      return { success: true };
    }
  );

  // Add extra usage to subscription
  server.post(
    '/extra-usage',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = z.object({
          packageId: z.enum(['extra_100', 'extra_500', 'extra_1000'] as const),
        }).parse(request.body);

        const userId = request.user.id;

        const subscription = await prisma.subscription.findUnique({
          where: { userId },
        });

        if (!subscription || subscription.status !== 'active') {
          return reply.status(400).send({ error: 'Active subscription required for extra usage' });
        }

        const pkg = EXTRA_USAGE_PACKAGES[body.packageId];

        await prisma.subscription.update({
          where: { userId },
          data: {
            extraUsageCents: { increment: pkg.cents },
          },
        });

        return { success: true, addedCents: pkg.cents };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Validation error', details: err.errors });
        }
        console.error('Error adding extra usage:', err);
        return reply.status(500).send({ error: 'Failed to add extra usage' });
      }
    }
  );

  // Set auto-reload amount
  server.post(
    '/auto-reload',
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = z.object({
          amountCents: z.number().min(0).max(10000),
        }).parse(request.body);

        const userId = request.user.id;

        const subscription = await prisma.subscription.findUnique({
          where: { userId },
        });

        if (!subscription || subscription.status !== 'active') {
          return reply.status(400).send({ error: 'Active subscription required' });
        }

        await prisma.subscription.update({
          where: { userId },
          data: { autoReloadCents: body.amountCents },
        });

        return { success: true, autoReloadCents: body.amountCents };
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Validation error', details: err.errors });
        }
        console.error('Error setting auto-reload:', err);
        return reply.status(500).send({ error: 'Failed to set auto-reload' });
      }
    }
  );
}

// Helper function for deducting credits (used by orchestration)
export async function deductCredits(
  userId: string,
  amountCents: number,
  referenceId: string
): Promise<{
  freeCents: number;
  purchasedCents: number;
  totalCents: number;
}> {
  const result = await prisma.$transaction(async (tx: TransactionClient) => {
    const balance = await tx.creditBalance.findUnique({
      where: { userId },
    });

    if (!balance) {
      throw new Error('Balance not found');
    }

    const totalAvailable =
      balance.freeCreditsCents + balance.purchasedCreditsCents;

    if (totalAvailable < amountCents) {
      throw new Error('Insufficient credits');
    }

    // Deduct from free credits first, then purchased
    let newFree = balance.freeCreditsCents;
    let newPurchased = balance.purchasedCreditsCents;
    let remaining = amountCents;
    let sourceType: string;

    if (newFree >= remaining) {
      newFree -= remaining;
      sourceType = 'free';
    } else {
      remaining -= newFree;
      newFree = 0;
      newPurchased -= remaining;
      sourceType = balance.freeCreditsCents > 0 ? 'mixed' : 'purchased';
    }

    const updated = await tx.creditBalance.update({
      where: { userId },
      data: {
        freeCreditsCents: newFree,
        purchasedCreditsCents: newPurchased,
      },
    });

    // Record transaction
    await tx.creditTransaction.create({
      data: {
        userId,
        amountCents: -amountCents,
        transactionType: 'usage',
        sourceType,
        referenceId,
        description: 'Message generation',
        balanceAfterCents: newFree + newPurchased,
      },
    });

    return updated;
  });

  // Invalidate cache
  await redisHelpers.invalidateCreditCache(userId);

  return {
    freeCents: result.freeCreditsCents,
    purchasedCents: result.purchasedCreditsCents,
    totalCents: result.freeCreditsCents + result.purchasedCreditsCents,
  };
}

// Check if user bypasses rate limiting (admin/VIP)
export async function isRateLimitBypassed(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { noRateLimit: true },
  });
  return user?.noRateLimit === true;
}

// Helper to check if user has sufficient credits
export async function checkSufficientCredits(
  userId: string,
  minimumCents: number = 1
): Promise<boolean> {
  // Users with noRateLimit bypass credit checks
  if (await isRateLimitBypassed(userId)) {
    return true;
  }

  const cached = await redisHelpers.getCachedCredits(userId);

  if (cached) {
    return cached.freeCents + cached.purchasedCents >= minimumCents;
  }

  const balance = await prisma.creditBalance.findUnique({
    where: { userId },
  });

  if (!balance) {
    return false;
  }

  return (
    balance.freeCreditsCents + balance.purchasedCreditsCents >= minimumCents
  );
}
