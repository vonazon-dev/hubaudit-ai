/**
 * Module 1: CRM Cleanliness
 * Uses search API count queries instead of fetching all records.
 * Each stat = 1-2 API calls regardless of portal size.
 */
import { AxiosInstance } from 'axios';
import { countSearch } from '../../lib/hubspotClient';
import { CrmCleanlinessData, ObjectStats, DuplicateEstimate } from '../../types/audit';
import { logger } from '../../lib/logger';

const STAGNANT_DAYS = 90;
const DEAL_STAGNANT_DAYS = 30;

function cutoffMs(days: number): string {
  return String(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function fetchContactStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching contact stats...');
  const cutoff = cutoffMs(STAGNANT_DAYS);

  const [total, unassigned, missingEmail, missingName, missingPhone, stagnant] = await Promise.all([
    countSearch(client, 'contacts', []),
    countSearch(client, 'contacts', [[{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'contacts', [[{ propertyName: 'email', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'contacts', [[
      { propertyName: 'firstname', operator: 'NOT_HAS_PROPERTY' },
      { propertyName: 'lastname', operator: 'NOT_HAS_PROPERTY' },
    ]]),
    countSearch(client, 'contacts', [[{ propertyName: 'phone', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'contacts', [
      [{ propertyName: 'notes_last_updated', operator: 'NOT_HAS_PROPERTY' }],
      [{ propertyName: 'notes_last_updated', operator: 'LT', value: cutoff }],
    ]),
  ]);

  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingEmail + missingName + missingPhone + unassigned) / (total * 4)) * 100
  );

  return { total, unassigned, missingEmail, missingName, missingPhone, stagnant, completenessScore };
}

async function fetchCompanyStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching company stats...');
  const cutoff = cutoffMs(STAGNANT_DAYS);

  const [total, unassigned, missingName, missingPhone, stagnant] = await Promise.all([
    countSearch(client, 'companies', []),
    countSearch(client, 'companies', [[{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'companies', [[{ propertyName: 'name', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'companies', [[{ propertyName: 'phone', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'companies', [
      [{ propertyName: 'notes_last_updated', operator: 'NOT_HAS_PROPERTY' }],
      [{ propertyName: 'notes_last_updated', operator: 'LT', value: cutoff }],
    ]),
  ]);

  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingName + missingPhone + unassigned) / (total * 3)) * 100
  );

  return { total, unassigned, missingEmail: 0, missingName, missingPhone, stagnant, completenessScore };
}

async function fetchDealStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching deal stats...');
  const cutoff = cutoffMs(DEAL_STAGNANT_DAYS);

  const [total, unassigned, missingName, missingAmount, stagnant] = await Promise.all([
    countSearch(client, 'deals', []),
    countSearch(client, 'deals', [[{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'deals', [[{ propertyName: 'dealname', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'deals', [[{ propertyName: 'amount', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'deals', [
      [{ propertyName: 'notes_last_updated', operator: 'NOT_HAS_PROPERTY' }],
      [{ propertyName: 'notes_last_updated', operator: 'LT', value: cutoff }],
    ]),
  ]);

  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingName + missingAmount + unassigned) / (total * 3)) * 100
  );

  return { total, unassigned, missingEmail: 0, missingName, missingPhone: missingAmount, stagnant, completenessScore };
}

async function fetchTicketStats(client: AxiosInstance): Promise<ObjectStats> {
  logger.info('Fetching ticket stats...');
  const cutoff = cutoffMs(STAGNANT_DAYS);

  const [total, unassigned, missingName, stagnant] = await Promise.all([
    countSearch(client, 'tickets', []),
    countSearch(client, 'tickets', [[{ propertyName: 'hubspot_owner_id', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'tickets', [[{ propertyName: 'subject', operator: 'NOT_HAS_PROPERTY' }]]),
    countSearch(client, 'tickets', [
      [{ propertyName: 'notes_last_updated', operator: 'NOT_HAS_PROPERTY' }],
      [{ propertyName: 'notes_last_updated', operator: 'LT', value: cutoff }],
    ]),
  ]);

  const completenessScore = total === 0 ? 100 : Math.round(
    100 - ((missingName + unassigned) / (total * 2)) * 100
  );

  return { total, unassigned, missingEmail: 0, missingName, missingPhone: 0, stagnant, completenessScore };
}

async function fetchDuplicateEstimates(client: AxiosInstance): Promise<DuplicateEstimate[]> {
  logger.info('Fetching duplicate estimates...');
  return [
    { objectType: 'contacts', estimatedDuplicates: -1 },
    { objectType: 'companies', estimatedDuplicates: -1 },
  ];
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
