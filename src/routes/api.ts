import { Router, Request, Response } from 'express';
import { requirePortal } from '../middleware/requirePortal';
import { auditResultStore } from '../lib/auditResultStore';
import { fireAudit } from '../services/auditRunner';
import { logger } from '../lib/logger';

const router = Router();

/**
 * GET /api/logo.svg
 * App logo — served so HubSpot UI Extensions can load it via permittedUrls.img.
 */
const LOGO_SVG = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="10" fill="#FF7A59"/>
  <circle cx="20" cy="20" r="8.5" stroke="white" stroke-width="2.5"/>
  <line x1="26.5" y1="26.5" x2="34.5" y2="34.5" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="16" y1="20" x2="24" y2="20" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.9"/>
  <line x1="20" y1="16" x2="20" y2="24" stroke="white" stroke-width="1.8" stroke-linecap="round" opacity="0.9"/>
  <circle cx="20" cy="20" r="2.5" fill="white"/>
</svg>`;

router.get('/logo.svg', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(LOGO_SVG);
});

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
