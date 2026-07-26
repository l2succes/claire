/**
 * Unit tests for server/src/utils/crypto.ts
 *
 * Tests encrypt/decrypt round-trip, ciphertext opacity, and error paths.
 * Passes the key directly so no environment setup is required.
 */

import { describe, it, expect } from 'bun:test';
import { encrypt, decrypt } from '../../src/utils/crypto';

const KEY = 'testkey1testkey2testkey3testkey4'; // exactly 32 ASCII chars

describe('encrypt / decrypt', () => {
  it('round-trips a simple string', () => {
    const original = 'hello world';
    const ciphertext = encrypt(original, KEY);
    expect(decrypt(ciphertext, KEY)).toBe(original);
  });

  it('round-trips a JSON blob (session-like)', () => {
    const session = { id: 'sess-1', userId: 'user-1', platform: 'whatsapp', token: 's3cr3t' };
    const ciphertext = encrypt(JSON.stringify(session), KEY);
    const recovered = JSON.parse(decrypt(ciphertext, KEY));
    expect(recovered).toEqual(session);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const a = encrypt('same plaintext', KEY);
    const b = encrypt('same plaintext', KEY);
    expect(a).not.toBe(b);
  });

  it('ciphertext does not contain the plaintext', () => {
    const secret = 'super-secret-token-12345';
    const ciphertext = encrypt(secret, KEY);
    expect(ciphertext).not.toContain(secret);
  });

  it('ciphertext has the expected iv:authTag:data format', () => {
    const ciphertext = encrypt('test', KEY);
    const parts = ciphertext.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // authTag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const ciphertext = encrypt('original', KEY);
    const parts = ciphertext.split(':');
    const lastChar = parts[2].slice(-1);
    parts[2] = parts[2].slice(0, -1) + (lastChar === 'a' ? 'b' : 'a');
    expect(() => decrypt(parts.join(':'), KEY)).toThrow();
  });

  it('throws on malformed input (wrong number of segments)', () => {
    expect(() => decrypt('notvalid', KEY)).toThrow('Invalid encrypted format');
  });

  it('throws when key has wrong length', () => {
    expect(() => encrypt('test', 'tooshort')).toThrow('ENCRYPTION_KEY must be');
  });

  it('accepts a 64-char hex key', () => {
    const hexKey = '0'.repeat(64); // 256-bit zero key
    const ciphertext = encrypt('test', hexKey);
    expect(decrypt(ciphertext, hexKey)).toBe('test');
  });
});
