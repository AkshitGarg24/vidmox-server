import { Module } from '@nestjs/common';
import { ApiKeysService } from './apikey.service';
import { ApiKeyRepository } from './apikey.repository';
import { ApiKeyController } from './apikey.controller';
import { ApiKeyCacheModule } from 'src/infra/apiKeyCache.module';

/**
 * ApiKeyModule — registers the API key feature.
 *
 * Provides the service and repository layers, imports the in-memory + Redis
 * cache module, and exposes the REST controller under `/api-keys`.
 */
@Module({
  imports: [ApiKeyCacheModule],
  providers: [ApiKeysService, ApiKeyRepository],
  controllers: [ApiKeyController],
})
export class ApiKeyModule {}
