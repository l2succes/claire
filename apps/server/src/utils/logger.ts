import winston from 'winston';
import { config } from '../config';
import { redactForOperations } from './redaction';

const { combine, timestamp, printf, errors } = winston.format;

// Custom log format
const redactLogInfo = winston.format((info) => {
  const safe = redactForOperations(info) as Record<string, unknown>;
  Object.assign(info, safe);
  return info;
});

const logFormat = printf((info) => {
  const { level, message, timestamp, ...metadata } = info;
  const suffix = Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : '';
  return `${timestamp} [${level}]: ${String(message)}${suffix}`;
});

const baseFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  redactLogInfo(),
  logFormat,
);

const transports: winston.transport[] = [new winston.transports.Console()];

// Railway retains stdout itself. Avoid persisting an additional, unbounded copy
// of diagnostics in production; local files are only for development support.
if (config.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 5242880, maxFiles: 5 }),
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format: baseFormat,
  transports,
});

// Add Sentry transport in production
if (config.NODE_ENV === 'production' && config.SENTRY_DSN) {
  // Sentry integration would go here
  // Example: logger.add(new Sentry.Transport({ dsn: config.SENTRY_DSN }));
}

// Create a stream object for Morgan HTTP logging
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
