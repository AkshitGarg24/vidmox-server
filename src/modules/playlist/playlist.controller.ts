/**
 * @file REST API controller for the Playlist resource.
 * All endpoints require a valid Clerk session (ClerkAuthGuard)
 * and attach the authenticated user to `req.user`.
 * Every handler scopes operations to the authenticated user's ID.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlaylistService } from './playlist.service';
import { ClerkAuthGuard } from 'src/guards/clerk.guard';
import type { Request } from 'express';
import { PlaylistDto } from './dto/playlist.dto';

@Controller('playlist')
@ApiTags('Playlist')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  /**
   * POST /playlist — Creates a new playlist for the authenticated user.
   *
   * @param req - Express request with `req.user.id` set by ClerkAuthGuard
   * @param dto - Request body (name, optional description)
   * @throws UnauthorizedException if `req.user` is missing
   * @returns The created playlist record
   */
  @Post()
  @ApiOperation({ summary: 'Create a new playlist' })
  async create(@Req() req: Request, @Body() dto: PlaylistDto) {
    if (!req.user) throw new UnauthorizedException('User not found');
    return this.playlistService.create(req.user.id, dto);
  }

  /**
   * GET /playlist — Returns all playlists owned by the authenticated user.
   *
   * @param req - Express request with `req.user.id`
   * @throws UnauthorizedException if `req.user` is missing
   * @returns Array of playlist summaries
   */
  @Get()
  @ApiOperation({ summary: 'Get all playlists' })
  async findAll(@Req() req: Request) {
    if (!req.user) throw new UnauthorizedException('User not found');
    return this.playlistService.findAll(req.user.id);
  }

  /**
   * GET /playlist/:id — Returns a single playlist by ID (user-scoped).
   *
   * @param req - Express request with `req.user.id`
   * @param id  - Playlist ID (route param)
   * @throws UnauthorizedException if `req.user` is missing
   * @throws NotFoundException if the playlist does not exist
   * @returns The full playlist record
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a playlist by id' })
  async findOne(@Req() req: Request, @Param('id') id: string) {
    if (!req.user) throw new UnauthorizedException('User not found');
    return this.playlistService.findOne(req.user.id, id);
  }

  /**
   * PUT /playlist/:id — Updates a playlist owned by the authenticated user.
   *
   * @param req - Express request with `req.user.id`
   * @param id  - Playlist ID to update
   * @param dto - Updated fields (name, description)
   * @throws UnauthorizedException if `req.user` is missing
   * @throws NotFoundException if the playlist does not exist
   * @returns The updated playlist record
   */
  @Put(':id')
  @ApiOperation({ summary: 'Update a playlist by id' })
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: PlaylistDto,
  ) {
    if (!req.user) throw new UnauthorizedException('User not found');
    return this.playlistService.update(req.user.id, id, dto);
  }

  /**
   * DELETE /playlist/:id — Deletes a playlist owned by the authenticated user.
   *
   * @param req - Express request with `req.user.id`
   * @param id  - Playlist ID to delete
   * @throws UnauthorizedException if `req.user` is missing
   * @throws NotFoundException if the playlist does not exist
   * @returns The deleted playlist record
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a playlist by id' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    if (!req.user) throw new UnauthorizedException('User not found');
    return this.playlistService.delete(req.user.id, id);
  }
}
