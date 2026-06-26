import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { CacheModule } from './infra/cache.module';
import { ApiKeyModule } from './modules/apikey/apikey.module';
import { RedisModule } from './infra/redis.module';
import { ApiKeyCacheModule } from './infra/apiKeyCache.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ApiKeyUsageCron } from './scheduler/api-key-last-used.cron';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CacheModule,
    RedisModule,
    ApiKeyModule,
    ApiKeyCacheModule,
  ],
  controllers: [AppController],
  providers: [AppService, ApiKeyUsageCron],
})
export class AppModule {}
