/**
 * AI analysis service.
 *
 * Provider is controlled by AI_PROVIDER env var ('azure' | 'openai').
 * Model, token budget, and temperature are all env-configurable —
 * change them without touching this file.
 *
 * To switch providers in future:
 *   AI_PROVIDER=openai
 *   OPENAI_API_KEY=sk-...
 *   AI_MODEL_NAME=gpt-4o
 *
 * To switch Azure deployments:
 *   AZURE_OPENAI_DEPLOYMENT=gpt-4o
 *   AI_MODEL_NAME=gpt-4o
 */
import OpenAI, { AzureOpenAI } from 'openai';
import { AuditPayload } from '../types/audit';
import { CategoryScores } from './scoringEngine';
import { AiAnalysis, Recommendation, ExecutiveSummary } from '../types/aiAnalysis';
import { buildAuditPrompt } from './promptBuilder';
import { logger } from '../lib/logger';

// ── Model config (all env-driven, no code change needed) ──────────────
function getModelConfig() {
  return {
    provider:    (process.env.AI_PROVIDER ?? 'azure') as 'azure' | 'openai',
    model:       process.env.AI_MODEL_NAME ?? 'gpt-4o-mini',
    maxTokens:   parseInt(process.env.AI_MAX_TOKENS ?? '2500', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE ?? '0.3'),
    deployment:  process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AI_MODEL_NAME ?? 'gpt-4o-mini',
  };
}

// ── Client factory ─────────────────────────────────────────────────────
function createAiClient(): OpenAI | AzureOpenAI {
  const { provider } = getModelConfig();

  if (provider === 'azure') {
    const apiKey    = process.env.AZURE_OPENAI_API_KEY;
    const endpoint  = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview';

    if (!apiKey || !endpoint) {
      throw new Error('Azure OpenAI requires AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
    }

    return new AzureOpenAI({ apiKey, endpoint, apiVersion });
  }

  // Standard OpenAI
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey });
}

// ── Response validation ────────────────────────────────────────────────
function validateRecommendation(r: any): r is Recommendation {
  return (
    typeof r.id === 'string' &&
    ['critical', 'high', 'medium', 'low'].includes(r.risk) &&
    ['crm_cleanliness', 'process_health', 'feature_adoption', 'user_activity'].includes(r.category) &&
    typeof r.title === 'string' &&
    typeof r.problem === 'string' &&
    typeof r.impact === 'string' &&
    typeof r.action === 'string'
  );
}

function validateExecutiveSummary(s: any): s is ExecutiveSummary {
  return (
    typeof s.overallVerdict === 'string' &&
    Array.isArray(s.topWins) &&
    Array.isArray(s.topGaps) &&
    typeof s.closingNote === 'string'
  );
}

function parseAiResponse(raw: string): {
  executiveSummary: ExecutiveSummary;
  recommendations: Recommendation[];
} {
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  if (!validateExecutiveSummary(parsed.executiveSummary)) {
    throw new Error('Invalid executiveSummary structure in AI response');
  }

  const recommendations = (parsed.recommendations ?? []).filter(validateRecommendation);
  if (recommendations.length === 0) throw new Error('AI returned no valid recommendations');

  const riskOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a: Recommendation, b: Recommendation) =>
    riskOrder[a.risk] - riskOrder[b.risk]
  );

  return { executiveSummary: parsed.executiveSummary, recommendations };
}

// ── Fallback (no API key or call failed) ──────────────────────────────
function buildFallbackAnalysis(scores: CategoryScores): {
  executiveSummary: ExecutiveSummary;
  recommendations: Recommendation[];
} {
  const lowestCategory = (
    Object.entries({
      crm_cleanliness: scores.crmCleanliness,
      process_health: scores.processHealth,
      feature_adoption: scores.featureAdoption,
      user_activity: scores.userActivity,
    }) as [Recommendation['category'], number][]
  ).sort(([, a], [, b]) => a - b)[0][0];

  return {
    executiveSummary: {
      overallVerdict: `Your portal scored ${scores.overall}/100 — AI analysis is temporarily unavailable, but your scores highlight areas for improvement.`,
      topWins: ['Portal connected and data collection working', 'Audit cadence is now active'],
      topGaps: ['AI analysis unavailable — check your AI provider env vars', 'Review scores manually to identify priorities'],
      closingNote: 'Re-run the audit once the AI connection is restored for full recommendations.',
    },
    recommendations: [
      {
        id: 'rec_fallback_001',
        risk: scores.overall < 50 ? 'critical' : 'high',
        category: lowestCategory,
        title: 'Review your lowest-scoring category',
        problem: `Your overall score is ${scores.overall}/100. The lowest category needs immediate attention.`,
        impact: 'Improving data quality and process health directly impacts pipeline visibility and revenue accuracy.',
        action: 'Log into HubSpot and address the category with the lowest score first.',
        hubspotUrl: 'https://app.hubspot.com/contacts',
      },
    ],
  };
}

// ── Main export ───────────────────────────────────────────────────────
export async function runAiAnalysis(
  payload: AuditPayload,
  scores: CategoryScores,
): Promise<AiAnalysis> {
  const { provider, model, deployment, maxTokens, temperature } = getModelConfig();

  logger.info('Starting AI analysis', {
    portalId: payload.portalId,
    provider,
    model: provider === 'azure' ? deployment : model,
    overall: scores.overall,
  });

  try {
    const client = createAiClient();
    const prompt = buildAuditPrompt(payload, scores);

    // Azure uses 'model' field to specify the deployment name
    const response = await client.chat.completions.create({
      model: provider === 'azure' ? deployment : model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content: 'You are a HubSpot RevOps expert. Return only valid JSON matching the exact structure requested. No markdown, no preamble.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '';

    logger.info('AI response received', {
      portalId: payload.portalId,
      provider,
      tokens: response.usage?.total_tokens,
    });

    const { executiveSummary, recommendations } = parseAiResponse(raw);

    return {
      executiveSummary,
      recommendations,
      generatedAt: new Date().toISOString(),
      modelUsed: `${provider}/${provider === 'azure' ? deployment : model}`,
    };
  } catch (err: any) {
    logger.error('AI analysis failed — using fallback', {
      portalId: payload.portalId,
      provider,
      error: err.message,
    });

    return {
      ...buildFallbackAnalysis(scores),
      generatedAt: new Date().toISOString(),
      modelUsed: 'fallback',
    };
  }
}

