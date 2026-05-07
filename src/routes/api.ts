import { Router, Request, Response } from 'express';
import { requirePortal } from '../middleware/requirePortal';
import { auditResultStore } from '../lib/auditResultStore';
import { fireAudit } from '../services/auditRunner';
import { logger } from '../lib/logger';

const router = Router();

/**
 * GET /api/health
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? 'development',
  });
});

/**
 * GET /api/report?portalId=XXXXX
 * Returns stored audit result for a portal.
 * Called by the HubSpot app page via hubspot.fetch.
 */
router.get('/report', requirePortal, async (_req: Request, res: Response) => {
  const portalId: number = res.locals.portalId;

  try {
    const record = await auditResultStore.get(portalId);

    if (!record) {
      return res.status(404).json({
        error: 'No audit found for this portal.',
        portalId,
      });
    }

    return res.json({
      portalId,
      status: record.status,
      result: record.result,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  } catch (err: any) {
    logger.error('Failed to fetch audit result', { portalId, error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/audit/trigger?portalId=XXXXX
 * Manually re-triggers the audit (used by the retry button in the app page).
 */
router.post('/audit/trigger', requirePortal, async (_req: Request, res: Response) => {
  const portalId: number = res.locals.portalId;

  res.json({
    success: true,
    message: 'Audit started. Check /api/report for status.',
    portalId,
  });

  fireAudit(portalId);
});

export default router;
