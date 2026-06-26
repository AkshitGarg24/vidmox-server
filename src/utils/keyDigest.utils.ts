import crypto from 'crypto';

export function digest(str: string): string {
  const secret = process.env.REDIS_KEY_SECRET || '';
  return crypto.createHmac('sha256', secret).update(str).digest('hex');
}
