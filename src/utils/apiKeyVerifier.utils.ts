export function extractKeyId(plainKey: string): string | null {
  if (!plainKey || !plainKey.startsWith('VMX_')) return null;
  const parts = plainKey.split('_');
  if (parts.length != 3) return null;
  const keyId = parts[1];
  if (!/^[0-9a-fA-F]{32}$/.test(keyId)) return null;
  return keyId;
}
