/**
 * @file Registers the Playlist feature module.
 * Wires together the controller, service, and repository
 * for the Playlist domain within the NestJS application.
 */
import { Module } from '@nestjs/common';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';
import { PlaylistRepository } from './playlist.repository';

/**
 * PlaylistModule — encapsulates all playlist-related functionality.
 *
 * - Controller: handles HTTP CRUD operations
 * - Service:    enforces business rules (limit checks, error handling)
 * - Repository: abstracts Prisma data-access layer
 */
@Module({
  controllers: [PlaylistController],
  providers: [PlaylistService, PlaylistRepository],
})
export class PlaylistModule {}
