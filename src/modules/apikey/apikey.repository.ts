import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countApiKeys(userId: string) {
    return this.prisma.apiKey.count({
      where: {
        userId,
        revokedAt: null,
      },
    });
  }

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
