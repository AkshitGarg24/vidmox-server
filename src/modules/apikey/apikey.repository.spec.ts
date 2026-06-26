import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyRepository } from './apikey.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('ApiKeyRepository', () => {
  let repository: ApiKeyRepository;

  const mockUserId = 'user-123';
  const mockKeyId = 'key-abc';
  const mockHash = 'argon2-hash-value';
  const mockPrefix = 'VMX_key-abc...';

  const mockCount = jest.fn<Promise<number>, [object]>();
  const mockCreate = jest.fn<
    Promise<object>,
    [{ data: Record<string, unknown> }]
  >();
  const mockFindMany = jest.fn<Promise<object[]>, [object]>();
  const mockUpdateMany = jest.fn<
    Promise<{ count: number }>,
    [{ data: { revokedAt: Date }; where: Record<string, unknown> }]
  >();
  const mockFindFirst = jest.fn<Promise<object | null>, [object]>();

  const mockPrismaService = {
    apiKey: {
      count: mockCount,
      create: mockCreate,
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
      findFirst: mockFindFirst,
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyRepository,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    repository = module.get<ApiKeyRepository>(ApiKeyRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('countApiKeys', () => {
    it('should return count of non-revoked keys for a user', async () => {
      mockPrismaService.apiKey.count.mockResolvedValue(3);

      const result = await repository.countApiKeys(mockUserId);

      expect(result).toBe(3);
      expect(mockPrismaService.apiKey.count).toHaveBeenCalledWith({
        where: { userId: mockUserId, revokedAt: null },
      });
    });

    it('should return 0 when user has no active keys', async () => {
      mockPrismaService.apiKey.count.mockResolvedValue(0);

      const result = await repository.countApiKeys(mockUserId);

      expect(result).toBe(0);
    });

    it('should only count active keys (revokedAt: null), not revoked ones', async () => {
      mockPrismaService.apiKey.count.mockResolvedValue(2);

      const result = await repository.countApiKeys(mockUserId);

      expect(result).toBe(2);
      expect(mockPrismaService.apiKey.count).toHaveBeenCalledWith({
        where: { userId: mockUserId, revokedAt: null },
      });
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Database connection failed');
      mockPrismaService.apiKey.count.mockRejectedValue(error);

      await expect(repository.countApiKeys(mockUserId)).rejects.toThrow(error);
    });
  });

  describe('createApiKey', () => {
    it('should create a new API key record with all provided fields', async () => {
      const createdRecord = {
        id: mockKeyId,
        userId: mockUserId,
        prefix: mockPrefix,
        value: mockHash,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };
      mockPrismaService.apiKey.create.mockResolvedValue(createdRecord);

      await repository.createApiKey(
        mockUserId,
        mockKeyId,
        mockHash,
        mockPrefix,
      );

      expect(mockPrismaService.apiKey.create).toHaveBeenCalledWith({
        data: {
          id: mockKeyId,
          userId: mockUserId,
          prefix: mockPrefix,
          value: mockHash,
        },
      });
    });

    it('should not set lastUsedAt or revokedAt on creation', async () => {
      mockPrismaService.apiKey.create.mockResolvedValue({});

      await repository.createApiKey(
        mockUserId,
        mockKeyId,
        mockHash,
        mockPrefix,
      );

      const createArgs = mockCreate.mock.calls[0];
      const callData = createArgs
        ? (createArgs[0] as { data?: Record<string, unknown> }).data
        : undefined;
      expect(callData).not.toHaveProperty('lastUsedAt');
      expect(callData).not.toHaveProperty('revokedAt');
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Unique constraint violation');
      mockPrismaService.apiKey.create.mockRejectedValue(error);

      await expect(
        repository.createApiKey(mockUserId, mockKeyId, mockHash, mockPrefix),
      ).rejects.toThrow(error);
    });
  });

  describe('listApiKeys', () => {
    const activeKey1 = {
      id: 'key-1',
      userId: mockUserId,
      prefix: 'VMX_abc...',
      createdAt: new Date('2025-01-01'),
      lastUsedAt: new Date('2025-06-01'),
      revokedAt: null,
    };
    const activeKey2 = {
      id: 'key-2',
      userId: mockUserId,
      prefix: 'VMX_def...',
      createdAt: new Date('2025-02-01'),
      lastUsedAt: null,
      revokedAt: null,
    };

    it('should return only non-revoked keys for a user', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([
        activeKey1,
        activeKey2,
      ]);

      const result = await repository.listApiKeys(mockUserId);

      expect(result).toEqual([activeKey1, activeKey2]);
      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId, revokedAt: null },
        select: {
          id: true,
          userId: true,
          prefix: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
        },
      });
    });

    it('should return empty array when user has no active keys', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([]);

      const result = await repository.listApiKeys(mockUserId);

      expect(result).toEqual([]);
    });

    it('should not return revoked keys', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([activeKey1]);

      const result = await repository.listApiKeys(mockUserId);

      expect(result).toHaveLength(1);
      expect(result.every((k) => k.revokedAt === null)).toBe(true);
    });

    it('should not include the value (hash) field in returned records', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([activeKey1]);

      const result = await repository.listApiKeys(mockUserId);

      expect(result[0]).not.toHaveProperty('value');
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Query failed');
      mockPrismaService.apiKey.findMany.mockRejectedValue(error);

      await expect(repository.listApiKeys(mockUserId)).rejects.toThrow(error);
    });
  });

  describe('deleteApiKey', () => {
    it('should set revokedAt on matching records', async () => {
      mockPrismaService.apiKey.updateMany.mockResolvedValue({ count: 1 });

      await repository.deleteApiKey(mockUserId, mockKeyId);

      expect(mockPrismaService.apiKey.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockKeyId,
          userId: mockUserId,
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date) as Date,
        },
      });
    });

    it('should set revokedAt to a valid Date', async () => {
      mockPrismaService.apiKey.updateMany.mockResolvedValue({ count: 1 });

      await repository.deleteApiKey(mockUserId, mockKeyId);

      const updateArgs = mockUpdateMany.mock.calls[0];
      const callData = updateArgs
        ? updateArgs[0].data
        : (null as unknown as { revokedAt: Date });
      expect(callData.revokedAt).toBeInstanceOf(Date);
      expect(callData.revokedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should be idempotent — calling twice does not throw', async () => {
      mockPrismaService.apiKey.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await expect(
        repository.deleteApiKey(mockUserId, mockKeyId),
      ).resolves.not.toThrow();
      await expect(
        repository.deleteApiKey(mockUserId, mockKeyId),
      ).resolves.not.toThrow();
    });

    it('should not affect keys belonging to other users', async () => {
      mockPrismaService.apiKey.updateMany.mockResolvedValue({ count: 0 });

      await repository.deleteApiKey('other-user', mockKeyId);

      expect(mockPrismaService.apiKey.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockKeyId,
          userId: 'other-user',
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('should not affect already-revoked keys', async () => {
      mockPrismaService.apiKey.updateMany.mockResolvedValue({ count: 0 });

      await repository.deleteApiKey(mockUserId, mockKeyId);

      expect(mockPrismaService.apiKey.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }) as {
            revokedAt: null;
          },
        }) as { where: { revokedAt: null } },
      );
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Update failed');
      mockPrismaService.apiKey.updateMany.mockRejectedValue(error);

      await expect(
        repository.deleteApiKey(mockUserId, mockKeyId),
      ).rejects.toThrow(error);
    });
  });

  describe('getApikey', () => {
    const fullRecord = {
      id: mockKeyId,
      userId: mockUserId,
      prefix: mockPrefix,
      value: mockHash,
      createdAt: new Date('2025-01-01'),
      lastUsedAt: new Date('2025-06-01'),
      revokedAt: null,
    };

    it('should return key record when found for the user', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(fullRecord);

      const result = await repository.getApikey(mockUserId, mockKeyId);

      expect(result).toEqual(fullRecord);
      expect(mockPrismaService.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: mockKeyId, userId: mockUserId, revokedAt: null },
      });
    });

    it('should return null when key does not exist', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      const result = await repository.getApikey(mockUserId, mockKeyId);

      expect(result).toBeNull();
    });

    it('should return null when key belongs to a different user', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      const result = await repository.getApikey('other-user', mockKeyId);

      expect(result).toBeNull();
      expect(mockPrismaService.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: mockKeyId, userId: 'other-user', revokedAt: null },
      });
    });

    it('should return null when key has been revoked', async () => {
      mockPrismaService.apiKey.findFirst.mockResolvedValue(null);

      const result = await repository.getApikey(mockUserId, mockKeyId);

      expect(result).toBeNull();
      expect(mockPrismaService.apiKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ revokedAt: null }) as {
            revokedAt: null;
          },
        }) as { where: { revokedAt: null } },
      );
    });

    it('should propagate Prisma errors', async () => {
      const error = new Error('Query failed');
      mockPrismaService.apiKey.findFirst.mockRejectedValue(error);

      await expect(repository.getApikey(mockUserId, mockKeyId)).rejects.toThrow(
        error,
      );
    });
  });
});
