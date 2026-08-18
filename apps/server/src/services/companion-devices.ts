import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Device credentials are intentionally opaque bearer secrets. They are only
 * returned at enrolment/rotation, while the database holds a SHA-256 digest.
 */
export function createDeviceCredential(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDeviceCredential(credential: string): string {
  return createHash('sha256').update(credential).digest('hex');
}

export function matchesDeviceCredential(credential: string, storedHash: string): boolean {
  const supplied = Buffer.from(hashDeviceCredential(credential), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return supplied.length === stored.length && timingSafeEqual(supplied, stored);
}
