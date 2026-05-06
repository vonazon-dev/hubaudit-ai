/**
 * Scoring engine.
 * Each category scored 0–100, then weighted into an overall health score.
 *
 * Weights (must sum to 100):
 *   CRM Cleanliness   30%
 *   Process Health    30%
 *   Feature Adoption  20%
 *   User Activity     20%
 */
import { AuditPayload } from '../types/audit';

export interface CategoryScores {
  crmCleanliness: number;
  processHealth: number;
  featureAdoption: number;
  userActivity: number;
  overall: number;
}

const WEIGHTS = {
  crmCleanliness: 0.30,
  processHealth:  0.30,
  featureAdoption: 0.20,
  userActivity:   0.20,
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreCrmCleanliness(data: AuditPayload['crmCleanliness']): number {
  const scores = [
    data.contacts.completenessScore,
    data.companies.completenessScore,
    data.deals.completenessScore,
    data.tickets.completenessScore,
  ].filter((s) => s >= 0);

  if (scores.length === 0) return 50;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Penalise for unassigned and stagnant records
  const totalRecords =
    data.contacts.total + data.companies.total + data.deals.total + data.tickets.total;
  const totalStagnant =
    data.contacts.stagnant + data.companies.stagnant + data.deals.stagnant + data.tickets.stagnant;
  const stagnantPenalty = totalRecords > 0 ? (totalStagnant / totalRecords) * 20 : 0;

  return clamp(avg - stagnantPenalty);
}

function scoreProcessHealth(data: AuditPayload['processHealth']): number {
  // Workflow health: % active with descriptions
  const totalWorkflows = data.workflows.length;
  const goodWorkflows = data.workflows.filter((w) => w.enabled && w.hasDescription).length;
  const workflowScore = totalWorkflows > 0 ? (goodWorkflows / totalWorkflows) * 100 : 60;

  // Pipeline health: penalise stagnant and missing data
  const totalDeals = data.pipelines.reduce((a, p) => a + p.dealsInPipeline, 0);
  const stagnantDeals = data.pipelines.reduce((a, p) => a + p.stagnantDeals, 0);
  const missingData = data.pipelines.reduce(
    (a, p) => a + p.missingCloseDate + p.missingAmount, 0
  );
  const pipelineScore =
    totalDeals > 0
      ? 100 - ((stagnantDeals + missingData) / (totalDeals * 3)) * 100
      : 60;

  const requiredScore = data.requiredFieldsAdherence >= 0 ? data.requiredFieldsAdherence : 60;

  // Lifecycle gaps penalty
  const lifecyclePenalty = data.lifecycleStageGaps.length * 5;

  const raw = (workflowScore * 0.35 + pipelineScore * 0.35 + requiredScore * 0.30) - lifecyclePenalty;
  return clamp(raw);
}

function scoreFeatureAdoption(data: AuditPayload['featureAdoption']): number {
  const checks: number[] = [];

  // Sequences being used
  if (data.sequences.total > 0) {
    checks.push((data.sequences.active / data.sequences.total) * 100);
  }

  // Lists have active records
  if (data.lists.total > 0) {
    checks.push((data.lists.active / data.lists.total) * 100);
  }

  // Forms in use
  if (data.forms.total > 0) {
    checks.push((data.forms.active / data.forms.total) * 100);
  }

  // Reports created
  checks.push(Math.min(data.reports.total * 5, 100));

  // Integrations connected
  checks.push(Math.min(data.integrations.length * 20, 100));

  // Email deliverability
  if (data.emailDeliverability.bounceRate !== null) {
    const bounceScore = Math.max(0, 100 - data.emailDeliverability.bounceRate * 10);
    checks.push(bounceScore);
  }

  if (checks.length === 0) return 40;
  return clamp(checks.reduce((a, b) => a + b, 0) / checks.length);
}

function scoreUserActivity(data: AuditPayload['userActivity']): number {
  if (data.total === 0) return 50;

  const activeRate = (data.active / data.total) * 100;
  const neverLoggedInPenalty = (data.neverLoggedIn / data.total) * 30;
  const superAdminPenalty = Math.max(0, data.superAdmins - 2) * 5; // >2 super admins is a risk
  const noRolePenalty = (data.usersWithNoRole / data.total) * 20;

  return clamp(activeRate - neverLoggedInPenalty - superAdminPenalty - noRolePenalty);
}

export function calculateScores(payload: AuditPayload): CategoryScores {
  const crmCleanliness = scoreCrmCleanliness(payload.crmCleanliness);
  const processHealth = scoreProcessHealth(payload.processHealth);
  const featureAdoption = scoreFeatureAdoption(payload.featureAdoption);
  const userActivity = scoreUserActivity(payload.userActivity);

  const overall = clamp(
    crmCleanliness * WEIGHTS.crmCleanliness +
    processHealth  * WEIGHTS.processHealth +
    featureAdoption * WEIGHTS.featureAdoption +
    userActivity   * WEIGHTS.userActivity
  );

  return { crmCleanliness, processHealth, featureAdoption, userActivity, overall };
}
