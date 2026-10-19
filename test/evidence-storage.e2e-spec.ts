import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import type { AppConfigService } from '../src/common/config/app-config.service.js';
import { validateConfig } from '../src/common/config/config.schema.js';
import { S3EvidenceStorage } from '../src/contributions/infrastructure/s3-evidence-storage.js';

/** The smallest byte sequence the evidence store recognizes as a PNG. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const testEnv = loadEnv({ path: '.env.test' }).parsed;

/**
 * The object-store adapter against a real S3 API — the compose stack's S3
 * mock — so request signing, keys and "not found" are exercised as a
 * provider would see them, not as a hand-written fake imagines them.
 */
describe('S3 evidence storage (e2e)', () => {
  const storageFor = (overrides: Record<string, string>) => {
    const config = validateConfig({
      ...testEnv,
      EVIDENCE_STORAGE_DRIVER: 's3',
      EVIDENCE_S3_BUCKET: 'garner-evidence-test',
      EVIDENCE_S3_ENDPOINT: 'http://127.0.0.1:9090',
      EVIDENCE_S3_FORCE_PATH_STYLE: 'true',
      EVIDENCE_S3_ACCESS_KEY_ID: 'test',
      EVIDENCE_S3_SECRET_ACCESS_KEY: 'test',
      ...overrides,
    });

    // Only the evidence settings are read; the rest of the service is unused.
    return new S3EvidenceStorage({
      evidenceS3: {
        bucket: config.EVIDENCE_S3_BUCKET!,
        region: config.EVIDENCE_S3_REGION,
        endpoint: config.EVIDENCE_S3_ENDPOINT ?? null,
        forcePathStyle: config.EVIDENCE_S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: config.EVIDENCE_S3_ACCESS_KEY_ID!,
          secretAccessKey: config.EVIDENCE_S3_SECRET_ACCESS_KEY!,
        },
      },
    } as AppConfigService);
  };

  let storage: S3EvidenceStorage;
  const owner = randomUUID();

  beforeAll(() => {
    storage = storageFor({});
  });

  afterAll(() => {
    storage.onModuleDestroy();
  });

  it('stores a photo under a key naming its owner, and finds it again', async () => {
    const key = await storage.save(owner, PNG, 'png');

    expect(key).toMatch(new RegExp(`^${owner}/[0-9a-f-]{36}\\.png$`));
    expect(await storage.exists(owner, key)).toBe(true);
  });

  it('does not find a photo that was never stored', async () => {
    expect(await storage.exists(owner, `${owner}/${randomUUID()}.png`)).toBe(false);
  });

  it('will not confirm another owner’s photo, even one that exists', async () => {
    const key = await storage.save(owner, PNG, 'png');

    expect(await storage.exists(randomUUID(), key)).toBe(false);
  });

  it('treats an unreachable store as an outage, not as a missing photo', async () => {
    const unreachable = storageFor({ EVIDENCE_S3_ENDPOINT: 'http://127.0.0.1:1' });

    await expect(
      unreachable.exists(owner, `${owner}/${randomUUID()}.png`),
    ).rejects.toThrow();

    unreachable.onModuleDestroy();
  });

  it('refuses to start as s3 without a bucket', () => {
    expect(() =>
      validateConfig({
        ...testEnv,
        EVIDENCE_STORAGE_DRIVER: 's3',
      }),
    ).toThrow(/EVIDENCE_S3_BUCKET/);
  });
});
