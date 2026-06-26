import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/infra/redis.module';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { LAST_USED_HASH } from 'src/configs/constants';

/**
 * ApiKeyUsageCron — periodically flushes `lastUsedAt` timestamps from Redis
 * into PostgreSQL.
 *
 * The auth guard writes `{userId}:{keyId} → unix-timestamp` entries into a
 * Redis hash (`vmx:api_key:last_used`) on every successful key-based request.
 * Writing to Redis is fast and non-blocking, but Redis is ephemeral — this
 * cron moves those timestamps into the persistent DB row.
 */
@Injectable()
export class ApiKeyUsageCron {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Run every 5 minutes. */
  @Cron('*/5 * * * *')
  async flushLastUsed() {
    // Read all pending timestamp entries from the Redis hash.
    const map = await this.redis.hgetall(LAST_USED_HASH);
    if (!map || Object.keys(map).length === 0) {
      return;
    }

    // Parse the composite key `{userId}:{keyId}` and validate the timestamp.
    const entries = Object.entries(map)
      .map(([composite, ts]) => {
        const sep = composite.indexOf(':');
        if (sep === -1) return null;
        const tsDate = new Date(Number(ts));
        if (!tsDate || Number.isNaN(tsDate.getTime())) return null;
        return { composite, keyId: composite.slice(sep + 1), ts: tsDate };
      })
      .filter(
        (x): x is { composite: string; keyId: string; ts: Date } => x !== null,
      );

    if (entries.length === 0) return;

    // Update every matching DB record in a single transaction.
    const updates = entries.map((entry) =>
      this.prisma.apiKey.updateMany({
        where: { id: entry.keyId, revokedAt: null },
        data: { lastUsedAt: entry.ts },
      }),
    );

    await this.prisma.$transaction(updates);

    // Remove processed entries from Redis so they are not flushed again.
    await this.redis.hdel(LAST_USED_HASH, ...entries.map((e) => e.composite));
  }
}
