/**
 * Audit orchestrator.
 * Creates the HubSpot client, runs all 4 modules in parallel,
 * calculates scores, and returns the complete AuditPayload.
 */
import { createHubSpotClient } from '../lib/hubspotClient';
import { runCrmCleanliness } from './modules/crmCleanliness';
import { runProcessHealth } from './modules/processHealth';
import { runFeatureAdoption } from './modules/featureAdoption';
import { runUserActivity } from './modules/userActivity';
import { calculateScores, CategoryScores } from './scoringEngine';
import { runAiAnalysis } from './aiAnalysis';
import { AuditPayload } from '../types/audit';
import { AiAnalysis } from '../types/aiAnalysis';
import { logger } from '../lib/logger';

const empty = () => ({
  total: 0, unassigned: 0, missingEmail: 0,
  missingName: 0, missingPhone: 0, stagnant: 0, completenessScore: 0,
});

export interface AuditResult {
  payload: AuditPayload;
  scores: CategoryScores;
  analysis: AiAnalysis;
  durationMs: number;
}

export async function runAudit(portalId: number): Promise<AuditResult> {
  const start = Date.now();
  logger.info('Audit started', { portalId });

  const client = createHubSpotClient(portalId);

  // Run all 4 modules in parallel — each handles its own errors gracefully
  const [crmCleanliness, processHealth, featureAdoption, userActivity] = await Promise.all([
    runCrmCleanliness(client).catch((err) => {
      logger.error('CRM cleanliness module failed', { error: err.message });
      return { contacts: empty(), companies: empty(), deals: empty(), tickets: empty(), duplicateEstimates: [] };
    }),
    runProcessHealth(client).catch((err) => {
      logger.error('Process health module failed', { error: err.message });
      return { pipelines: [], workflows: [], requiredFieldsAdherence: -1, lifecycleStageGaps: [] };
    }),
    runFeatureAdoption(client).catch((err) => {
      logger.error('Feature adoption module failed', { error: err.message });
      return { sequences: { active: 0, total: 0 }, lists: { active: 0, total: 0, unused: 0 }, forms: { active: 0, total: 0 }, reports: { total: 0, dashboardCount: 0 }, emailDeliverability: { bounceRate: null, unsubscribeRate: null }, integrations: [] };
    }),
    runUserActivity(client).catch((err) => {
      logger.error('User activity module failed', { error: err.message });
      return { total: 0, active: 0, inactive: 0, neverLoggedIn: 0, superAdmins: 0, usersWithNoRole: 0, users: [] };
    }),
  ]);

  const payload: AuditPayload = {
    portalId,
    collectedAt: new Date().toISOString(),
    crmCleanliness,
    processHealth,
    featureAdoption,
    userActivity,
  };

  const scores = calculateScores(payload);

  // Phase 2: AI analysis
  const analysis = await runAiAnalysis(payload, scores);

  const durationMs = Date.now() - start;

  logger.info('Audit complete', { portalId, overall: scores.overall, recommendations: analysis.recommendations.length, durationMs });

  return { payload, scores, analysis, durationMs };
}
