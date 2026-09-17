import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service.js';
import type { EvidenceUploadQuota } from '../domain/evidence-storage.port.js';
import { EVIDENCE_UPLOADS_PER_HOUR } from '../domain/evidence.js';

const HOUR_S = 60 * 60;

@Injectable()
export class RedisEvidenceUploadQuota implements EvidenceUploadQuota {
  private readonly logger = new Logger(RedisEvidenceUploadQuota.name);

  constructor(private readonly redis: RedisService) {}

  async consume(ownerId: string): Promise<boolean> {
    const window = Math.floor(Date.now() / 1000 / HOUR_S);
    const key = `evidence-uploads:${ownerId}:${window}`;

    try {
      const results = await this.redis.client
        .multi()
        .incr(key)
        .expire(key, HOUR_S)
        .exec();

      return Number(results?.[0]?.[1] ?? 0) <= EVIDENCE_UPLOADS_PER_HOUR;
    } catch (error) {
      // Fails open like every other limiter here; the 5 MB cap per upload and
      // the global IP limit still bound what one client can send.
      this.logger.error(
        `Upload quota unavailable, allowing upload: ${error instanceof Error ? error.message : String(error)}`,
      );
      return true;
    }
  }
}
