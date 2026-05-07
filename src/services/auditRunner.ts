import { runAudit } from '../audit/orchestrator';
import { auditResultStore } from '../lib/auditResultStore';
import { logger } from '../lib/logger';

/**
 * Marks the portal's audit as pending, fires the audit pipeline,
 * then persists the result (complete or failed) to Postgres.
 * Never throws — errors are logged and written to the DB.
 */
export async function fireAudit(portalId: number): Promise<void> {
  await auditResultStore.create(portalId);

  runAudit(portalId)
    .then(async (result) => {
      await auditResultStore.markComplete(portalId, result);

      logger.info('Audit complete', {
        portalId,
        overall: result.scores.overall,
        recommendations: result.analysis.recommendations.length,
        durationMs: result.durationMs,
      });

      if (process.env.NODE_ENV !== 'production') {
        const { scores, analysis, durationMs } = result;
        console.log('\n========== AUDIT RESULT ==========');
        console.log(`Portal:       ${portalId}`);
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
    .catch(async (err: Error) => {
      await auditResultStore.markFailed(portalId);
      logger.error('Audit failed', { portalId, error: err.message });
    });
}
