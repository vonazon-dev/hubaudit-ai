export interface HubSpotTokens {
  portalId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface PortalRecord {
  portalId: number;
  hubDomain: string;
  installedAt: Date;
  lastAuditDate: Date | null;
  nextEligibleDate: Date | null;
}

export interface OAuthState {
  csrfToken: string;
  redirectAfter?: string;
}

export interface AuditStatus {
  eligible: boolean;
  lastAuditDate: Date | null;
  nextEligibleDate: Date | null;
  daysUntilEligible: number;
}
