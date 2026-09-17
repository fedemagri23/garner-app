import type { EvidenceImageType } from './evidence.js';

/**
 * Where evidence photos live. Abstract on purpose: the local-disk adapter
 * serves development and a single instance, and an object store replaces it
 * in production without the contribution flow changing.
 */
export interface EvidenceStorage {
  /** Stores the photo and returns the key a report refers to it by. */
  save(ownerId: string, content: Buffer, type: EvidenceImageType): Promise<string>;
  /** Whether `key` names a stored photo that belongs to `ownerId`. */
  exists(ownerId: string, key: string): Promise<boolean>;
}

export const EVIDENCE_STORAGE = Symbol('EVIDENCE_STORAGE');

export interface EvidenceUploadQuota {
  /** Counts one upload; false once the account is over its hourly allowance. */
  consume(ownerId: string): Promise<boolean>;
}

export const EVIDENCE_UPLOAD_QUOTA = Symbol('EVIDENCE_UPLOAD_QUOTA');
