import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ApiKeyRepository } from './apikey.repository';
import { randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { REDIS_CLIENT } from 'src/infra/redis.module';
import Redis from 'ioredis';
import { LAST_USED_HASH, VERSION } from 'src/configs/constants';
import { API_KEY_CACHE, CachedKey } from 'src/infra/apiKeyCache.module';
import { LRUCache } from 'lru-cache';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(API_KEY_CACHE)
    private readonly localCache: LRUCache<string, CachedKey>,
  ) {}

  /**
   * Generate a new API key pair.
   *
   * Format: `VMX_{keyId}_{secret}`
   *   - The **prefix** (`VMX_{keyId}`) is stored in the DB and shown in
   *     listings so users can identify their keys.
   *   - The **secret** (256 bits, base64url-encoded) is the security-sensitive
   *     portion — only the Argon2id hash is persisted.
   */
  private generateKey(): { plainTextKey: string; keyId: string } {
    const keyId = randomUUID().replace(/-/g, '');
    const secret = randomBytes(32).toString('base64url');
    const plainTextKey = `VMX_${keyId}_${secret}`;
    return { plainTextKey, keyId };
  }

  /**
   * Create a new API key for a user.
   *
   * Enforces a **per-user limit of 5 active (non-revoked) keys**. The
   * plain-text key is hashed with Argon2id (memory-hard, tuned for UI-bound
   * request latency) before being stored. A human-readable prefix is derived
   * and saved alongside the hash so the user can identify the key later.
   *
   * The plain-text value is returned **only once** in the response — it is
   * never persisted in any store.
   */
  async createApiKey(userId: string) {
    const apiKeysCount = await this.apiKeyRepository.countApiKeys(userId);
    if (apiKeysCount >= 5) {
      throw new BadRequestException(
        'You have reached the maximum limit of 5 API keys allowed',
      );
    }

    const { plainTextKey, keyId } = this.generateKey();
    const hash = await argon2.hash(plainTextKey, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 1 << 16,
      parallelism: 1,
    });

    const prefix = plainTextKey.substring(0, 18) + '...';
    await this.apiKeyRepository.createApiKey(userId, keyId, hash, prefix);

    return {
      key: plainTextKey,
    };
  }

  /**
   * List all non-revoked API keys for a user.
   *
   * Returns metadata (prefix, timestamps) — never the hash or plain-text key.
   */
  async listApiKeys(userId: string) {
    return await this.apiKeyRepository.listApiKeys(userId);
  }

  /**
   * Revoke (soft-delete) an API key.
   *
   * Clears the key from all three stores so it is rejected immediately:
   *   1. Database — sets `revokedAt` (soft-delete).
   *   2. Redis — deletes the cached key lookup.
   *   3. Local LRU cache — evicts the entry.
   */
  async deleteApiKey(userId: string, keyId: string) {
    await this.apiKeyRepository.deleteApiKey(userId, keyId);
    await this.redis.del(`vmx:api_key:${VERSION}:${keyId}`);
    this.localCache.delete(`${VERSION}:${keyId}`);
  }

  /**
   * Get the last-used timestamp for a given API key.
   *
   * Two-tier lookup:
   *   1. **Redis hash** (key `vmx:api_key:last_used`) — written by the
   *      auth guard on every successful key-based request. Fast but may
   *      lag behind the DB during cron flush cycles.
   *   2. **Database** — the authoritative source. Falls back here when
   *      Redis has no entry (e.g. after a cache flush).
   *
   * Throws if the key does not exist or has been revoked.
   */
  async getLastUsed(userId: string, keyId: string) {
    const redisValue = await this.redis.hget(
      LAST_USED_HASH,
      `${userId}:${keyId}`,
    );
    if (redisValue) {
      return {
        lastUsedAt: new Date(Number(redisValue)),
      };
    }

    const record = await this.apiKeyRepository.getApikey(userId, keyId);
    if (record) {
      return {
        lastUsedAt: record.lastUsedAt,
      };
    } else {
      throw new BadRequestException('Key not found');
    }
  }
}
