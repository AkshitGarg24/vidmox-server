/**
 * @file Business-logic layer for the Playlist domain.
 * Coordinates between the controller and the Prisma repository,
 * enforcing application rules (playlist limit, ownership, error handling).
 */
import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PlaylistRepository, PlaylistLimitError } from './playlist.repository';
import { PlaylistDto } from './dto/playlist.dto';
import { PLAYLIST_LIMIT } from 'src/configs/constants';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  constructor(private readonly playlistRepository: PlaylistRepository) {}

  /**
   * Creates a new playlist for the authenticated user.
   *
   * Delegates to createWithinLimit which atomically checks the per-user
   * cap and inserts inside a Serializable transaction, preventing
   * concurrent requests from both passing the limit check.
   *
   * @param userId - Clerk user ID (owner of the playlist)
   * @param dto    - Request body containing name and optional description
   * @throws ForbiddenException if the user has reached the playlist limit
   * @returns The created playlist (id, name, description, totalVideos, createdAt)
   */
  async create(userId: string, dto: PlaylistDto) {
    try {
      return await this.playlistRepository.createWithinLimit(
        userId,
        dto,
        PLAYLIST_LIMIT,
      );
    } catch (error) {
      if (error instanceof PlaylistLimitError) {
        this.logger.log(`Playlist limit reached for user ${userId}`);
        throw new ForbiddenException('Playlist limit reached');
      }
      this.logger.error(`Error creating playlist for userId ${userId}`, error);
      throw new InternalServerErrorException(`Something went wrong`);
    }
  }

  /**
   * Retrieves all playlists belonging to the authenticated user.
   *
   * Wraps unexpected database errors into a generic 500 response.
   *
   * @param userId - Clerk user ID
   * @throws InternalServerErrorException on unexpected database errors
   * @returns Array of playlists (id, name, description, totalVideos, createdAt)
   */
  async findAll(userId: string) {
    try {
      return await this.playlistRepository.findAll(userId);
    } catch (error) {
      this.logger.error(`Error fetching playlists for user ${userId}`, error);
      throw new InternalServerErrorException(`Something went wrong`);
    }
  }

  /**
   * Finds a single playlist by ID, scoped to the authenticated user.
   *
   * Explicitly checks for a null result and throws, rather than relying
   * solely on Prisma's error handling, because findFirst returns null
   * instead of throwing when no record matches.
   *
   * @param userId - Clerk user ID (ownership check)
   * @param id     - Playlist ID
   * @throws NotFoundException if the playlist does not exist or is not owned by the user
   * @throws InternalServerErrorException on unexpected database errors
   * @returns The playlist record
   */
  async findOne(userId: string, id: string) {
    try {
      const record = await this.playlistRepository.findOne(userId, id);
      if (!record) throw new NotFoundException('Playlist not found');
      return record;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error fetching playlist ${id} for user ${userId}`,
        error,
      );
      throw new InternalServerErrorException(`Something went wrong`);
    }
  }

  /**
   * Updates an existing playlist owned by the authenticated user.
   *
   * Prisma's update throws P2025 when the where clause matches no rows.
   * This is caught and re-thrown as a NestJS NotFoundException.
   *
   * @param userId - Clerk user ID (ownership check)
   * @param id     - Playlist ID to update
   * @param dto    - Updated name and/or description
   * @throws NotFoundException if the playlist does not exist
   * @throws InternalServerErrorException on unexpected database errors
   * @returns The updated playlist record
   */
  async update(userId: string, id: string, dto: PlaylistDto) {
    try {
      return await this.playlistRepository.update(userId, id, dto);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Playlist not found');
      }
      this.logger.error(
        `Error updating playlist ${id} for user ${userId}`,
        error,
      );
      throw new InternalServerErrorException('Something went wrong');
    }
  }

  /**
   * Deletes a playlist owned by the authenticated user.
   *
   * Same Prisma P2025 handling as update — the compound where
   * clause (id + userId) prevents cross-user deletion.
   *
   * @param userId - Clerk user ID (ownership check)
   * @param id     - Playlist ID to delete
   * @throws NotFoundException if the playlist does not exist
   * @throws InternalServerErrorException on unexpected database errors
   * @returns The deleted playlist record
   */
  async delete(userId: string, id: string) {
    try {
      return await this.playlistRepository.delete(userId, id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Playlist not found');
      }
      this.logger.error(
        `Error deleting playlist ${id} for user ${userId}`,
        error,
      );
      throw new InternalServerErrorException('Something went wrong');
    }
  }
}
