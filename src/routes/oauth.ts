import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { buildAuthUrl, exchangeCode } from '../services/hubspotOAuth';
import { tokenStore } from '../lib/tokenStore';
import { runAudit } from '../audit/orchestrator';
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

    // Fire one-time audit in background — don't block the install response
    runAudit(tokens.portalId)
      .then((result) => {
        if (process.env.NODE_ENV !== 'production') {
          const { scores, analysis, durationMs } = result;
          console.log('\n========== AUDIT RESULT ==========');
          console.log(`Portal:       ${tokens.portalId}`);
          console.log(`Duration:     ${durationMs}ms`);
          console.log(`\nSCORES`);
          console.log(`  Overall:          ${scores.overall}`);
          console.log(`  CRM Cleanliness:  ${scores.crmCleanliness}`);
          console.log(`  Process Health:   ${scores.processHealth}`);
          console.log(`  Feature Adoption: ${scores.featureAdoption}`);
          console.log(`  User Activity:    ${scores.userActivity}`);
          console.log(`\nEXECUTIVE SUMMARY`);
          console.log(`  ${analysis.executiveSummary.overallVerdict}`);
          console.log(`\n  Wins:`);
          analysis.executiveSummary.topWins.forEach((w) => console.log(`    + ${w}`));
          console.log(`\n  Gaps:`);
          analysis.executiveSummary.topGaps.forEach((g) => console.log(`    - ${g}`));
          console.log(`\n  ${analysis.executiveSummary.closingNote}`);
          console.log(`\nRECOMMENDATIONS (${analysis.recommendations.length} total)`);
          analysis.recommendations.forEach((r, i) => {
            console.log(`\n  [${i + 1}] [${r.risk.toUpperCase()}] ${r.title}`);
            console.log(`      Problem: ${r.problem}`);
            console.log(`      Impact:  ${r.impact}`);
            console.log(`      Action:  ${r.action}`);
          });
          console.log('\n==================================\n');
        }
      })
      .catch((err: Error) => {
        logger.error('Post-install audit failed', { portalId: tokens.portalId, error: err.message });
      });

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
