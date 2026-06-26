import { extractKeyId } from './apiKeyVerifier.utils';

describe('extractKeyId', () => {
  it('should extract keyId from standard key', () => {
    const key = 'VMX_abcdef1234567890abcdef1234567890_secretbase64';
    expect(extractKeyId(key)).toBe('abcdef1234567890abcdef1234567890');
  });

  it('should extract keyId when secret contains underscores', () => {
    const key = 'VMX_abcdef1234567890abcdef1234567890_secret_with_underscores';
    expect(extractKeyId(key)).toBe('abcdef1234567890abcdef1234567890');
  });

  it('should extract keyId when secret contains trailing underscore', () => {
    const key = 'VMX_abcdef1234567890abcdef1234567890_secret_';
    expect(extractKeyId(key)).toBe('abcdef1234567890abcdef1234567890');
  });

  it('should return null for empty string', () => {
    expect(extractKeyId('')).toBeNull();
  });

  it('should return null for missing VMX_ prefix', () => {
    const key = 'abc_abcdef1234567890abcdef1234567890_secret';
    expect(extractKeyId(key)).toBeNull();
  });

  it('should return null when keyId is not 32 hex chars', () => {
    const key = 'VMX_too-short_secret';
    expect(extractKeyId(key)).toBeNull();
  });

  it('should return null when keyId contains non-hex characters', () => {
    const key = 'VMX_abcdef1234567890abcdef123456789g_secret';
    expect(extractKeyId(key)).toBeNull();
  });

  it('should return null when there is no underscore after prefix', () => {
    const key = 'VMX_abcdef1234567890abcdef1234567890';
    expect(extractKeyId(key)).toBeNull();
  });

  it('should return null when plainKey is undefined or null', () => {
    expect(extractKeyId(null as unknown as string)).toBeNull();
    expect(extractKeyId(undefined as unknown as string)).toBeNull();
  });

  it('should handle uppercase hex in keyId', () => {
    const key = 'VMX_ABCDEF1234567890ABCDEF1234567890_secret';
    expect(extractKeyId(key)).toBe('ABCDEF1234567890ABCDEF1234567890');
  });
});
