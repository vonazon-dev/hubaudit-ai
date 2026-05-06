import { Pool } from 'pg';
import { logger } from './logger';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_tokens (
      portal_id   BIGINT       PRIMARY KEY,
      encrypted   TEXT         NOT NULL,
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  logger.info('Database ready');
}
