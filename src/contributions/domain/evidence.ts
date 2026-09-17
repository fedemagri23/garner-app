/**
 * Evidence rules. A photo is stored under a key the storage provider issues;
 * the key names its owner, so one user cannot attach another user's photo to
 * their own report and borrow its credibility.
 */

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export const MAX_EVIDENCE_NOTE_LENGTH = 500;

/** Uploads per account per hour. Bounds how much disk one account can fill. */
export const EVIDENCE_UPLOADS_PER_HOUR = 30;

export type EvidenceImageType = 'jpg' | 'png' | 'webp';

/**
 * Identifies an image by its leading bytes. The declared content type and file
 * name are the client's claims; the bytes are what will actually be stored.
 */
export function sniffImageType(content: Uint8Array): EvidenceImageType | null {
  const startsWith = (bytes: number[], offset = 0) =>
    bytes.every((byte, index) => content[offset + index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) {
    return 'jpg';
  }

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }

  // "RIFF" <size> "WEBP"
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    startsWith([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'webp';
  }

  return null;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY_PATTERN = new RegExp(`^(${UUID})/(${UUID})\\.(jpg|png|webp)$`);

export function evidenceKey(
  ownerId: string,
  photoId: string,
  type: EvidenceImageType,
): string {
  return `${ownerId}/${photoId}.${type}`;
}

/**
 * True only for a well-formed key that belongs to `ownerId`. The strict shape
 * is also what keeps a key from ever naming a path outside the evidence store.
 */
export function isOwnedEvidenceKey(key: string, ownerId: string): boolean {
  const match = KEY_PATTERN.exec(key);
  return match !== null && match[1] === ownerId.toLowerCase();
}
