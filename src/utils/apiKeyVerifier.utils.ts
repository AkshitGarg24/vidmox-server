/**
 * Extracts a key ID from a VMX-formatted key string.
 *
 * @param plainKey - The key string to inspect.
 * @returns The 32-character hexadecimal key ID if the input matches the expected format, `null` otherwise.
 */
export function extractKeyId(plainKey: string): string | null {
  if (!plainKey || !plainKey.startsWith('VMX_')) return null;
  const afterPrefix = plainKey.slice(4);
  const firstUnderscore = afterPrefix.indexOf('_');
  if (firstUnderscore === -1) return null;
  if (firstUnderscore === afterPrefix.length - 1) return null;
  const keyId = afterPrefix.slice(0, firstUnderscore);
  if (!/^[0-9a-fA-F]{32}$/.test(keyId)) return null;
  return keyId;
}
