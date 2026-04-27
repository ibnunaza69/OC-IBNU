import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../../../config/env.js';
import { logger } from '../../../lib/logger.js';
import * as schema from './schema.js';

const { Pool } = pg;

let pool: pg.Pool | undefined;

function getOrCreatePool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10
    });

    pool.on('error', (error: Error) => {
      logger.error({ err: error }, 'postgres pool error');
    });
  }

  return pool;
}

export function getDb() {
  return drizzle(getOrCreatePool(), { schema });
}

export async function pingDb() {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export async function closeDb() {
  await pool?.end();
}
