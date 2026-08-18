import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for AI routes (expensive LLM calls).
 * 30 requests per minute per IP.
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again later.' },
  skipFailedRequests: false,
});

/**
 * Rate limiter for auth routes (login / signup).
 * 10 requests per 15 minutes per IP — mitigates brute-force.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
  skipFailedRequests: false,
});
