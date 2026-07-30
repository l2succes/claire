/**
 * Unit tests for platform-mode validation (#96).
 */

import { describe, it, expect } from 'bun:test';
import {
  validatePlatformMode,
  resolvePlatformMode,
  type PlatformModeEnv,
} from './platform-mode';

function env(overrides: Partial<PlatformModeEnv> = {}): PlatformModeEnv {
  return {
    nodeEnv: 'development',
    platformMode: 'direct',
    platformModeExplicit: true,
    mockBridge: false,
    matrixHomeserverUrl: undefined,
    matrixServerName: undefined,
    matrixAdminToken: undefined,
    ...overrides,
  };
}

const FULL_MATRIX = {
  platformMode: 'matrix' as const,
  matrixHomeserverUrl: 'https://matrix.example.com',
  matrixServerName: 'example.com',
  matrixAdminToken: 'secret-token',
};

describe('resolvePlatformMode', () => {
  it('returns mock when the mock bridge is enabled', () => {
    expect(resolvePlatformMode({ mockBridge: true, platformMode: 'matrix' })).toBe('mock');
  });
  it('returns the platform mode otherwise', () => {
    expect(resolvePlatformMode({ mockBridge: false, platformMode: 'matrix' })).toBe('matrix');
    expect(resolvePlatformMode({ mockBridge: false, platformMode: 'direct' })).toBe('direct');
  });
});

describe('validatePlatformMode', () => {
  describe('matrix mode config', () => {
    it('accepts a fully-configured matrix mode', () => {
      expect(() => validatePlatformMode(env(FULL_MATRIX))).not.toThrow();
    });

    it('throws when the homeserver URL is missing', () => {
      expect(() =>
        validatePlatformMode(env({ ...FULL_MATRIX, matrixHomeserverUrl: undefined }))
      ).toThrow(/MATRIX_HOMESERVER_URL/);
    });

    it('requires the admin token only in production', () => {
      const noToken = { ...FULL_MATRIX, matrixAdminToken: undefined };
      expect(() => validatePlatformMode(env({ ...noToken, nodeEnv: 'development' }))).not.toThrow();
      expect(() => validatePlatformMode(env({ ...noToken, nodeEnv: 'production' }))).toThrow(
        /MATRIX_ADMIN_TOKEN/
      );
    });
  });

  describe('production direct-mode guard (#96)', () => {
    it('throws when production would default to direct silently', () => {
      expect(() =>
        validatePlatformMode(
          env({ nodeEnv: 'production', platformMode: 'direct', platformModeExplicit: false })
        )
      ).toThrow(/PLATFORM_MODE must be set explicitly/);
    });

    it('allows explicit direct mode in production', () => {
      expect(() =>
        validatePlatformMode(
          env({ nodeEnv: 'production', platformMode: 'direct', platformModeExplicit: true })
        )
      ).not.toThrow();
    });

    it('allows the default direct mode outside production', () => {
      expect(() =>
        validatePlatformMode(
          env({ nodeEnv: 'development', platformMode: 'direct', platformModeExplicit: false })
        )
      ).not.toThrow();
    });

    it('exempts mock-bridge mode from the guard', () => {
      expect(() =>
        validatePlatformMode(
          env({ nodeEnv: 'production', platformMode: 'direct', platformModeExplicit: false, mockBridge: true })
        )
      ).not.toThrow();
    });

    it('accepts explicit matrix mode in production', () => {
      expect(() =>
        validatePlatformMode(env({ ...FULL_MATRIX, nodeEnv: 'production', platformModeExplicit: true }))
      ).not.toThrow();
    });
  });
});
