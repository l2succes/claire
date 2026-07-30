/**
 * Platform-mode resolution and validation (#96).
 *
 * Claire's documented production architecture is Matrix (Synapse + mautrix
 * bridges). But `PLATFORM_MODE` defaults to `'direct'`, so a Railway deploy that
 * simply forgets to set the variable silently boots in direct mode — diverging
 * from the intended architecture and invalidating the multi-platform tickets.
 *
 * These pure helpers make the mode explicit and fail fast (with actionable
 * messages) instead of falling back silently. Kept dependency-free so they are
 * trivially unit-testable without loading the whole config module.
 */

export type PlatformMode = 'direct' | 'matrix';
export type EffectivePlatformMode = 'mock' | PlatformMode;

export interface PlatformModeEnv {
  nodeEnv: string;
  platformMode: PlatformMode;
  /** True when PLATFORM_MODE was set explicitly (vs. taking the default). */
  platformModeExplicit: boolean;
  mockBridge: boolean;
  matrixHomeserverUrl?: string;
  matrixServerName?: string;
  matrixAdminToken?: string;
}

/** The mode the server actually runs in, accounting for the mock bridge. */
export function resolvePlatformMode(
  env: Pick<PlatformModeEnv, 'mockBridge' | 'platformMode'>
): EffectivePlatformMode {
  return env.mockBridge ? 'mock' : env.platformMode;
}

/**
 * Throw with an actionable message when the platform-mode configuration is
 * invalid, or when production would silently fall back to direct mode.
 */
export function validatePlatformMode(env: PlatformModeEnv): void {
  // Matrix mode needs its bridge configuration.
  if (env.platformMode === 'matrix') {
    const missing: string[] = [];
    if (!env.matrixHomeserverUrl) missing.push('MATRIX_HOMESERVER_URL');
    if (!env.matrixServerName) missing.push('MATRIX_SERVER_NAME');
    // The admin token backs the bridge admin API + Matrix media proxy — required
    // in production (dev/test may run a reduced Matrix setup).
    if (env.nodeEnv === 'production' && !env.matrixAdminToken) {
      missing.push('MATRIX_ADMIN_TOKEN');
    }
    if (missing.length > 0) {
      throw new Error(
        `PLATFORM_MODE=matrix requires: ${missing.join(', ')}. ` +
          'Set the Synapse/mautrix configuration or switch PLATFORM_MODE.'
      );
    }
  }

  // #96: never silently default to 'direct' in production. An unset
  // PLATFORM_MODE there is almost always a misconfiguration.
  if (env.nodeEnv === 'production' && !env.mockBridge && !env.platformModeExplicit) {
    throw new Error(
      'PLATFORM_MODE must be set explicitly in production (matrix|direct). ' +
        'Refusing to default to direct mode. Set PLATFORM_MODE=matrix with the ' +
        'Synapse/mautrix configuration, or PLATFORM_MODE=direct to opt in deliberately.'
    );
  }
}
