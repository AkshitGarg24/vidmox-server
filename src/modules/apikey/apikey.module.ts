import { Module } from '@nestjs/common';
import { ApiKeysService } from './apikey.service';
import { ApiKeyRepository } from './apikey.repository';
import { ApiKeyController } from './apikey.controller';
import { ApiKeyCacheModule } from 'src/infra/apiKeyCache.module';

@Module({
  imports: [ApiKeyCacheModule],
  providers: [ApiKeysService, ApiKeyRepository],
  controllers: [ApiKeyController],
})
export class ApiKeyModule {}
