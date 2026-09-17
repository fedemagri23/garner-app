import { execFileSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';

/**
 * Brings the test databases up to the committed migrations before the suite
 * runs, so integration tests exercise the real schema rather than one a test
 * helper invented.
 *
 * The variables from `.env.test` are passed explicitly to the child process.
 * `prisma.config.ts` also calls dotenv, but dotenv never overwrites a variable
 * that is already set, so these win over the developer's own `.env`.
 */
export default function globalSetup() {
  const testEnv = loadEnv({ path: '.env.test' }).parsed ?? {};

  // Every logical database that has migrations; intelligence_db joins in phase 5.
  for (const database of ['core', 'pricing']) {
    execFileSync(
      'npx',
      [
        'prisma',
        'migrate',
        'deploy',
        '--config',
        `prisma/${database}/prisma.config.ts`,
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, ...testEnv, NODE_ENV: 'test' },
      },
    );
  }
}
