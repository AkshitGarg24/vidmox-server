import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiKeysService } from './apikey.service';
import { ClerkAuthGuard } from 'src/guards/clerk.guard';

/**
 * ApiKeyController — REST endpoints for managing API keys.
 *
 * All endpoints require a valid Clerk session (bearer token). Every request
 * is scoped to the authenticated user so one user can never see or modify
 * another user's keys.
 */
@Controller('api-keys')
@ApiTags('API Keys')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /**
   * Create a new API key.
   *
   * The plain-text key is returned **exactly once** in the response body and
   * cannot be retrieved again later. There is a hard limit of 5 non-revoked
   * keys per user.
   */
  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  async createApiKey(@Req() req: Request) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.createApiKey(req.user.id);
  }

  /**
   * List all non-revoked API keys for the authenticated user.
   *
   * Returns metadata only (prefix, creation date, last-used date); the
   * plain-text secret values are never stored.
   */
  @Get()
  @ApiOperation({ summary: 'Get all API keys' })
  async getAllApiKeys(@Req() req: Request) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.listApiKeys(req.user.id);
  }

  /**
   * Revoke (soft-delete) an API key by its ID.
   *
   * The key is immediately invalidated in the database, Redis, and the local
   * LRU cache so further requests carrying this key will be rejected.
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Revoke (delete) an API key' })
  async deleteApiKey(@Req() req: Request, @Param('id') id: string) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.deleteApiKey(req.user.id, id);
  }

  /**
   * Retrieve the last-used timestamp for a given API key.
   *
   * Checks the Redis hash first (fast path) and falls back to the database
   * (authoritative source). Returns `null` if the key has never been used.
   */
  @Get('/:id/last-used')
  @ApiOperation({ summary: 'Get the last time an API key was used' })
  async getLastUsed(@Req() req: Request, @Param('id') id: string) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.getLastUsed(req.user.id, id);
  }
}
