import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    // Read directly from process.env rather than Prisma's env() helper: env()
    // throws when the variable is missing, which breaks `prisma generate` on a
    // fresh clone or in CI, where generation needs no live connection.
    url: process.env.CORE_DB_URL,
  },
});
