import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' }) as unknown as void;
  }
}

// Optional auth - doesn't fail if no token, just sets user to null
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    // Ignore - user will be null
  }
}
