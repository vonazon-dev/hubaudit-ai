import { pool } from './db';
import { AuditResult } from '../audit/orchestrator';

export type AuditStatus = 'pending' | 'complete' | 'failed';

export interface AuditRecord {
  status: AuditStatus;
  result: AuditResult | null;
  createdAt: Date;
  updatedAt: Date;
}

export const auditResultStore = {
  async create(portalId: number): Promise<void> {
    await pool.query(
      `INSERT INTO audit_results (portal_id, status, result, created_at, updated_at)
       VALUES ($1, 'pending', NULL, NOW(), NOW())
       ON CONFLICT (portal_id) DO UPDATE
         SET status = 'pending', result = NULL, updated_at = NOW()`,
      [portalId],
    );
  },

  async markComplete(portalId: number, result: AuditResult): Promise<void> {
    await pool.query(
      `UPDATE audit_results
       SET status = 'complete', result = $2, updated_at = NOW()
       WHERE portal_id = $1`,
      [portalId, JSON.stringify(result)],
    );
  },

  async markFailed(portalId: number): Promise<void> {
    await pool.query(
      `UPDATE audit_results
       SET status = 'failed', updated_at = NOW()
       WHERE portal_id = $1`,
      [portalId],
    );
  },

  async get(portalId: number): Promise<AuditRecord | null> {
    const { rows } = await pool.query(
      `SELECT status, result, created_at, updated_at
       FROM audit_results WHERE portal_id = $1`,
      [portalId],
    );
    if (!rows[0]) return null;
    return {
      status: rows[0].status as AuditStatus,
      result: rows[0].result as AuditResult | null,
      createdAt: rows[0].created_at,
      updatedAt: rows[0].updated_at,
    };
  },
};
