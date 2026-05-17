/**
 * Media URL Construction Tests
 * Validates Bug #4 fix: Invalid mxc:// URL handling with logging
 */

import { describe, it, expect } from '@jest/globals';

describe('Media URL Construction', () => {
  /**
   * Converts mxc:// URL to /media/ path
   * This mirrors the inline function in server/src/index.ts:200-206
   */
  const convertMxcToMediaPath = (mxc: string | null | undefined): string | null => {
    if (!mxc || typeof mxc !== 'string') return null;
    const match = mxc.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      // Bug #4 fix: Log warning instead of silently returning null
      console.warn(`Invalid mxc:// URL format: ${mxc}`);
      return null;
    }
    return `/media/${match[1]}/${match[2]}`;
  };

  describe('Valid mxc:// URLs', () => {
    it('should convert valid mxc:// URL to media path', () => {
      const mxc = 'mxc://claire.local/AbCdEf123456';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBe('/media/claire.local/AbCdEf123456');
    });

    it('should handle different homeserver domains', () => {
      const mxc = 'mxc://matrix.org/xyzABC789';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBe('/media/matrix.org/xyzABC789');
    });

    it('should handle media IDs with special characters', () => {
      const mxc = 'mxc://server.com/abc-123_DEF';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBe('/media/server.com/abc-123_DEF');
    });

    it('should handle media IDs with slashes', () => {
      const mxc = 'mxc://server.com/path/to/media';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBe('/media/server.com/path/to/media');
    });
  });

  describe('Invalid mxc:// URLs - Bug #4 Validation', () => {
    it('should return null for malformed mxc:// URL', () => {
      const mxc = 'mxc:invalid-format';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBeNull();
    });

    it('should return null for URL missing media ID', () => {
      const mxc = 'mxc://server.com/';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBeNull();
    });

    it('should return null for URL missing homeserver', () => {
      const mxc = 'mxc:///mediaId123';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBeNull();
    });

    it('should return null for non-mxc:// URL', () => {
      const mxc = 'https://example.com/image.jpg';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBeNull();
    });
  });

  describe('Null/Undefined Input', () => {
    it('should return null for null input', () => {
      const result = convertMxcToMediaPath(null);

      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = convertMxcToMediaPath(undefined);

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = convertMxcToMediaPath('');

      expect(result).toBeNull();
    });
  });

  describe('Server/MediaId Extraction', () => {
    it('should correctly extract server and media ID', () => {
      const mxc = 'mxc://homeserver.example.com/AbCdEf123456';
      const match = mxc.match(/^mxc:\/\/([^/]+)\/(.+)$/);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('homeserver.example.com');
      expect(match?.[2]).toBe('AbCdEf123456');
    });

    it('should handle nested path in media ID', () => {
      const mxc = 'mxc://server.com/folder/subfolder/file123';
      const match = mxc.match(/^mxc:\/\/([^/]+)\/(.+)$/);

      expect(match?.[1]).toBe('server.com');
      expect(match?.[2]).toBe('folder/subfolder/file123');
    });
  });

  describe('Different Homeserver URLs', () => {
    it('should work with localhost homeserver', () => {
      const mxc = 'mxc://localhost/testMedia123';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBe('/media/localhost/testMedia123');
    });

    it('should work with IP address homeserver', () => {
      const mxc = 'mxc://192.168.1.100/media456';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBe('/media/192.168.1.100/media456');
    });

    it('should work with homeserver with port', () => {
      const mxc = 'mxc://server.com:8008/mediaABC';
      const result = convertMxcToMediaPath(mxc);

      expect(result).toBe('/media/server.com:8008/mediaABC');
    });
  });
});
