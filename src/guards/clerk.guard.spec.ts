import { Test, TestingModule } from '@nestjs/testing';
import { ClerkAuthGuard } from './clerk.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { REDIS_CLIENT } from 'src/infra/redis.module';
import { API_KEY_CACHE, CachedKey } from 'src/infra/apiKeyCache.module';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';
import {
  LAST_USED_DEBOUNCE_SEC,
  REDIS_HARD_TTL,
  VERSION,
} from 'src/configs/constants';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

jest.mock('argon2', () => ({
  verify: jest.fn(),
}));

jest.mock('src/utils/apiKeyVerifier.utils', () => ({
  extractKeyId: jest.fn(),
}));

jest.mock('src/utils/keyDigest.utils', () => ({
  digest: jest.fn().mockReturnValue('mocked-digest'),
}));

import { verifyToken } from '@clerk/backend';
import * as argon2 from 'argon2';
import { extractKeyId } from 'src/utils/apiKeyVerifier.utils';
import { digest } from 'src/utils/keyDigest.utils';

describe('ClerkAuthGuard', () => {
  let guard: ClerkAuthGuard;
  let mockRequest: {
    headers: Record<string, string>;
    user?: { id: string; [key: string]: unknown };
  };
  let mockFindFirst: jest.Mock;

  const mockKeyId = 'abcdef1234567890abcdef1234567890';
  const mockUserId = 'user-123';
  const mockDigest = 'mocked-digest';
  const mockContext: ExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as unknown as ExecutionContext;

  const redisSet = jest.fn();
  const redisHgetall = jest.fn();
  const redisHset = jest.fn();
  const redisExpire = jest.fn();

  const mockRedisInstance = {
    set: redisSet,
    hgetall: redisHgetall,
    hset: redisHset,
    expire: redisExpire,
  } as unknown as jest.Mocked<Redis>;

  const cacheGet = jest.fn();
  const cacheSet = jest.fn();

  const mockLocalCacheInstance = {
    get: cacheGet,
    set: cacheSet,
  } as unknown as jest.Mocked<LRUCache<string, CachedKey>>;

  const mockPrismaInstance = {
    apiKey: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockFindFirst = jest.fn();
    mockPrismaInstance.apiKey.findFirst = mockFindFirst;
    mockRequest = { headers: {}, user: undefined };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClerkAuthGuard,
        { provide: PrismaService, useValue: mockPrismaInstance },
        { provide: REDIS_CLIENT, useValue: mockRedisInstance },
        { provide: API_KEY_CACHE, useValue: mockLocalCacheInstance },
      ],
    }).compile();

    guard = module.get<ClerkAuthGuard>(ClerkAuthGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('API key authentication', () => {
    beforeEach(() => {
      mockRequest.headers['x-api-key'] = `VMX_${mockKeyId}_secretbase64`;
      (extractKeyId as jest.Mock).mockReturnValue(mockKeyId);
      (digest as jest.Mock).mockReturnValue(mockDigest);
    });

    it('should return true when LRU cache has valid entry with matching digest', async () => {
      mockLocalCacheInstance.get.mockReturnValue({
        userId: mockUserId,
        expiresAt: Date.now() + 100000,
        apiKeyDigest: mockDigest,
      });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.user).toEqual({ id: mockUserId, keyId: mockKeyId });
    });

    it('should fall through to Redis when LRU cache entry is expired', async () => {
      mockLocalCacheInstance.get.mockReturnValue({
        userId: mockUserId,
        expiresAt: Date.now() - 1000,
        apiKeyDigest: mockDigest,
      });
      mockRedisInstance.hgetall.mockResolvedValue({
        userId: mockUserId,
        apiKeyDigest: mockDigest,
      });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(cacheSet).toHaveBeenCalled();
      expect(mockRequest.user).toEqual({ id: mockUserId, keyId: mockKeyId });
    });

    it('should return true when Redis has valid userId with matching digest', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({
        userId: mockUserId,
        apiKeyDigest: mockDigest,
      });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(cacheSet).toHaveBeenCalledWith(`${VERSION}:${mockKeyId}`, {
        userId: mockUserId,
        expiresAt: expect.any(Number) as number,
        apiKeyDigest: mockDigest,
      });
      expect(mockRequest.user).toEqual({ id: mockUserId, keyId: mockKeyId });
    });

    it('should throw UnauthorizedException when Redis has invalid flag', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({ invalid: '1' });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid API key',
      );
    });

    it('should throw UnauthorizedException when Redis has mismatched digest', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({
        userId: mockUserId,
        apiKeyDigest: 'different-digest',
      });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid API key',
      );
    });

    it('should return true when DB lookup succeeds and argon2 verifies', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({});
      mockPrismaInstance.apiKey.findFirst.mockResolvedValue({
        id: mockKeyId,
        userId: mockUserId,
        prefix: 'VMX_...',
        value: 'argon2hash',
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(redisHset).toHaveBeenCalledWith(
        `vmx:api_key:${VERSION}:${mockKeyId}`,
        { userId: mockUserId, apiKeyDigest: mockDigest },
      );
      expect(redisExpire).toHaveBeenCalledWith(
        `vmx:api_key:${VERSION}:${mockKeyId}`,
        REDIS_HARD_TTL,
      );
      expect(mockRequest.user).toEqual({ id: mockUserId, keyId: mockKeyId });
    });

    it('should set Redis invalid and throw when argon2 verify fails', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({});
      mockPrismaInstance.apiKey.findFirst.mockResolvedValue({
        id: mockKeyId,
        userId: mockUserId,
        value: 'argon2hash',
      });
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(redisHset).toHaveBeenCalledWith(
        `vmx:api_key:${VERSION}:${mockKeyId}`,
        { invalid: '1' },
      );
      expect(redisExpire).toHaveBeenCalledWith(
        `vmx:api_key:${VERSION}:${mockKeyId}`,
        REDIS_HARD_TTL,
      );
    });

    it('should throw UnauthorizedException when key not found in DB', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({});
      mockPrismaInstance.apiKey.findFirst.mockResolvedValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid API key',
      );
    });

    it('should query DB with revokedAt: null filter', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({});
      mockPrismaInstance.apiKey.findFirst.mockResolvedValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockPrismaInstance.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: mockKeyId, revokedAt: null },
      });
    });

    it('should throw UnauthorizedException when extractKeyId returns null', async () => {
      (extractKeyId as jest.Mock).mockReturnValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid API key',
      );
    });

    it('should catch Prisma errors and rethrow as UnauthorizedException', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({});
      mockPrismaInstance.apiKey.findFirst.mockRejectedValue(
        new Error('Prisma connection failed'),
      );

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should catch Redis errors and rethrow as UnauthorizedException', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockRejectedValue(new Error('Redis timeout'));

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should catch argon2 errors and rethrow as UnauthorizedException', async () => {
      mockLocalCacheInstance.get.mockReturnValue(undefined);
      mockRedisInstance.hgetall.mockResolvedValue({});
      mockPrismaInstance.apiKey.findFirst.mockResolvedValue({
        id: mockKeyId,
        userId: mockUserId,
        value: 'argon2hash',
      });
      (argon2.verify as jest.Mock).mockRejectedValue(new Error('Argon2 error'));

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Clerk JWT authentication', () => {
    it('should return true with valid Bearer token', async () => {
      mockRequest.headers['authorization'] = 'Bearer valid-jwt-token';
      (verifyToken as jest.Mock).mockResolvedValue({
        sub: mockUserId,
        sid: 'session-id',
      });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user!.id).toBe(mockUserId);
    });

    it('should set id after spreading verifiedToken so id cannot be overridden', async () => {
      mockRequest.headers['authorization'] = 'Bearer valid-jwt-token';
      (verifyToken as jest.Mock).mockResolvedValue({
        sub: mockUserId,
        id: 'malicious-id',
      });

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.user!.id).toBe(mockUserId);
    });

    it('should throw UnauthorizedException when no token in authorization header', async () => {
      mockRequest.headers['authorization'] = 'Bearer ';

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Missing authentication token',
      );
    });

    it('should throw UnauthorizedException when token verification fails', async () => {
      mockRequest.headers['authorization'] = 'Bearer invalid-jwt-token';
      (verifyToken as jest.Mock).mockRejectedValue(
        new Error('Token verification failed'),
      );

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid authentication token',
      );
    });
  });

  describe('No authentication', () => {
    it('should throw UnauthorizedException when no auth header is present', async () => {
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Missing authentication token',
      );
    });
  });

  describe('trackApiKeyLastUsed', () => {
    it('should acquire lock and update last used hash on first call', async () => {
      mockRequest.headers['x-api-key'] = `VMX_${mockKeyId}_secret`;
      (extractKeyId as jest.Mock).mockReturnValue(mockKeyId);
      (digest as jest.Mock).mockReturnValue(mockDigest);
      mockLocalCacheInstance.get.mockReturnValue({
        userId: mockUserId,
        expiresAt: Date.now() + 100000,
        apiKeyDigest: mockDigest,
      });

      await guard.canActivate(mockContext);

      expect(redisSet).toHaveBeenCalledWith(
        `vmx:api_key:last_used_lock:${VERSION}:${mockKeyId}`,
        '1',
        'EX',
        LAST_USED_DEBOUNCE_SEC,
        'NX',
      );
    });

    it('should use correct lock key pattern', async () => {
      mockRequest.headers['x-api-key'] = `VMX_${mockKeyId}_secret`;
      (extractKeyId as jest.Mock).mockReturnValue(mockKeyId);
      (digest as jest.Mock).mockReturnValue(mockDigest);
      cacheGet.mockReturnValue({
        userId: mockUserId,
        expiresAt: Date.now() + 100000,
        apiKeyDigest: mockDigest,
      });

      await guard.canActivate(mockContext);

      expect(redisSet).toHaveBeenCalledWith(
        `vmx:api_key:last_used_lock:${VERSION}:${mockKeyId}`,
        expect.any(String),
        'EX',
        expect.any(Number),
        'NX',
      );
    });

    it('should not be called for JWT authentication', async () => {
      mockRequest.headers['authorization'] = 'Bearer valid-token';
      (verifyToken as jest.Mock).mockResolvedValue({ sub: mockUserId });

      await guard.canActivate(mockContext);

      expect(redisSet).not.toHaveBeenCalled();
    });
  });
});
