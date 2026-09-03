import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    // See prisma/core/prisma.config.ts for why this reads process.env directly.
    url: process.env.PRICING_DB_URL,
  },
});
