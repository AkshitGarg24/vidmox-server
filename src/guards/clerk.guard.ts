import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { LRUCache } from 'lru-cache';
import { verifyToken } from '@clerk/backend';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/infra/redis.module';
import { API_KEY_CACHE, CachedKey } from 'src/infra/apiKeyCache.module';
import { extractKeyId } from 'src/utils/apiKeyVerifier.utils';
import { digest } from 'src/utils/keyDigest.utils';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import {
  LAST_USED_DEBOUNCE_SEC,
  LAST_USED_HASH,
  LRU_SOFT_TTL_MS,
  REDIS_HARD_TTL,
  VERSION,
} from 'src/configs/constants';

type AuthUser = { id: string; keyId?: string };
type AuthenticatedRequest = Request & { user?: AuthUser };

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(API_KEY_CACHE)
    private readonly localCache: LRUCache<string, CachedKey>,
  ) {}

  // Writes "last used" timestamp to Redis, debounced via SET NX so
  // concurrent requests for the same keyId only produce one write.
  private async trackApiKeyLastUsed(userId: string, keyId: string) {
    const lockKey = `vmx:api_key:last_used_lock:${VERSION}:${keyId}`;
    const ok = await this.redis.set(
      lockKey,
      '1',
      'EX',
      LAST_USED_DEBOUNCE_SEC,
      'NX',
    );
    if (!ok) return;
    await this.redis.hset(
      LAST_USED_HASH,
      `${userId}:${keyId}`,
      Date.now().toString(),
    );
  }

  // Fire-and-forget wrapper — failures are logged but never propagated.
  private trackLastUsed(userId: string, keyId: string): void {
    this.trackApiKeyLastUsed(userId, keyId).catch((err) =>
      console.error(
        `ClerkGuard: failed to track last used for keyId=${keyId}`,
        err,
      ),
    );
  }

  // Authenticates via one of two paths:
  //   1. API key (x-api-key header) — three-layer cache (LRU → Redis → DB)
  //   2. Clerk session (Authorization: Bearer) — JWT verification
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKeyHeader = request.headers['x-api-key'];

    // ── API key path ────────────────────────────────────────────────────
    if (typeof apiKeyHeader === 'string') {
      const apiKey: string = apiKeyHeader;

      // Parse VMX_{keyId}_{secret} and reject malformed keys.
      const keyId = extractKeyId(apiKey);
      if (!keyId) throw new UnauthorizedException('Invalid API key');

      // HMAC digest of the raw key — used as comparison token in caches.
      const d = digest(apiKey);
      const lruKey = `${VERSION}:${keyId}`;

      try {
        // Layer 1 — in-memory LRU (soft TTL, no I/O on hit).
        const c = this.localCache.get(lruKey);
        if (c && c.expiresAt > Date.now() && c.apiKeyDigest === d) {
          request.user = { id: c.userId, keyId };
          this.trackLastUsed(c.userId, keyId);
          return true;
        }

        // Layer 2 — Redis cache (userId + apiKeyDigest).
        const rKeyDigest = `vmx:api_key:${VERSION}:${keyId}`;
        const invalidKey = `vmx:api_key:invalid:${VERSION}:${d}`;
        const [rDigest, isInvalid] = await Promise.all([
          this.redis.hgetall(rKeyDigest),
          this.redis.exists(invalidKey),
        ]);
        if (isInvalid) {
          throw new UnauthorizedException('Invalid API key');
        }
        // Valid cache hit — rehydrate LRU and authenticate.
        if (rDigest?.userId && rDigest.apiKeyDigest === d) {
          this.localCache.set(lruKey, {
            userId: rDigest.userId,
            expiresAt: Date.now() + LRU_SOFT_TTL_MS,
            apiKeyDigest: d,
          });
          request.user = { id: rDigest.userId, keyId };
          this.trackLastUsed(rDigest.userId, keyId);
          return true;
        }

        // Layer 3 — PostgreSQL (source of truth).
        const record = await this.prisma.apiKey.findFirst({
          where: { id: keyId, revokedAt: null },
        });
        if (!record) {
          throw new UnauthorizedException('Invalid API key');
        }

        // Argon2 verify — constant time comparison against stored hash.
        const isValid = await argon2.verify(record.value, apiKey);
        if (!isValid) {
          // Cache the failed digest so Redis rejects it next time.
          await this.redis.set(invalidKey, '1', 'EX', REDIS_HARD_TTL);
          throw new UnauthorizedException('Invalid API key');
        }

        // Valid: hydrate Redis + LRU caches, then authenticate.
        await this.redis.hset(rKeyDigest, {
          userId: record.userId,
          apiKeyDigest: d,
        });
        await this.redis.expire(rKeyDigest, REDIS_HARD_TTL);
        request.user = { id: record.userId, keyId };
        this.trackLastUsed(record.userId, keyId);
        return true;
      } catch (error) {
        // Rethrow auth errors; wrap infrastructure errors as 500.
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        console.error(
          `ClerkGuard: infrastructure error during API key auth (keyId=${keyId})`,
          error,
        );
        throw new InternalServerErrorException(
          'Authentication service unavailable',
        );
      }
    }

    // ── Clerk session path (no x-api-key header) ────────────────────────
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw new UnauthorizedException('Missing authentication token');
    }
    const token = authorization.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }
    try {
      const verifiedToken = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      request.user = { ...verifiedToken, id: verifiedToken.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}
