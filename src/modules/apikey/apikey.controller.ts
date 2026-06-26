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

@Controller('api-keys')
@ApiTags('API Keys')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  async createApiKey(@Req() req: Request) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.createApiKey(req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all API keys' })
  async getAllApiKeys(@Req() req: Request) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.listApiKeys(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke (delete) an API key' })
  async deleteApiKey(@Req() req: Request, @Param('id') id: string) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.deleteApiKey(req.user.id, id);
  }

  @Get('/:id/last-used')
  @ApiOperation({ summary: 'Get the last time an API key was used' })
  async getLastUsed(@Req() req: Request, @Param('id') id: string) {
    if (!req.user?.id) {
      throw new UnauthorizedException('User is not authenticated');
    }
    return this.apiKeysService.getLastUsed(req.user.id, id);
  }
}
