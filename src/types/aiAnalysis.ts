/**
 * Types for the AI-generated analysis layer.
 * These are what the LLM returns, validated and typed before PDF generation.
 */

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export interface Recommendation {
  id: string;
  risk: RiskLevel;
  category: 'crm_cleanliness' | 'process_health' | 'feature_adoption' | 'user_activity';
  title: string;
  problem: string;       // What is wrong
  impact: string;        // Why it matters (quantified where possible)
  action: string;        // Exact next step
  hubspotUrl?: string;   // Deep link into HubSpot settings
}

export interface ExecutiveSummary {
  overallVerdict: string;      // 1 sentence: "Your portal is in good shape but has critical gaps in..."
  topWins: string[];           // 2–3 things going well
  topGaps: string[];           // 2–3 most urgent problems
  closingNote: string;         // Encouraging 1-sentence close
}

export interface AiAnalysis {
  executiveSummary: ExecutiveSummary;
  recommendations: Recommendation[];
  generatedAt: string;
  modelUsed: string;
}
