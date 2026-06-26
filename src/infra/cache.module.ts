import { Global, Module } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

export interface CacheInterface {
  user_id: string;
  public_id?: string;
  last_used?: string;
}

export const LRU_CACHE = 'LRU_CACHE';

@Global()
@Module({
  providers: [
    {
      provide: LRU_CACHE,
      useFactory: () => {
        return new LRUCache<string, CacheInterface>({
          max: 5000,
          ttl: 5 * 60 * 1000,
          allowStale: false,
          updateAgeOnGet: true,
          updateAgeOnHas: false,
        });
      },
    },
  ],
  exports: [LRU_CACHE],
})
export class CacheModule {}
