import { Request, Response, NextFunction } from 'express';
import { tokenStore } from '../lib/tokenStore';

/**
 * Expects ?portalId=XXXXXX (or req.body.portalId) on all protected routes.
 * Validates that we have tokens for that portal.
 */
export async function requirePortal(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = req.query.portalId ?? req.body?.portalId;
  const portalId = parseInt(String(raw), 10);

  if (isNaN(portalId)) {
    res.status(400).json({ error: 'Missing or invalid portalId parameter' });
    return;
  }

  if (!(await tokenStore.has(portalId))) {
    res.status(401).json({
      error: 'Portal not connected. Complete OAuth installation first.',
      installUrl: '/oauth/install',
    });
    return;
  }

  res.locals.portalId = portalId;
  next();
}
