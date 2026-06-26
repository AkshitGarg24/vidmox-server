import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from './apikey.service';
import { ApiKeyRepository } from './apikey.repository';
import { REDIS_CLIENT } from 'src/infra/redis.module';
import { API_KEY_CACHE, CachedKey } from 'src/infra/apiKeyCache.module';
import { LAST_USED_HASH, VERSION } from 'src/configs/constants';
import { BadRequestException } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('mocked-hash-value'),
  argon2id: 2,
}));

import * as argon2 from 'argon2';

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  const mockUserId = 'test-user-id';
  const mockKeyId = 'test-key-id';

  const createApiKey = jest.fn();
  const listApiKeys = jest.fn();
  const deleteApiKey = jest.fn();
  const getApikey = jest.fn();
  const countApiKeys = jest.fn();

  const mockRepository = {
    countApiKeys,
    createApiKey,
    listApiKeys,
    deleteApiKey,
    getApikey,
  } as unknown as jest.Mocked<ApiKeyRepository>;

  const redisHget = jest.fn();
  const redisDel = jest.fn();

  const mockRedis = {
    hget: redisHget,
    del: redisDel,
  } as unknown as jest.Mocked<Redis>;

  const localCacheDelete = jest.fn();

  const mockLocalCache = {
    delete: localCacheDelete,
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(),
  } as unknown as jest.Mocked<LRUCache<string, CachedKey>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: ApiKeyRepository, useValue: mockRepository },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: API_KEY_CACHE, useValue: mockLocalCache },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createApiKey', () => {
    it('should create a new API key and return the plain text key', async () => {
      mockRepository.countApiKeys.mockResolvedValue(0);

      const result = await service.createApiKey(mockUserId);

      expect(result).toHaveProperty('key');
      expect(result.key).toMatch(/^VMX_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/);
    });

    it('should throw BadRequestException when user already has 5 keys', async () => {
      mockRepository.countApiKeys.mockResolvedValue(5);

      await expect(service.createApiKey(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createApiKey(mockUserId)).rejects.toThrow(
        'You have reached the maximum limit of 5 API keys allowed',
      );
    });

    it('should throw BadRequestException when user already has more than 5 keys', async () => {
      mockRepository.countApiKeys.mockResolvedValue(10);

      await expect(service.createApiKey(mockUserId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should call argon2.hash with the generated plain text key and argon2id options', async () => {
      mockRepository.countApiKeys.mockResolvedValue(0);
      (argon2.hash as jest.Mock).mockClear();

      await service.createApiKey(mockUserId);

      expect(argon2.hash).toHaveBeenCalledTimes(1);
      const [calledKey, calledOptions] = (argon2.hash as jest.Mock).mock
        .calls[0] as [string, object];
      expect(calledKey).toMatch(/^VMX_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/);
      expect(calledOptions).toEqual({
        type: 2,
        timeCost: 3,
        memoryCost: 1 << 16,
        parallelism: 1,
      });
    });

    it('should call repository.createApiKey with correct arguments', async () => {
      mockRepository.countApiKeys.mockResolvedValue(0);

      await service.createApiKey(mockUserId);

      expect(createApiKey).toHaveBeenCalledTimes(1);
      const [userId, keyId, hash, prefix] =
        mockRepository.createApiKey.mock.calls[0];
      expect(userId).toBe(mockUserId);
      expect(keyId).toMatch(/^[a-f0-9]{32}$/);
      expect(hash).toBe('mocked-hash-value');
      expect(prefix).toMatch(/^.{18}\.\.\.$/);
    });

    it('should not create a key when countApiKeys fails', async () => {
      const error = new Error('Database error');
      mockRepository.countApiKeys.mockRejectedValue(error);

      await expect(service.createApiKey(mockUserId)).rejects.toThrow(error);
      expect(createApiKey).not.toHaveBeenCalled();
    });
  });

  describe('listApiKeys', () => {
    it('should return all API keys for a user', async () => {
      const mockKeys = [
        { id: 'key-1', prefix: 'VMX_abc...', createdAt: new Date() },
        { id: 'key-2', prefix: 'VMX_def...', createdAt: new Date() },
      ];
      mockRepository.listApiKeys.mockResolvedValue(mockKeys as never);

      const result = await service.listApiKeys(mockUserId);

      expect(result).toEqual(mockKeys);
      expect(listApiKeys).toHaveBeenCalledWith(mockUserId);
    });

    it('should return an empty array when user has no API keys', async () => {
      mockRepository.listApiKeys.mockResolvedValue([]);

      const result = await service.listApiKeys(mockUserId);

      expect(result).toEqual([]);
    });

    it('should propagate repository errors', async () => {
      const error = new Error('Database error');
      mockRepository.listApiKeys.mockRejectedValue(error);

      await expect(service.listApiKeys(mockUserId)).rejects.toThrow(error);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete the API key from repository', async () => {
      mockRepository.deleteApiKey.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(1);

      await service.deleteApiKey(mockUserId, mockKeyId);

      expect(deleteApiKey).toHaveBeenCalledWith(mockUserId, mockKeyId);
    });

    it('should clear the Redis cache with the correct key pattern', async () => {
      mockRepository.deleteApiKey.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(1);

      await service.deleteApiKey(mockUserId, mockKeyId);

      expect(redisDel).toHaveBeenCalledWith(
        `vmx:api_key:${VERSION}:${mockKeyId}`,
      );
    });

    it('should clear the local LRU cache with the correct key pattern', async () => {
      mockRepository.deleteApiKey.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(1);

      await service.deleteApiKey(mockUserId, mockKeyId);

      expect(localCacheDelete).toHaveBeenCalledWith(`${VERSION}:${mockKeyId}`);
    });

    it('should perform all three cleanup actions', async () => {
      mockRepository.deleteApiKey.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(1);

      await service.deleteApiKey(mockUserId, mockKeyId);

      expect(deleteApiKey).toHaveBeenCalledTimes(1);
      expect(redisDel).toHaveBeenCalledTimes(1);
      expect(localCacheDelete).toHaveBeenCalledTimes(1);
    });

    it('should propagate repository errors in deleteApiKey', async () => {
      const error = new Error('Delete failed');
      mockRepository.deleteApiKey.mockRejectedValue(error);

      await expect(service.deleteApiKey(mockUserId, mockKeyId)).rejects.toThrow(
        error,
      );
      expect(redisDel).not.toHaveBeenCalled();
      expect(localCacheDelete).not.toHaveBeenCalled();
    });
  });

  describe('getLastUsed', () => {
    it('should return lastUsedAt from Redis cache when available', async () => {
      const timestamp = Date.now();
      mockRedis.hget.mockResolvedValue(String(timestamp));

      const result = await service.getLastUsed(mockUserId, mockKeyId);

      expect(redisHget).toHaveBeenCalledWith(
        LAST_USED_HASH,
        `${mockUserId}:${mockKeyId}`,
      );
      expect(result).toEqual({ lastUsedAt: new Date(timestamp) });
    });

    it('should fall back to repository when Redis has no value', async () => {
      const lastUsedDate = new Date('2025-01-01T00:00:00Z');
      mockRedis.hget.mockResolvedValue(null);
      mockRepository.getApikey.mockResolvedValue({
        id: mockKeyId,
        userId: mockUserId,
        prefix: 'VMX_abc...',
        value: 'hash',
        lastUsedAt: lastUsedDate,
        createdAt: new Date(),
        revokedAt: null,
      });

      const result = await service.getLastUsed(mockUserId, mockKeyId);

      expect(getApikey).toHaveBeenCalledWith(mockUserId, mockKeyId);
      expect(result).toEqual({ lastUsedAt: lastUsedDate });
    });

    it('should throw BadRequestException when key is not found in either source', async () => {
      mockRedis.hget.mockResolvedValue(null);
      mockRepository.getApikey.mockResolvedValue(null);

      await expect(service.getLastUsed(mockUserId, mockKeyId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getLastUsed(mockUserId, mockKeyId)).rejects.toThrow(
        'Key not found',
      );
    });

    it('should not query repository when Redis has the value', async () => {
      mockRedis.hget.mockResolvedValue(String(Date.now()));

      await service.getLastUsed(mockUserId, mockKeyId);

      expect(getApikey).not.toHaveBeenCalled();
    });

    it('should parse Redis timestamp string as milliseconds', async () => {
      const timestamp = 1700000000000;
      mockRedis.hget.mockResolvedValue(String(timestamp));

      const result = await service.getLastUsed(mockUserId, mockKeyId);

      expect(result.lastUsedAt!.getTime()).toBe(timestamp);
    });

    it('should propagate repository errors in getLastUsed', async () => {
      const error = new Error('Database error');
      mockRedis.hget.mockResolvedValue(null);
      mockRepository.getApikey.mockRejectedValue(error);

      await expect(service.getLastUsed(mockUserId, mockKeyId)).rejects.toThrow(
        error,
      );
    });
  });
});
