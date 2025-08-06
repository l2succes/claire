import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { logger } from '../utils/logger';

/**
 * Validation middleware factory
 */
export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request against schema
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      next();
    } catch (error: any) {
      logger.warn('Validation error:', error);
      
      if (error.errors) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      
      res.status(400).json({
        error: 'Invalid request',
      });
    }
  };
};

/**
 * Sanitize input to prevent XSS
 */
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Basic HTML entity encoding
      return obj
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
};

/**
 * Validate content type
 */
export const requireContentType = (contentType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.get('Content-Type') !== contentType) {
      return res.status(415).json({
        error: `Content-Type must be ${contentType}`,
      });
    }
    next();
  };
};

/**
 * Validate request size
 */
export const limitRequestSize = (maxSizeBytes: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxSizeBytes) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: maxSizeBytes,
      });
    }
    
    next();
  };
};