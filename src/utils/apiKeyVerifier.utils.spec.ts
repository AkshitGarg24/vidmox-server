import { extractKeyId } from './apiKeyVerifier.utils';

describe('extractKeyId', () => {
  const validKeyId = 'abcdef1234567890abcdef1234567890'; // 32 hex chars
  const validSecret = 'some_base64url_secret_value_here_43';
  const validKey = `VMX_${validKeyId}_${validSecret}`;

  describe('valid keys', () => {
    it('should return the keyId from a valid API key', () => {
      const result = extractKeyId(validKey);
      expect(result).toBe(validKeyId);
    });

    it('should accept lowercase hex characters in keyId', () => {
      const lowercaseId = 'abcdef1234567890abcdef1234567890';
      const key = `VMX_${lowercaseId}_secret`;
      expect(extractKeyId(key)).toBe(lowercaseId);
    });

    it('should accept uppercase hex characters in keyId', () => {
      const uppercaseId = 'ABCDEF1234567890ABCDEF1234567890';
      const key = `VMX_${uppercaseId}_secret`;
      expect(extractKeyId(key)).toBe(uppercaseId);
    });

    it('should accept mixed-case hex characters in keyId', () => {
      const mixedId = 'AbCdEf1234567890aBcDeF1234567890';
      const key = `VMX_${mixedId}_secret`;
      expect(extractKeyId(key)).toBe(mixedId);
    });

    it('should return only the middle segment (keyId), not the prefix or secret', () => {
      const result = extractKeyId(validKey);
      expect(result).not.toContain('VMX_');
      expect(result).not.toContain(validSecret);
    });

    it('should handle a realistic key format from apikey.service.ts', () => {
      // VMX_ + 32-char UUID without dashes + _ + base64url 43-char secret
      const realisticId = '4f3e2d1c0b9a8f7e6d5c4b3a29180716';
      const realisticSecret = 'dGVzdC1zZWNyZXQtYmFzZTY0dXJsLXZhbHVlLWhl';
      const key = `VMX_${realisticId}_${realisticSecret}`;
      expect(extractKeyId(key)).toBe(realisticId);
    });
  });

  describe('invalid prefix', () => {
    it('should return null for keys without VMX_ prefix', () => {
      expect(extractKeyId(`${validKeyId}_${validSecret}`)).toBeNull();
    });

    it('should return null for keys with lowercase vmx_ prefix', () => {
      expect(extractKeyId(`vmx_${validKeyId}_${validSecret}`)).toBeNull();
    });

    it('should return null for keys with a different prefix', () => {
      expect(extractKeyId(`API_${validKeyId}_${validSecret}`)).toBeNull();
    });

    it('should return null when the key starts with a space before VMX_', () => {
      expect(extractKeyId(` VMX_${validKeyId}_${validSecret}`)).toBeNull();
    });
  });

  describe('invalid structure', () => {
    it('should return null when there are only 2 parts (missing secret)', () => {
      expect(extractKeyId(`VMX_${validKeyId}`)).toBeNull();
    });

    it('should return null when there are more than 3 parts', () => {
      expect(extractKeyId(`VMX_${validKeyId}_secret_extra`)).toBeNull();
    });

    it('should return null for a key with 4 underscore-separated parts', () => {
      expect(extractKeyId(`VMX_${validKeyId}_secret_extra_part`)).toBeNull();
    });

    it('should return null for a key with only the prefix', () => {
      expect(extractKeyId('VMX_')).toBeNull();
    });

    it('should return null for just the prefix and underscore', () => {
      expect(extractKeyId('VMX__')).toBeNull();
    });
  });

  describe('invalid keyId format', () => {
    it('should return null when keyId is shorter than 32 hex chars', () => {
      const shortId = 'abcdef123456'; // only 12 chars
      expect(extractKeyId(`VMX_${shortId}_${validSecret}`)).toBeNull();
    });

    it('should return null when keyId is longer than 32 hex chars', () => {
      const longId = 'abcdef1234567890abcdef1234567890ff'; // 34 chars
      expect(extractKeyId(`VMX_${longId}_${validSecret}`)).toBeNull();
    });

    it('should return null when keyId contains non-hex characters', () => {
      const nonHexId = 'gggggg1234567890abcdef1234567890'; // 'g' is not hex
      expect(extractKeyId(`VMX_${nonHexId}_${validSecret}`)).toBeNull();
    });

    it('should return null when keyId contains a dash (UUID format)', () => {
      const uuidId = '4f3e2d1c-0b9a-8f7e-6d5c-4b3a29180716'; // UUID with dashes
      expect(extractKeyId(`VMX_${uuidId}_${validSecret}`)).toBeNull();
    });

    it('should return null when keyId is empty string', () => {
      expect(extractKeyId(`VMX__${validSecret}`)).toBeNull();
    });

    it('should return null when keyId contains spaces', () => {
      const spacedId = 'abcdef12345678 0abcdef1234567890';
      expect(extractKeyId(`VMX_${spacedId}_${validSecret}`)).toBeNull();
    });
  });

  describe('falsy input', () => {
    it('should return null for empty string', () => {
      expect(extractKeyId('')).toBeNull();
    });

    it('should return null for null cast to string', () => {
      // The function parameter type is string, but guard against unexpected input
      expect(extractKeyId(null as unknown as string)).toBeNull();
    });

    it('should return null for undefined cast to string', () => {
      expect(extractKeyId(undefined as unknown as string)).toBeNull();
    });
  });

  describe('boundary / regression cases', () => {
    it('should return null for a key that is exactly the prefix with no underscores after', () => {
      expect(extractKeyId('VMX_')).toBeNull();
    });

    it('should accept all-digits keyId of exactly 32 chars', () => {
      const allDigits = '12345678901234567890123456789012';
      expect(extractKeyId(`VMX_${allDigits}_secret`)).toBe(allDigits);
    });

    it('should accept all-f keyId of exactly 32 chars', () => {
      const allF = 'ffffffffffffffffffffffffffffffff';
      expect(extractKeyId(`VMX_VMX_${allF}_secret`)).toBeNull(); // extra part
      expect(extractKeyId(`VMX_${allF}_secret`)).toBe(allF);
    });

    it('should return null for a keyId that is exactly 31 chars (one short)', () => {
      const shortId = 'abcdef1234567890abcdef123456789'; // 31 chars
      expect(extractKeyId(`VMX_${shortId}_secret`)).toBeNull();
    });

    it('should return null for a keyId that is exactly 33 chars (one over)', () => {
      const longId = 'abcdef1234567890abcdef12345678900'; // 33 chars
      expect(extractKeyId(`VMX_${longId}_secret`)).toBeNull();
    });
  });
});