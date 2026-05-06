/**
 * Builds the structured prompt sent to GPT-4o.
 * Keeps token count lean by summarising metrics, not dumping raw JSON.
 */
import { AuditPayload } from '../types/audit';
import { CategoryScores } from './scoringEngine';

export function buildAuditPrompt(payload: AuditPayload, scores: CategoryScores): string {
  const { crmCleanliness: crm, processHealth: proc, featureAdoption: feat, userActivity: users } = payload;

  const metrics = {
    scores,
    crm: {
      contacts: {
        total: crm.contacts.total,
        unassigned: crm.contacts.unassigned,
        missingEmail: crm.contacts.missingEmail,
        missingPhone: crm.contacts.missingPhone,
        stagnant: crm.contacts.stagnant,
        completeness: crm.contacts.completenessScore,
      },
      companies: {
        total: crm.companies.total,
        unassigned: crm.companies.unassigned,
        stagnant: crm.companies.stagnant,
        completeness: crm.companies.completenessScore,
      },
      deals: {
        total: crm.deals.total,
        unassigned: crm.deals.unassigned,
        stagnant: crm.deals.stagnant,
        missingAmount: crm.deals.missingPhone, // reused field
        completeness: crm.deals.completenessScore,
      },
      tickets: {
        total: crm.tickets.total,
        unassigned: crm.tickets.unassigned,
        stagnant: crm.tickets.stagnant,
        completeness: crm.tickets.completenessScore,
      },
    },
    process: {
      pipelineCount: proc.pipelines.length,
      totalDeals: proc.pipelines.reduce((a, p) => a + p.dealsInPipeline, 0),
      totalStagnantDeals: proc.pipelines.reduce((a, p) => a + p.stagnantDeals, 0),
      totalMissingCloseDate: proc.pipelines.reduce((a, p) => a + p.missingCloseDate, 0),
      totalMissingAmount: proc.pipelines.reduce((a, p) => a + p.missingAmount, 0),
      workflowCount: proc.workflows.length,
      activeWorkflows: proc.workflows.filter((w) => w.enabled).length,
      workflowsWithoutDescription: proc.workflows.filter((w) => !w.hasDescription).length,
      requiredFieldsAdherence: proc.requiredFieldsAdherence,
      lifecycleStageGaps: proc.lifecycleStageGaps,
    },
    features: {
      sequences: feat.sequences,
      lists: feat.lists,
      forms: feat.forms,
      reports: feat.reports,
      emailBounceRate: feat.emailDeliverability.bounceRate,
      emailUnsubscribeRate: feat.emailDeliverability.unsubscribeRate,
      connectedIntegrations: feat.integrations.length,
    },
    users: {
      total: users.total,
      active: users.active,
      inactive: users.inactive,
      neverLoggedIn: users.neverLoggedIn,
      superAdmins: users.superAdmins,
      usersWithNoRole: users.usersWithNoRole,
    },
  };

  return `You are an expert HubSpot RevOps consultant performing a quarterly portal health audit.

PORTAL METRICS (JSON):
${JSON.stringify(metrics, null, 2)}

HEALTH SCORES (0–100):
- Overall: ${scores.overall}
- CRM Cleanliness: ${scores.crmCleanliness}
- Process Health: ${scores.processHealth}
- Feature Adoption: ${scores.featureAdoption}
- User Activity: ${scores.userActivity}

YOUR TASK:
Analyse the metrics and return a JSON object with EXACTLY this structure:

{
  "executiveSummary": {
    "overallVerdict": "<1 sentence overall assessment mentioning the score and 1–2 key themes>",
    "topWins": ["<win 1>", "<win 2>"],
    "topGaps": ["<gap 1>", "<gap 2>", "<gap 3>"],
    "closingNote": "<1 encouraging sentence about the path forward>"
  },
  "recommendations": [
    {
      "id": "rec_001",
      "risk": "critical|high|medium|low",
      "category": "crm_cleanliness|process_health|feature_adoption|user_activity",
      "title": "<short title, max 8 words>",
      "problem": "<what is wrong, 1–2 sentences, reference actual numbers from metrics>",
      "impact": "<why this matters for revenue/efficiency, 1 sentence>",
      "action": "<the single most important next step, be specific>",
      "hubspotUrl": "<relevant HubSpot settings URL if applicable, else omit>"
    }
  ]
}

RULES:
- Return ONLY valid JSON. No markdown, no preamble, no explanation outside the JSON.
- Generate 6–10 recommendations total.
- At least 1 must be "critical" if any score is below 50. At least 2 must be "high".
- Reference actual numbers (e.g. "23 of 47 users have never logged in") not vague statements.
- Tone: professional, direct, non-judgmental. Focus on ROI and quick wins.
- If a metric is 0 or -1 (data unavailable), skip recommendations for that area.
- hubspotUrl examples: "https://app.hubspot.com/contacts/settings/properties", "https://app.hubspot.com/workflows"
`;
}
