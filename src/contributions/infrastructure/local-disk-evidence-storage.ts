import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AppConfigService } from '../../common/config/app-config.service.js';
import type { EvidenceStorage } from '../domain/evidence-storage.port.js';
import {
  evidenceKey,
  isOwnedEvidenceKey,
  type EvidenceImageType,
} from '../domain/evidence.js';

/**
 * Evidence photos on the local filesystem, under one directory per owner.
 *
 * Suited to development and to a single instance. With more than one instance
 * the directory would have to be shared, which is the point at which an
 * object-store adapter behind the same port should replace this one.
 */
@Injectable()
export class LocalDiskEvidenceStorage implements EvidenceStorage {
  private readonly root: string;

  constructor(config: AppConfigService) {
    this.root = resolve(config.evidenceStorageDir);
  }

  async save(
    ownerId: string,
    content: Buffer,
    type: EvidenceImageType,
  ): Promise<string> {
    const key = evidenceKey(ownerId.toLowerCase(), randomUUID(), type);
    const path = this.pathFor(key);

    await mkdir(dirname(path), { recursive: true });
    // `wx` refuses to overwrite: a key names exactly one upload, forever.
    await writeFile(path, content, { flag: 'wx' });

    return key;
  }

  async exists(ownerId: string, key: string): Promise<boolean> {
    // The shape check comes first and is what makes joining the key onto the
    // root safe: a key that passes it cannot contain `..` or a separator
    // beyond the owner directory.
    if (!isOwnedEvidenceKey(key, ownerId)) {
      return false;
    }

    try {
      await access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  private pathFor(key: string): string {
    return resolve(this.root, key);
  }
}
