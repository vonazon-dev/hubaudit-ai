import { Pool } from 'pg';
import { logger } from './logger';

// DO managed PG appends ?sslmode=require which newer pg treats as verify-full,
// rejecting DO's self-signed CA. Strip it so our explicit ssl config wins.
function sanitizeDbUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return raw;
  }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
    ? sanitizeDbUrl(process.env.DATABASE_URL)
    : undefined,
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
