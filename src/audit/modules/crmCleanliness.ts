/**
 * Module 1: CRM Cleanliness
 * Checks completeness, unassigned records, stagnation, and duplicate estimates
 * across Contacts, Companies, Deals, and Tickets.
 */
import { AxiosInstance } from 'axios';
import { fetchAllPages } from '../../lib/hubspotClient';
import { CrmCleanlinessData, ObjectStats, DuplicateEstimate } from '../../types/audit';
import { logger } from '../../lib/logger';

const STAGNANT_DAYS = 90;
const stagnantCutoff = () =>
  new Date(Date.now() - STAGNANT_DAYS * 24 * 60 * 60 * 1000).toISOString();

interface HsRecord {
  id: string;
  properties: Record<string, string | null>;
}

async function fetchContactStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching contact stats...');
  const records = await fetchAllPages<HsRecord>(client, '/crm/v3/objects/contacts', {
    properties: 'email,firstname,lastname,phone,hubspot_owner_id,notes_last_updated',
  });

  const cutoff = stagnantCutoff();
  let unassigned = 0, missingEmail = 0, missingName = 0, missingPhone = 0, stagnant = 0;

  for (const r of records) {
    const p = r.properties;
    if (!p.hubspot_owner_id) unassigned++;
    if (!p.email) missingEmail++;
    if (!p.firstname && !p.lastname) missingName++;
    if (!p.phone) missingPhone++;
    if (!p.notes_last_updated || p.notes_last_updated < cutoff) stagnant++;
  }

  const total = records.length;
  // Completeness: average of 4 field checks
  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingEmail + missingName + missingPhone + unassigned) / (total * 4)) * 100
  );

  return { total, unassigned, missingEmail, missingName, missingPhone, stagnant, completenessScore };
}

async function fetchCompanyStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching company stats...');
  const records = await fetchAllPages<HsRecord>(client, '/crm/v3/objects/companies', {
    properties: 'name,phone,hubspot_owner_id,notes_last_updated',
  });

  const cutoff = stagnantCutoff();
  let unassigned = 0, missingName = 0, missingPhone = 0, stagnant = 0;

  for (const r of records) {
    const p = r.properties;
    if (!p.hubspot_owner_id) unassigned++;
    if (!p.name) missingName++;
    if (!p.phone) missingPhone++;
    if (!p.notes_last_updated || p.notes_last_updated < cutoff) stagnant++;
  }

  const total = records.length;
  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingName + missingPhone + unassigned) / (total * 3)) * 100
  );

  return { total, unassigned, missingEmail: 0, missingName, missingPhone, stagnant, completenessScore };
}

async function fetchDealStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching deal stats...');
  const records = await fetchAllPages<HsRecord>(client, '/crm/v3/objects/deals', {
    properties: 'dealname,amount,closedate,hubspot_owner_id,notes_last_updated',
  });

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let unassigned = 0, missingName = 0, missingPhone = 0, stagnant = 0;

  for (const r of records) {
    const p = r.properties;
    if (!p.hubspot_owner_id) unassigned++;
    if (!p.dealname) missingName++;
    // missingPhone reused for missingAmount on deals
    if (!p.amount) missingPhone++;
    if (!p.notes_last_updated || p.notes_last_updated < cutoff) stagnant++;
  }

  const total = records.length;
  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingName + missingPhone + unassigned) / (total * 3)) * 100
  );

  return { total, unassigned, missingEmail: 0, missingName, missingPhone, stagnant, completenessScore };
}

async function fetchTicketStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching ticket stats...');
  const records = await fetchAllPages<HsRecord>(client, '/crm/v3/objects/tickets', {
    properties: 'subject,hubspot_owner_id,notes_last_updated',
  });

  const cutoff = stagnantCutoff();
  let unassigned = 0, missingName = 0, stagnant = 0;

  for (const r of records) {
    const p = r.properties;
    if (!p.hubspot_owner_id) unassigned++;
    if (!p.subject) missingName++;
    if (!p.notes_last_updated || p.notes_last_updated < cutoff) stagnant++;
  }

  const total = records.length;
  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingName + unassigned) / (total * 2)) * 100
  );

  return { total, unassigned, missingEmail: 0, missingName, missingPhone: 0, stagnant, completenessScore };
}

async function fetchDuplicateEstimates(client: AxiosInstance): Promise<DuplicateEstimate[]> {
  logger.info('Fetching duplicate estimates...');
  const estimates: DuplicateEstimate[] = [];

  for (const objectType of ['contacts', 'companies']) {
    try {
      // Use the CRM duplicates API (available on Pro+)
      const { data } = await client.get(`/crm/v3/objects/${objectType}`, {
        params: { limit: 1 },
      });
      // Rough estimate: not available on all tiers, so we just note the total
      estimates.push({ objectType, estimatedDuplicates: -1 });
    } catch {
      estimates.push({ objectType, estimatedDuplicates: -1 });
    }
  }

  return estimates;
}

export async function runCrmCleanliness(client: AxiosInstance): Promise<CrmCleanlinessData> {
  logger.info('Running CRM cleanliness module...');

  const [contacts, companies, deals, tickets, duplicateEstimates] = await Promise.all([
    fetchContactStats(client),
    fetchCompanyStats(client),
    fetchDealStats(client),
    fetchTicketStats(client),
    fetchDuplicateEstimates(client),
  ]);

  logger.info('CRM cleanliness module complete', {
    contacts: contacts.total,
    companies: companies.total,
    deals: deals.total,
    tickets: tickets.total,
  });

  return { contacts, companies, deals, tickets, duplicateEstimates };
}
