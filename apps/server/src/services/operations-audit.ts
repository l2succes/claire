import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { pseudonymousOperationsRef } from './operations-privacy';

type OperationsAuditAction = 'snapshot_viewed' | 'incidents_viewed' | 'admins_viewed' | 'admin_granted' | 'admin_revoked' | 'telemetry_viewed';

export async function recordOperationsAudit(input: {
  actorUserId: string;
  action: OperationsAuditAction;
  target?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const { error } = await supabase.from('operations_audit_events').insert({
    actor_ref: pseudonymousOperationsRef(input.actorUserId),
    action: input.action,
    target_ref: input.target ? pseudonymousOperationsRef(input.target) : null,
    metadata: input.metadata || {},
  });
  if (error) logger.warn('Could not persist Operations audit event', { errorCode: error.code || 'audit_write_failed' });
}
