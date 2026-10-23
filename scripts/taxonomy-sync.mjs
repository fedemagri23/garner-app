/** `pnpm run taxonomy:sync`: applies data/taxonomy.json to the core database. */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/core/index.js';
import { syncTaxonomy } from './taxonomy.mjs';

const core = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.CORE_DB_URL }) });
try {
  const { created, updated, retired } = await syncTaxonomy(core);
  console.log(`taxonomy: ${created} created, ${updated} updated, ${retired} retired`);
} finally {
  await core.$disconnect();
}
