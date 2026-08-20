import * as Sentry from '@sentry/node';
import { config } from '../config';
import { redactForOperations } from './redaction';

function sanitizeSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const safe = redactForOperations(event) as Sentry.ErrorEvent;
  // Exception values and request payloads are free-form by design, so do not
  // forward them even after generic redaction. Error type + safe tags are
  // enough to alert and aggregate production failures.
  return {
    ...safe,
    request: event.request ? {
      method: event.request.method,
      url: event.request.url?.split('?')[0],
    } : undefined,
    exception: event.exception ? {
      values: event.exception.values?.map((value) => ({ type: value.type })) || [],
    } : undefined,
    breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
      category: breadcrumb.category,
      level: breadcrumb.level,
      type: breadcrumb.type,
    })),
  } as Sentry.ErrorEvent;
}

export function initSentry(): void {
  if (!config.SENTRY_DSN) return;

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.2 : 1.0,
    beforeSend(event) {
      // Sentry is observability, never a second message store. Keep only the
      // failure class and scrub request/exception extras before egress.
      return sanitizeSentryEvent(event);
    },
  });
}

export { Sentry };
