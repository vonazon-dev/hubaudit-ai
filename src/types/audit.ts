/**
 * Shared types for the audit data payload.
 * Each module returns its own section; the orchestrator merges them.
 */

export interface CrmCleanlinessData {
  contacts: ObjectStats;
  companies: ObjectStats;
  deals: ObjectStats;
  tickets: ObjectStats;
  duplicateEstimates: DuplicateEstimate[];
}

export interface ObjectStats {
  total: number;
  unassigned: number;
  missingEmail: number;       // contacts only
  missingName: number;
  missingPhone: number;
  stagnant: number;           // no activity in 90+ days
  completenessScore: number;  // 0–100
}

export interface DuplicateEstimate {
  objectType: string;
  estimatedDuplicates: number;
}

export interface ProcessHealthData {
  pipelines: PipelineStat[];
  workflows: WorkflowStat[];
  requiredFieldsAdherence: number; // 0–100 % of required fields populated
  lifecycleStageGaps: string[];    // stages with 0 records
}

export interface PipelineStat {
  id: string;
  label: string;
  stageCount: number;
  dealsInPipeline: number;
  stagnantDeals: number;      // no activity 30+ days
  missingCloseDate: number;
  missingAmount: number;
}

export interface WorkflowStat {
  id: number;
  name: string;
  enabled: boolean;
  hasDescription: boolean;
  enrolledCount: number;
  type: string;
}

export interface FeatureAdoptionData {
  sequences: { active: number; total: number };
  lists: { active: number; total: number; unused: number };
  forms: { active: number; total: number };
  reports: { total: number; dashboardCount: number };
  emailDeliverability: { bounceRate: number | null; unsubscribeRate: number | null };
  integrations: IntegrationStat[];
}

export interface IntegrationStat {
  name: string;
  connected: boolean;
}

export interface UserActivityData {
  total: number;
  active: number;         // logged in within 30 days
  inactive: number;       // no login in 90+ days
  neverLoggedIn: number;
  superAdmins: number;
  usersWithNoRole: number;
  users: UserStat[];
}

export interface UserStat {
  id: string;
  email: string;
  role: string | null;
  lastLogin: string | null;
  activeDaysAgo: number | null;
}

export interface AuditPayload {
  portalId: number;
  collectedAt: string;
  crmCleanliness: CrmCleanlinessData;
  processHealth: ProcessHealthData;
  featureAdoption: FeatureAdoptionData;
  userActivity: UserActivityData;
}
