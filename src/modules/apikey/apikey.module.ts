import { Module } from '@nestjs/common';
import { ApiKeysService } from './apikey.service';
import { ApiKeyRepository } from './apikey.repository';
import { ApiKeyController } from './apikey.controller';

/**
 * ApiKeyModule — registers the API key feature.
 *
 * Provides the service and repository layers, exposes the REST controller under `/api-keys`.
 */
@Module({
  providers: [ApiKeysService, ApiKeyRepository],
  controllers: [ApiKeyController],
})
export class ApiKeyModule {}
