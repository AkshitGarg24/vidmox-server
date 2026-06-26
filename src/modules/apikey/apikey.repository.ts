import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * ApiKeyRepository — Prisma-based data-access layer for API keys.
 *
 * All queries filter by `revokedAt: null` to transparently exclude soft-deleted
 * keys. The plain-text key value is **never** persisted; only the Argon2id hash
 * is stored in the `value` column.
 */
@Injectable()
export class ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Return the count of active (non-revoked) keys belonging to a user. */
  async countApiKeys(userId: string) {
    return this.prisma.apiKey.count({
      where: {
        userId,
        revokedAt: null,
      },
    });
  }

  /**
   * Persist a new API key record.
   *
   * @param hash — Argon2id hash of the full plain-text key.
   * @param prefix — human-readable identifer (`VMX_{keyId}...`) shown in UIs.
   */
  async createApiKey(
    userId: string,
    keyId: string,
    hash: string,
    prefix: string,
  ) {
    await this.prisma.apiKey.create({
      data: {
        id: keyId,
        userId,
        prefix,
        value: hash,
      },
    });
  }

  /** List all active keys for a user (metadata only, no hash values). */
  async listApiKeys(userId: string) {
    return this.prisma.apiKey.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
        userId: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    });
  }

  /**
   * Soft-delete an API key by setting `revokedAt`.
   *
   * Uses `updateMany` (rather than `update`) so the query is a no-op when
   * the key is already revoked or belongs to a different user.
   */
  async deleteApiKey(userId: string, keyId: string) {
    await this.prisma.apiKey.updateMany({
      where: {
        id: keyId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /** Fetch a single active key by its composite key (userId + keyId). */
  async getApikey(userId: string, keyId: string) {
    return this.prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId,
        revokedAt: null,
      },
    });
  }
}
