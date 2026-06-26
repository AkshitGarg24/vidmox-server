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

  private generateKey(): { plainTextKey: string; keyId: string } {
    const keyId = randomUUID().replace(/-/g, '');
    const secret = randomBytes(32).toString('base64url');
    const plainTextKey = `VMX_${keyId}_${secret}`;
    return { plainTextKey, keyId };
  }

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

  async listApiKeys(userId: string) {
    return await this.apiKeyRepository.listApiKeys(userId);
  }

  async deleteApiKey(userId: string, keyId: string) {
    await this.apiKeyRepository.deleteApiKey(userId, keyId);
    await this.redis.del(`vmx:api_key:${VERSION}:${keyId}`);
    this.localCache.delete(`${VERSION}:${keyId}`);
  }

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
