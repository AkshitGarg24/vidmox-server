/**
 * @file Data-access layer for the Playlist entity.
 * Encapsulates all Prisma queries so the service layer
 * never interacts with the ORM directly.
 * Every query is scoped by `userId` to enforce ownership.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlaylistDto } from './dto/playlist.dto';
import { Prisma } from 'generated/prisma/client';

/**
 * Thrown by createWithinLimit when the user already has `limit` playlists.
 * The service layer catches this and translates it into a ForbiddenException.
 */
export class PlaylistLimitError extends Error {
  constructor() {
    super('Playlist limit reached');
    this.name = 'PlaylistLimitError';
  }
}

@Injectable()
export class PlaylistRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically checks the per-user playlist cap and creates a new playlist.
   *
   * Uses a Prisma interactive transaction with Serializable isolation so
   * two concurrent requests cannot both pass the limit check.
   *
   * @param userId - Clerk user ID (owner)
   * @param dto    - Playlist name and optional description
   * @param limit  - Maximum number of playlists allowed per user
   * @throws PlaylistLimitError if the user already has `limit` playlists
   * @returns The created playlist (id, name, description, totalVideos, createdAt)
   */
  async createWithinLimit(userId: string, dto: PlaylistDto, limit: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const count = await tx.playlist.count({ where: { userId } });
        if (count >= limit) {
          throw new PlaylistLimitError();
        }
        return tx.playlist.create({
          data: {
            userId,
            name: dto.name,
            description: dto.description,
          },
          select: {
            name: true,
            description: true,
            id: true,
            totalVideos: true,
            createdAt: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Fetches all playlists belonging to the user.
   * Results are projected to a fixed set of fields for consistent API output.
   *
   * @param userId - Clerk user ID
   * @returns Array of playlists (id, name, description, totalVideos, createdAt)
   */
  async findAll(userId: string) {
    return this.prisma.playlist.findMany({
      where: {
        userId,
      },
      select: {
        name: true,
        description: true,
        id: true,
        totalVideos: true,
        createdAt: true,
      },
    });
  }

  /**
   * Finds a single playlist scoped to the user.
   * Only projected fields are returned (same shape as createWithinLimit).
   *
   * @param userId - Clerk user ID (ownership scope)
   * @param id     - Playlist ID
   * @returns The playlist record or null if not found
   */
  async findOne(userId: string, id: string) {
    return this.prisma.playlist.findFirst({
      where: {
        userId,
        id,
      },
      select: {
        name: true,
        description: true,
        id: true,
        totalVideos: true,
        createdAt: true,
      },
    });
  }

  /**
   * Updates a playlist's name and/or description.
   * The compound where clause (id + userId) ensures only the owner can update.
   *
   * @param userId - Clerk user ID (ownership guard)
   * @param id     - Playlist ID to update
   * @param dto    - Updated fields
   * @throws Prisma.PrismaClientKnownRequestError (code P2025) if no record matches
   * @returns The updated playlist record
   */
  async update(userId: string, id: string, dto: PlaylistDto) {
    return this.prisma.playlist.update({
      where: {
        id,
        userId,
      },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  /**
   * Deletes a playlist owned by the user.
   * The compound unique constraint (id + userId) prevents
   * cross-user deletion.
   *
   * @param userId - Clerk user ID (ownership guard)
   * @param id     - Playlist ID to delete
   * @throws Prisma.PrismaClientKnownRequestError (code P2025) if no record matches
   * @returns The deleted playlist record
   */
  async delete(userId: string, id: string) {
    return this.prisma.playlist.delete({
      where: {
        id,
        userId,
      },
    });
  }
}
