import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyUsageCron } from './api-key-last-used.cron';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { REDIS_CLIENT } from 'src/infra/redis.module';
import Redis from 'ioredis';
import { LAST_USED_HASH } from 'src/configs/constants';

describe('ApiKeyUsageCron', () => {
  let cron: ApiKeyUsageCron;

  const redisHgetall = jest.fn();
  const redisHdel = jest.fn();

  const mockRedisInstance = {
    hgetall: redisHgetall,
    hdel: redisHdel,
  } as unknown as jest.Mocked<Redis>;

  const apiKeyUpdateMany = jest.fn();
  const prismaTransaction = jest.fn();

  const mockPrismaInstance = {
    apiKey: {
      updateMany: apiKeyUpdateMany,
    },
    $transaction: prismaTransaction,
  } as unknown as jest.Mocked<PrismaService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyUsageCron,
        { provide: REDIS_CLIENT, useValue: mockRedisInstance },
        { provide: PrismaService, useValue: mockPrismaInstance },
      ],
    }).compile();

    cron = module.get<ApiKeyUsageCron>(ApiKeyUsageCron);
  });

  it('should be defined', () => {
    expect(cron).toBeDefined();
  });

  it('should read LAST_USED_HASH, hdel processed keys, then write valid entries to DB', async () => {
    mockRedisInstance.hgetall.mockResolvedValue({
      'user:key-1': '1700000000000',
      'user:key-2': '1700000001000',
    });
    mockPrismaInstance.$transaction.mockResolvedValue([]);

    await cron.flushLastUsed();

    expect(redisHgetall).toHaveBeenCalledWith(LAST_USED_HASH);

    expect(redisHdel).toHaveBeenCalledWith(
      LAST_USED_HASH,
      'user:key-1',
      'user:key-2',
    );

    expect(apiKeyUpdateMany).toHaveBeenCalledTimes(2);
    expect(apiKeyUpdateMany).toHaveBeenCalledWith({
      where: { id: 'key-1', revokedAt: null },
      data: { lastUsedAt: new Date(1700000000000) },
    });
    expect(apiKeyUpdateMany).toHaveBeenCalledWith({
      where: { id: 'key-2', revokedAt: null },
      data: { lastUsedAt: new Date(1700000001000) },
    });
    expect(prismaTransaction).toHaveBeenCalledTimes(1);
  });

  it('should hdel processed keys BEFORE the DB transaction', async () => {
    mockRedisInstance.hgetall.mockResolvedValue({
      'user:key-1': '1700000000000',
    });
    mockPrismaInstance.$transaction.mockResolvedValue([]);

    await cron.flushLastUsed();

    const hdelCallIndex = redisHdel.mock.invocationCallOrder[0];
    const transactionCallIndex = prismaTransaction.mock.invocationCallOrder[0];

    expect(hdelCallIndex).toBeLessThan(transactionCallIndex);
  });

  it('should return early when LAST_USED_HASH is empty', async () => {
    mockRedisInstance.hgetall.mockResolvedValue({});

    await cron.flushLastUsed();

    expect(redisHdel).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it('should return early when hgetall returns null', async () => {
    mockRedisInstance.hgetall.mockResolvedValue(
      null as unknown as Record<string, string>,
    );

    await cron.flushLastUsed();

    expect(redisHdel).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
  });

  it('should filter out entries with NaN timestamps', async () => {
    mockRedisInstance.hgetall.mockResolvedValue({
      'user:key-valid': '1700000000000',
      'user:key-nan': 'not-a-number',
    });
    mockPrismaInstance.$transaction.mockResolvedValue([]);

    await cron.flushLastUsed();

    expect(apiKeyUpdateMany).toHaveBeenCalledTimes(1);
    expect(apiKeyUpdateMany).toHaveBeenCalledWith({
      where: { id: 'key-valid', revokedAt: null },
      data: { lastUsedAt: new Date(1700000000000) },
    });
    expect(redisHdel).toHaveBeenCalledWith(LAST_USED_HASH, 'user:key-valid');
  });

  it('should filter out entries with empty keyId', async () => {
    mockRedisInstance.hgetall.mockResolvedValue({
      '': '1700000000000',
      'user:key-valid': '1700000000000',
    });
    mockPrismaInstance.$transaction.mockResolvedValue([]);

    await cron.flushLastUsed();

    expect(apiKeyUpdateMany).toHaveBeenCalledTimes(1);
    expect(apiKeyUpdateMany).toHaveBeenCalledWith({
      where: { id: 'key-valid', revokedAt: null },
      data: { lastUsedAt: new Date(1700000000000) },
    });
    expect(redisHdel).toHaveBeenCalledWith(LAST_USED_HASH, 'user:key-valid');
  });

  it('should hdel keys before the DB transaction, even when the transaction fails', async () => {
    mockRedisInstance.hgetall.mockResolvedValue({
      'user:key-1': '1700000000000',
    });
    mockPrismaInstance.$transaction.mockRejectedValue(
      new Error('Transaction failed'),
    );

    await expect(cron.flushLastUsed()).rejects.toThrow('Transaction failed');

    expect(redisHdel).toHaveBeenCalledWith(LAST_USED_HASH, 'user:key-1');
  });

  it('should propagate Redis hgetall errors', async () => {
    mockRedisInstance.hgetall.mockRejectedValue(
      new Error('Redis connection failed'),
    );

    await expect(cron.flushLastUsed()).rejects.toThrow(
      'Redis connection failed',
    );

    expect(redisHdel).not.toHaveBeenCalled();
    expect(prismaTransaction).not.toHaveBeenCalled();
  });
});
