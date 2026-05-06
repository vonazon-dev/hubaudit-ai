import crypto from 'crypto';
import { pool } from './db';
import { HubSpotTokens } from '../types';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString() + decipher.final('utf8');
}

export const tokenStore = {
  async save(tokens: HubSpotTokens): Promise<void> {
    const encrypted = encrypt(
      JSON.stringify({ ...tokens, expiresAt: tokens.expiresAt.toISOString() }),
    );
    await pool.query(
      `INSERT INTO portal_tokens (portal_id, encrypted, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (portal_id) DO UPDATE
         SET encrypted = $2, updated_at = NOW()`,
      [tokens.portalId, encrypted],
    );
    logger.info('Tokens saved', { portalId: tokens.portalId });
  },

  async get(portalId: number): Promise<HubSpotTokens | null> {
    const { rows } = await pool.query(
      'SELECT encrypted FROM portal_tokens WHERE portal_id = $1',
      [portalId],
    );
    if (!rows[0]) return null;
    const parsed = JSON.parse(decrypt(rows[0].encrypted));
    return { ...parsed, expiresAt: new Date(parsed.expiresAt) } as HubSpotTokens;
  },

  async delete(portalId: number): Promise<void> {
    await pool.query('DELETE FROM portal_tokens WHERE portal_id = $1', [portalId]);
    logger.info('Tokens deleted', { portalId });
  },

  async has(portalId: number): Promise<boolean> {
    const { rows } = await pool.query(
      'SELECT 1 FROM portal_tokens WHERE portal_id = $1',
      [portalId],
    );
    return rows.length > 0;
  },
};
