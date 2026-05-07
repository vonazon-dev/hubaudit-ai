import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { buildAuthUrl, exchangeCode } from '../services/hubspotOAuth';
import { tokenStore } from '../lib/tokenStore';
import { fireAudit } from '../services/auditRunner';
import { logger } from '../lib/logger';

const router = Router();

// Temporary CSRF state store (in-memory is fine — states expire in 10 min)
const pendingStates = new Map<string, number>(); // token → timestamp

/**
 * GET /oauth/install
 * Kick off the HubSpot OAuth flow.
 */
router.get('/install', (_req: Request, res: Response) => {
  const csrfToken = crypto.randomBytes(16).toString('hex');
  pendingStates.set(csrfToken, Date.now());

  // Clean up states older than 10 minutes
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [token, ts] of pendingStates) {
    if (ts < cutoff) pendingStates.delete(token);
  }

  const url = buildAuthUrl(csrfToken);
  logger.info('OAuth install initiated');
  res.redirect(url);
});

/**
 * GET /oauth/callback
 * HubSpot redirects here after the user approves the app.
 * Tokens are persisted to Postgres, then a one-time audit is fired in the background.
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    logger.warn('OAuth denied by user', { error });
    return res.status(400).send(`
      <h2>Installation cancelled</h2>
      <p>${error}</p>
      <a href="/oauth/install">Try again</a>
    `);
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  if (!pendingStates.has(state)) {
    logger.warn('OAuth CSRF state mismatch', { state });
    return res.status(400).json({ error: 'Invalid or expired state. Please reinstall.' });
  }

  pendingStates.delete(state);

  try {
    const tokens = await exchangeCode(code);
    logger.info('Installation complete', { portalId: tokens.portalId });

    // Fire one-time audit in background — persists result to DB via auditRunner
    fireAudit(tokens.portalId);

    return res.send(`
      <h2>HubAudit AI installed successfully!</h2>
      <p>Portal ID: <strong>${tokens.portalId}</strong></p>
      <p>Your audit is running in the background. You will receive your report by email shortly.</p>
    `);
  } catch (err) {
    logger.error('OAuth exchange failed', { err });
    return res.status(500).send(`
      <h2>Installation failed</h2>
      <p>Please try again. If the problem persists, contact support.</p>
      <a href="/oauth/install">Retry</a>
    `);
  }
});

/**
 * POST /oauth/uninstall
 * HubSpot calls this webhook when the app is uninstalled.
 */
router.post('/uninstall', async (req: Request, res: Response) => {
  const { portalId } = req.body as { portalId?: number };

  if (!portalId) {
    return res.status(400).json({ error: 'Missing portalId' });
  }

  await tokenStore.delete(portalId);
  logger.info('App uninstalled, tokens deleted', { portalId });
  return res.json({ success: true });
});

export default router;
