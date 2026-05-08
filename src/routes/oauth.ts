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

    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HubAudit AI — Installed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f8fa; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); padding: 48px 40px; max-width: 480px; width: 100%; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #1a1a2e; font-size: 24px; margin: 0 0 12px; }
    p { color: #516f90; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
    .badge { display: inline-block; background: #e5f5f0; color: #00bda5; border-radius: 20px; padding: 4px 14px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    a.btn { display: inline-block; background: #ff7a59; color: #fff; text-decoration: none; border-radius: 6px; padding: 12px 28px; font-weight: 600; font-size: 15px; transition: background .2s; }
    a.btn:hover { background: #e8674a; }
    .note { margin-top: 20px; font-size: 13px; color: #99acc2; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <div class="badge">Audit Running</div>
    <h1>HubAudit AI Installed</h1>
    <p>Your portal audit is running in the background — this typically takes 2–5 minutes. Once complete, your full report will be waiting inside HubSpot.</p>
    <a class="btn" href="https://app.hubspot.com/">Open HubSpot</a>
    <p class="note">Find <strong>HubAudit AI</strong> in the left sidebar navigation to view your report.</p>
  </div>
</body>
</html>`);
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
