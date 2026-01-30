import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { redisHelpers } from './redis.js';
import { publishCreditUpdate } from './events.js';

type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export async function isRateLimitBypassed(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { noRateLimit: true },
  });
  return user?.noRateLimit === true;
}

export async function checkSufficientCredits(
  userId: string,
  minimumCents: number = 1
): Promise<boolean> {
  // Users with noRateLimit bypass credit checks
  if (await isRateLimitBypassed(userId)) {
    return true;
  }

  const balance = await prisma.creditBalance.findUnique({
    where: { userId },
  });

  if (!balance) {
    return false;
  }

  return balance.freeCreditsCents + balance.purchasedCreditsCents >= minimumCents;
}

export async function deductCredits(
  userId: string,
  amountCents: number,
  referenceId: string
): Promise<{ freeCents: number; purchasedCents: number; totalCents: number }> {
  // Users with noRateLimit skip credit deduction
  if (await isRateLimitBypassed(userId)) {
    const balance = await prisma.creditBalance.findUnique({
      where: { userId },
    });
    return {
      freeCents: balance?.freeCreditsCents ?? 0,
      purchasedCents: balance?.purchasedCreditsCents ?? 0,
      totalCents: (balance?.freeCreditsCents ?? 0) + (balance?.purchasedCreditsCents ?? 0),
    };
  }

  const result = await prisma.$transaction(async (tx: TransactionClient) => {
    const balance = await tx.creditBalance.findUnique({
      where: { userId },
    });

    if (!balance) {
      throw new Error('Balance not found');
    }

    const totalAvailable = balance.freeCreditsCents + balance.purchasedCreditsCents;

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

  const credits = {
    freeCents: result.freeCreditsCents,
    purchasedCents: result.purchasedCreditsCents,
    totalCents: result.freeCreditsCents + result.purchasedCreditsCents,
  };

  // Publish credit update
  await publishCreditUpdate(userId, credits);

  return credits;
}
