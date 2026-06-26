import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/infra/redis.module';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { LAST_USED_HASH } from 'src/configs/constants';

@Injectable()
export class ApiKeyUsageCron {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron('*/5 * * * *')
  async flushLastUsed() {
    const map = await this.redis.hgetall(LAST_USED_HASH);
    if (!map || Object.keys(map).length === 0) {
      return;
    }
    const entries = Object.entries(map)
      .map(([keyId, ts]) => ({
        keyId,
        ts: new Date(Number(ts)),
      }))
      .filter(
        (x) => x.keyId && x.ts instanceof Date && !Number.isNaN(x.ts.getTime()),
      );

    if (entries.length === 0) return;

    const updates = entries.map((entry) =>
      this.prisma.apiKey.update({
        where: { id: entry.keyId, revokedAt: null },
        data: { lastUsedAt: entry.ts },
      }),
    );

    await this.prisma.$transaction(updates);
    await this.redis.hdel(LAST_USED_HASH, ...entries.map((e) => e.keyId));
  }
}
