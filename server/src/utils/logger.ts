import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Custom human-readable log format for development
const devLogFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// Determine format based on environment
const logFormat = config.NODE_ENV === 'production'
  ? combine(
      timestamp(),
      errors({ stack: true }),
      json() // JSON format for production (log aggregation)
    )
  : combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      devLogFormat // Human-readable for development
    );

// Create logger instance
export const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.NODE_ENV === 'production'
        ? combine(timestamp(), errors({ stack: true }), json())
        : combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            errors({ stack: true }),
            devLogFormat
          ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
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