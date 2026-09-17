import { randomUUID } from 'node:crypto';
import { evidenceKey, isOwnedEvidenceKey, sniffImageType } from './evidence.js';

describe('sniffImageType', () => {
  it('recognizes the image formats a phone camera produces', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg');
    expect(
      sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('png');
    expect(sniffImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe(
      'webp',
    );
  });

  it('rejects anything else, whatever it claims to be', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('isOwnedEvidenceKey', () => {
  const owner = randomUUID();

  it('accepts a key issued to the owner', () => {
    expect(isOwnedEvidenceKey(evidenceKey(owner, randomUUID(), 'jpg'), owner)).toBe(true);
  });

  it('refuses a key issued to someone else', () => {
    expect(
      isOwnedEvidenceKey(evidenceKey(randomUUID(), randomUUID(), 'jpg'), owner),
    ).toBe(false);
  });

  it.each([
    `${owner}/../../etc/passwd`,
    `${owner}/${randomUUID()}.svg`,
    `../${owner}/${randomUUID()}.jpg`,
    `${owner}/${randomUUID()}.jpg/extra`,
    '',
  ])('refuses the malformed key %p', (key) => {
    expect(isOwnedEvidenceKey(key, owner)).toBe(false);
  });
});
