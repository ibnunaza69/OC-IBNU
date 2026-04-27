import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  console.warn('[drizzle] DATABASE_URL is not set. Migration commands will fail until it is configured.');
}

export default defineConfig({
  schema: './src/modules/foundation/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://metaads:metaads@127.0.0.1:5432/meta_ads_dev'
  },
  verbose: true,
  strict: true
});
