import { Request, Response, NextFunction } from 'express';
import { authHelpers } from '../services/supabase';
import { logger } from '../utils/logger';

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
      token?: string;
    }
  }
}

/**
 * Middleware to require authentication
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const user = await authHelpers.verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const user = await authHelpers.verifyToken(token);
    
    if (user) {
      req.user = user;
      req.token = token;
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth
    logger.debug('Optional auth failed:', error);
    next();
  }
};

/**
 * Require specific role
 */
export const requireRole = (role: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

/**
 * Rate limiting middleware
 */
export const rateLimit = (
  maxRequests: number = 100,
  windowMs: number = 60000
) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    
    const userRequests = requests.get(key);
    
    if (!userRequests || userRequests.resetTime < now) {
      requests.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }
    
    if (userRequests.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((userRequests.resetTime - now) / 1000),
      });
    }
    
    userRequests.count++;
    next();
  };
};