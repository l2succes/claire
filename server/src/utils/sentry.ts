/**
 * Sentry Error Tracking Integration
 * Initializes Sentry for server-side error tracking
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config } from '../config';

export function initializeSentry(): void {
  if (!config.SENTRY_DSN) {
    console.warn('Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,

    // Performance monitoring
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profiling
    profilesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,

    integrations: [
      // HTTP tracing
      new Sentry.Integrations.Http({ tracing: true }),

      // Express integration
      new Sentry.Integrations.Express({
        app: true,
      }),

      // Profiling
      nodeProfilingIntegration(),
    ],

    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }

      // Remove sensitive query params
      if (event.request?.query_string) {
        const filtered = event.request.query_string
          .split('&')
          .filter(param => !param.startsWith('token=') && !param.startsWith('key='))
          .join('&');
        event.request.query_string = filtered;
      }

      return event;
    },

    // Ignore known errors
    ignoreErrors: [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Network request failed',
    ],
  });

  console.log(`✓ Sentry initialized (environment: ${config.NODE_ENV})`);
}

export { Sentry };
