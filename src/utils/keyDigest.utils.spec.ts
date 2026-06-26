import { digest } from './keyDigest.utils';
import crypto from 'crypto';

describe('digest', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('return value format', () => {
    it('should return a string', () => {
      const result = digest('test-input');
      expect(typeof result).toBe('string');
    });

    it('should return a 64-character hex string (SHA-256 output)', () => {
      const result = digest('test-input');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return only lowercase hex characters', () => {
      const result = digest('some-api-key');
      expect(result).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('determinism', () => {
    it('should return the same value for the same input on repeated calls', () => {
      const input = 'VMX_abcdef1234567890abcdef1234567890_secret';
      const first = digest(input);
      const second = digest(input);
      expect(first).toBe(second);
    });

    it('should return the same value regardless of call order for distinct inputs', () => {
      const result1 = digest('input-a');
      const result2 = digest('input-b');
      const result3 = digest('input-a');
      expect(result1).toBe(result3);
      expect(result1).not.toBe(result2);
    });
  });

  describe('sensitivity to input changes', () => {
    it('should return different values for different inputs', () => {
      expect(digest('input-a')).not.toBe(digest('input-b'));
    });

    it('should be case-sensitive — uppercase and lowercase inputs differ', () => {
      expect(digest('Hello')).not.toBe(digest('hello'));
    });

    it('should produce a different digest when a single character changes', () => {
      expect(digest('VMX_key1_secret')).not.toBe(digest('VMX_key2_secret'));
    });

    it('should produce a different digest for an empty string vs a non-empty string', () => {
      expect(digest('')).not.toBe(digest('a'));
    });
  });

  describe('REDIS_KEY_SECRET environment variable', () => {
    it('should work when REDIS_KEY_SECRET is not set (uses empty string as secret)', () => {
      delete process.env['REDIS_KEY_SECRET'];
      const result = digest('test');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce consistent output when REDIS_KEY_SECRET is empty string', () => {
      process.env['REDIS_KEY_SECRET'] = '';
      const r1 = digest('test');
      const r2 = digest('test');
      expect(r1).toBe(r2);
    });

    it('should produce same output with undefined secret as with empty string secret', () => {
      process.env['REDIS_KEY_SECRET'] = '';
      const withEmpty = digest('test');

      delete process.env['REDIS_KEY_SECRET'];
      const withUndefined = digest('test');

      // Both use '' as the HMAC secret (via the || '' fallback)
      expect(withEmpty).toBe(withUndefined);
    });

    it('should produce a different digest when REDIS_KEY_SECRET changes', () => {
      process.env['REDIS_KEY_SECRET'] = 'secret-a';
      const withSecretA = digest('api-key');

      process.env['REDIS_KEY_SECRET'] = 'secret-b';
      const withSecretB = digest('api-key');

      expect(withSecretA).not.toBe(withSecretB);
    });

    it('should match a manually computed HMAC-SHA256 with a known secret', () => {
      const knownSecret = 'test-secret-key';
      const knownInput = 'VMX_abcdef1234567890abcdef1234567890_testtoken';
      process.env['REDIS_KEY_SECRET'] = knownSecret;

      const expected = crypto
        .createHmac('sha256', knownSecret)
        .update(knownInput)
        .digest('hex');

      const result = digest(knownInput);
      expect(result).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string input', () => {
      const result = digest('');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle very long input strings', () => {
      const longInput = 'VMX_' + 'a'.repeat(10000) + '_secret';
      const result = digest(longInput);
      expect(result).toHaveLength(64);
    });

    it('should handle input with special characters', () => {
      const result = digest('key with spaces & special chars: <>"{}');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle unicode characters in input', () => {
      const result = digest('key-with-unicode-\u00e9\u00e0\u00fc');
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce a stable known digest value', () => {
      // Regression test: verify specific known output does not change
      process.env['REDIS_KEY_SECRET'] = '';
      const result = digest('test');
      // HMAC-SHA256 of 'test' with empty key, confirmed value
      const expected = crypto
        .createHmac('sha256', '')
        .update('test')
        .digest('hex');
      expect(result).toBe(expected);
    });
  });
});