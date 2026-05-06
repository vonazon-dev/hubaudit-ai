/**
 * Cadence guard — enforces one audit per 90 days per portal.
 * Phase 0: in-memory. Phase 1: replace store with DB.
 */
import { AuditStatus } from '../types';
import { logger } from '../lib/logger';

const AUDIT_INTERVAL_DAYS = 90;

// Phase 0 in-memory store: portalId → last audit date
const auditDates = new Map<number, Date>();

export const cadenceGuard = {
  getStatus(portalId: number): AuditStatus {
    const lastAuditDate = auditDates.get(portalId) ?? null;

    if (!lastAuditDate) {
      return {
        eligible: true,
        lastAuditDate: null,
        nextEligibleDate: null,
        daysUntilEligible: 0,
      };
    }

    const nextEligibleDate = new Date(lastAuditDate);
    nextEligibleDate.setDate(nextEligibleDate.getDate() + AUDIT_INTERVAL_DAYS);

    const now = new Date();
    const eligible = now >= nextEligibleDate;
    const daysUntilEligible = eligible
      ? 0
      : Math.ceil((nextEligibleDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return { eligible, lastAuditDate, nextEligibleDate, daysUntilEligible };
  },

  markAuditRun(portalId: number): void {
    auditDates.set(portalId, new Date());
    logger.info('Audit date recorded', { portalId });
  },

  // Phase 1: replace this with a DB read on startup
  seed(portalId: number, date: Date): void {
    auditDates.set(portalId, date);
  },
};
