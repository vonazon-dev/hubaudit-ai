import { Router, Request, Response } from 'express';
import { requirePortal } from '../middleware/requirePortal';
import { cadenceGuard } from '../services/cadenceGuard';
import { runAudit, AuditResult } from '../audit/orchestrator';
import { generatePdf, savePdfLocally } from '../pdf/pdfGenerator';
import { sendReportEmail } from '../email/emailDelivery';
import { getValidAccessToken } from '../services/hubspotOAuth';
import { logger } from '../lib/logger';

// In-memory store of last audit result per portal (for debug endpoint)
const lastResults = new Map<number, AuditResult>();

const router = Router();

/**
 * GET /api/health
 * Basic liveness probe for DigitalOcean health checks.
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
 * GET /api/status?portalId=XXXXX
 * Returns audit eligibility status for a portal.
 */
router.get('/status', requirePortal, (_req: Request, res: Response) => {
  const portalId: number = res.locals.portalId;
  const status = cadenceGuard.getStatus(portalId);
  res.json({ portalId, ...status });
});

/**
 * POST /api/audit/trigger
 * Kicks off the audit pipeline (stub for Phase 0 — real logic in Phase 1+).
 */
router.post('/audit/trigger', requirePortal, (_req: Request, res: Response) => {
  const portalId: number = res.locals.portalId;
  const status = cadenceGuard.getStatus(portalId);

  // TODO: re-enable before production
  // if (!status.eligible) {
  //   return res.status(429).json({
  //     error: 'Audit not yet eligible',
  //     nextEligibleDate: status.nextEligibleDate,
  //     daysUntilEligible: status.daysUntilEligible,
  //     message: `Your next audit is available in ${status.daysUntilEligible} day(s).`,
  //   });
  // }

  // TODO: re-enable cadence enforcement before production
  // cadenceGuard.markAuditRun(portalId);

  // Run audit asynchronously — respond immediately, send report by email when done
  res.json({
    success: true,
    message: 'Audit started. This typically takes 2–5 minutes. You will receive your report by email.',
    portalId,
  });

  // Fire and forget — errors are logged, not propagated to the already-sent response
  runAudit(portalId)
    .then(async (result) => {
      lastResults.set(portalId, result);
      logger.info('Audit pipeline complete', {
        portalId,
        overall: result.scores.overall,
        recommendations: result.analysis.recommendations.length,
        critical: result.analysis.recommendations.filter(r => r.risk === 'critical').length,
        durationMs: result.durationMs,
      });

      // Phase 3: PDF generation
      const portalName = process.env.PORTAL_NAME ?? `Portal ${portalId}`;
      const recipientEmail = process.env.REPORT_RECIPIENT_EMAIL;
      const recipientName  = process.env.REPORT_RECIPIENT_NAME ?? 'HubSpot Admin';

      try {
        const pdfBuffer = await generatePdf(result.payload, result.scores, result.analysis, portalName);

        // Always save locally in dev so you can inspect the PDF
        if (process.env.NODE_ENV !== 'production') {
          const filepath = await savePdfLocally(pdfBuffer, portalId);
          logger.info('PDF saved for local inspection', { filepath });
        }

        // Send email if recipient is configured
        if (recipientEmail) {
          const accessToken = await getValidAccessToken(portalId);
          await sendReportEmail({
            toEmail: recipientEmail,
            toName: recipientName,
            portalId,
            portalName,
            overallScore: result.scores.overall,
            criticalCount: result.analysis.recommendations.filter(r => r.risk === 'critical').length,
            recommendationCount: result.analysis.recommendations.length,
            pdfBuffer,
            auditDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            accessToken,
          });
        } else {
          logger.info('REPORT_RECIPIENT_EMAIL not set — skipping email delivery', { portalId });
        }
      } catch (err: any) {
        logger.error('PDF/email step failed', { portalId, error: err.message });
      }
    })
    .catch((err: Error) => {
      logger.error('Audit pipeline failed', { portalId, error: err.message });
      // Roll back cadence mark so the user can retry
      cadenceGuard.seed(portalId, new Date(0));
    });
});

/**
 * GET /api/debug/result?portalId=XXXXX
 * Returns the last full audit result as JSON — for testing only.
 * Remove or gate behind auth before production.
 */
router.get('/debug/result', requirePortal, (_req: Request, res: Response) => {
  const portalId: number = res.locals.portalId;
  const result = lastResults.get(portalId);

  if (!result) {
    return res.status(404).json({ error: 'No audit result found. Trigger an audit first.' });
  }

  return res.json({
    portalId,
    scores: result.scores,
    executiveSummary: result.analysis.executiveSummary,
    recommendations: result.analysis.recommendations,
    modelUsed: result.analysis.modelUsed,
    generatedAt: result.analysis.generatedAt,
    durationMs: result.durationMs,
  });
});

export default router;
