import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { logger } from '../utils/logger';

const REQUEST_PARTS = ['body', 'query', 'params'] as const;

/**
 * Validation middleware factory.
 *
 * The schema is an object with optional `body`, `query` and `params` keys. The
 * parsed values are written back onto `req`, so handlers only see validated
 * fields: unknown keys are stripped (zod's default for `z.object`), and
 * coercions, transforms and defaults are applied. A part the schema does not
 * declare is left untouched.
 */
export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as Partial<Record<(typeof REQUEST_PARTS)[number], unknown>> | undefined;

      for (const part of REQUEST_PARTS) {
        if (!parsed || !Object.prototype.hasOwnProperty.call(parsed, part)) continue;
        // `req.query` is a getter in some Express versions, so define an own
        // property rather than relying on plain assignment.
        Object.defineProperty(req, part, {
          value: parsed[part],
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      return next();
    } catch (error: any) {
      logger.warn('Validation error:', error);
      
      if (error.errors) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      
      return res.status(400).json({
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
  _res: Response,
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
  
  return next();
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
    return next();
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
    
    return next();
  };
};