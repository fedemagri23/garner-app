/**
 * Creates the load-test databases, migrates them, and fills them with a
 * city-sized world (see seed.mjs). Safe to re-run: it starts from empty.
 *
 *   pnpm run load:prepare
 */
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const admin = new pg.Client({
  connectionString: 'postgresql://postgres:password@localhost:5433/postgres',
});
await admin.connect();

for (const name of ['core_db_load', 'pricing_db_load', 'intelligence_db_load']) {
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  // Commits stop waiting for fsync. A laptop's Docker volume can take a
  // quarter of a second per fsync — measure yours with pg_test_fsync — which
  // would make every write path look commit-bound for reasons a server disk
  // does not share. Crash durability is irrelevant to throwaway load data.
  await admin.query(`ALTER DATABASE ${name} SET synchronous_commit = off`);
}
await admin.end();

for (const database of ['core', 'pricing', 'intelligence']) {
  execFileSync(
    'node',
    [
      '--env-file=load/load.env',
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--config',
      `prisma/${database}/prisma.config.ts`,
    ],
    { stdio: 'inherit' },
  );
}

execFileSync('node', ['--env-file=load/load.env', 'load/seed.mjs'], {
  stdio: 'inherit',
});
