/**
 * Encryption utilities for platform session/token blobs at rest.
 *
 * Uses Node.js built-in `crypto` (AES-256-GCM) with the ENCRYPTION_KEY env var.
 * The encrypted format is: `<iv-hex>:<authTag-hex>:<ciphertext-hex>` (colon-separated).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

/**
 * Derive a 32-byte key buffer from a key string.
 * Accepts exactly 32 ASCII chars (256-bit) or a 64-char hex string.
 */
function toKeyBuffer(keyStr: string): Buffer {
  if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
    return Buffer.from(keyStr, 'hex');
  }
  if (keyStr.length === 32) {
    return Buffer.from(keyStr, 'utf8');
  }
  throw new Error(
    `ENCRYPTION_KEY must be 32 ASCII characters or a 64-character hex string (got length ${keyStr.length})`
  );
}

function resolveKey(overrideKey?: string): Buffer {
  const raw = overrideKey ?? process.env.ENCRYPTION_KEY ?? '';
  return toKeyBuffer(raw);
}

/**
 * Encrypt a plaintext string.
 * Returns a colon-separated string: `<iv>:<authTag>:<ciphertext>` (all hex).
 *
 * @param plaintext  - String to encrypt.
 * @param keyStr     - Optional key override (32-char ASCII or 64-char hex).
 *                     Defaults to `process.env.ENCRYPTION_KEY`.
 */
export function encrypt(plaintext: string, keyStr?: string): string {
  const key = resolveKey(keyStr);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a string produced by `encrypt()`.
 * Returns the original plaintext, or throws on invalid data / bad key.
 *
 * @param ciphertext - Encrypted string (`<iv>:<authTag>:<data>`).
 * @param keyStr     - Optional key override. Defaults to `process.env.ENCRYPTION_KEY`.
 */
export function decrypt(ciphertext: string, keyStr?: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format: expected <iv>:<authTag>:<data>');
  }
  const [ivHex, authTagHex, dataHex] = parts;
  const key = resolveKey(keyStr);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
