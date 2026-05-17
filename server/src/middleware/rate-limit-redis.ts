/**
 * Redis-backed Distributed Rate Limiting
 * Replaces in-memory rate limiting for multi-instance deployments
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redis';
import { logger } from '../utils/logger';

export interface RateLimitOptions {
  /** Maximum number of requests */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Custom key generator function */
  keyGenerator?: (req: Request) => string;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
}

/**
 * Redis-backed rate limiting middleware
 * Supports distributed rate limiting across multiple server instances
 */
export const rateLimitRedis = (options: RateLimitOptions) => {
  const {
    maxRequests,
    windowMs,
    keyGenerator,
    skip,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip if function provided and returns true
    if (skip && skip(req)) {
      return next();
    }

    // Generate rate limit key (user ID or IP)
    const identifier = keyGenerator
      ? keyGenerator(req)
      : (req.user?.id || req.ip || 'unknown');

    const key = `rate-limit:${identifier}`;

    try {
      // Get current count
      const current = await redis.get(key);
      const count = current ? parseInt(current, 10) : 0;

      // Check if over limit
      if (count >= maxRequests) {
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : Math.ceil(windowMs / 1000);

        logger.warn(`Rate limit exceeded for ${identifier}`, {
          count,
          maxRequests,
          identifier,
        });

        res.status(429).json({
          error: 'Too many requests',
          retryAfter,
        });
        return;
      }

      // Increment counter
      if (count === 0) {
        // First request - set with expiry
        await redis.setex(key, Math.ceil(windowMs / 1000), '1');
      } else {
        // Increment existing counter
        await redis.incr(key);
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - count - 1).toString());
      res.setHeader('X-RateLimit-Reset', (Date.now() + windowMs).toString());

      next();
    } catch (error) {
      // Fail open - if Redis is down, don't block requests
      logger.error('Rate limiting error (failing open):', error);
      next();
    }
  };
};

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  /** Auth endpoints: 5 requests per minute */
  auth: rateLimitRedis({
    maxRequests: 5,
    windowMs: 60000,
  }),

  /** AI generation: 20 requests per minute */
  ai: rateLimitRedis({
    maxRequests: 20,
    windowMs: 60000,
  }),

  /** General API: 100 requests per minute */
  api: rateLimitRedis({
    maxRequests: 100,
    windowMs: 60000,
  }),

  /** Strict: 3 requests per minute (session creation, etc.) */
  strict: rateLimitRedis({
    maxRequests: 3,
    windowMs: 60000,
  }),
};

/**
 * Reset rate limit for a specific key (useful for testing or admin override)
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  const key = `rate-limit:${identifier}`;
  await redis.del(key);
  logger.info(`Rate limit reset for ${identifier}`);
}

/**
 * Get current rate limit status for an identifier
 */
export async function getRateLimitStatus(identifier: string): Promise<{
  count: number;
  limit: number;
  ttl: number;
  remaining: number;
}> {
  const key = `rate-limit:${identifier}`;
  const current = await redis.get(key);
  const count = current ? parseInt(current, 10) : 0;
  const ttl = await redis.ttl(key);

  return {
    count,
    limit: 100, // Default, would need to track per endpoint
    ttl,
    remaining: Math.max(0, 100 - count),
  };
}
