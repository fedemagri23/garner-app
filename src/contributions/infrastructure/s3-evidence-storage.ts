import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../common/config/app-config.service.js';
import type { EvidenceStorage } from '../domain/evidence-storage.port.js';
import {
  evidenceKey,
  isOwnedEvidenceKey,
  type EvidenceImageType,
} from '../domain/evidence.js';

const CONTENT_TYPES: Record<EvidenceImageType, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Evidence photos in an S3-compatible object store — AWS S3, Cloudflare R2,
 * MinIO and the like. Shared by every instance, which is what the local-disk
 * adapter cannot be. Objects use the same keys as on disk, so a store can be
 * seeded by copying the directory across.
 */
@Injectable()
export class S3EvidenceStorage implements EvidenceStorage, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfigService) {
    const s3 = config.evidenceS3;

    this.bucket = s3.bucket;
    this.client = new S3Client({
      region: s3.region,
      ...(s3.endpoint ? { endpoint: s3.endpoint } : {}),
      forcePathStyle: s3.forcePathStyle,
      ...(s3.credentials ? { credentials: s3.credentials } : {}),
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async save(
    ownerId: string,
    content: Buffer,
    type: EvidenceImageType,
  ): Promise<string> {
    const key = evidenceKey(ownerId.toLowerCase(), randomUUID(), type);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: CONTENT_TYPES[type],
      }),
    );

    return key;
  }

  async exists(ownerId: string, key: string): Promise<boolean> {
    // Never ask the store about a key that is not this owner's: the answer
    // would tell one user whether another user's photo exists.
    if (!isOwnedEvidenceKey(key, ownerId)) {
      return false;
    }

    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      // Only "not there" means not there. An unreachable store or a
      // permissions error is an outage, and must not read as a missing photo.
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404
      ) {
        return false;
      }

      throw error;
    }
  }
}
