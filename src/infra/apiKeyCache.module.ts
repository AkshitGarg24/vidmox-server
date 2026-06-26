import { Module } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

export interface CachedKey {
  userId: string;
  expiresAt: number;
  apiKeyDigest: string;
}

export const API_KEY_CACHE = 'API_KEY_CACHE';

@Module({
  providers: [
    {
      provide: API_KEY_CACHE,
      useFactory: () => {
        return new LRUCache<string, CachedKey>({
          max: 5000,
        });
      },
    },
  ],
  exports: [API_KEY_CACHE],
})
export class ApiKeyCacheModule {}
