/**
 * Module 3: Feature Adoption
 * Checks usage of sequences, lists, forms, reports/dashboards,
 * email deliverability indicators, and connected integrations.
 */
import { AxiosInstance } from 'axios';
import { FeatureAdoptionData, IntegrationStat } from '../../types/audit';
import { logger } from '../../lib/logger';

async function fetchSequenceStats(client: AxiosInstance) {
  logger.info('Fetching sequence stats...');
  try {
    const { data } = await client.get('/crm/v3/objects/sequences', { params: { limit: 100 } });
    const sequences = data.results ?? [];
    const active = sequences.filter((s: any) => s.properties?.hs_status === 'ACTIVE').length;
    return { active, total: sequences.length };
  } catch (err: any) {
    logger.warn('Could not fetch sequences', { error: err.message });
    return { active: 0, total: 0 };
  }
}

async function fetchListStats(client: AxiosInstance) {
  logger.info('Fetching list stats...');
  try {
    const { data } = await client.get('/crm/v3/lists', { params: { count: 250 } });
    const lists = data.lists ?? data.results ?? [];
    const active = lists.filter((l: any) => (l.memberCount ?? l.metaData?.size ?? 0) > 0).length;
    const unused = lists.length - active;
    return { active, total: lists.length, unused };
  } catch (err: any) {
    logger.warn('Could not fetch lists', { error: err.message });
    return { active: 0, total: 0, unused: 0 };
  }
}

async function fetchFormStats(client: AxiosInstance) {
  logger.info('Fetching form stats...');
  try {
    const { data } = await client.get('/marketing/v3/forms', { params: { limit: 200 } });
    const forms = data.results ?? [];
    const active = forms.filter((f: any) => !f.archived).length;
    return { active, total: forms.length };
  } catch (err: any) {
    logger.warn('Could not fetch forms', { error: err.message });
    return { active: 0, total: 0 };
  }
}

async function fetchReportStats(client: AxiosInstance) {
  logger.info('Fetching report/dashboard stats...');
  try {
    const { data } = await client.get('/crm/v3/objects/reports', { params: { limit: 1 } });
    const total = data.total ?? 0;

    let dashboardCount = 0;
    try {
      const { data: dash } = await client.get('/crm/v3/objects/dashboards', { params: { limit: 1 } });
      dashboardCount = dash.total ?? 0;
    } catch { /* dashboards endpoint optional */ }

    return { total, dashboardCount };
  } catch (err: any) {
    logger.warn('Could not fetch reports', { error: err.message });
    return { total: 0, dashboardCount: 0 };
  }
}

async function fetchEmailDeliverability(client: AxiosInstance) {
  logger.info('Fetching email deliverability stats...');
  try {
    const { data } = await client.get('/marketing/v3/emails', { params: { limit: 1 } });
    // Basic check — full deliverability stats need marketing email scope
    const total = data.total ?? 0;
    return {
      bounceRate: total > 0 ? null : null,   // populated in Phase 2 with marketing scope
      unsubscribeRate: null,
    };
  } catch (err: any) {
    logger.warn('Could not fetch email stats', { error: err.message });
    return { bounceRate: null, unsubscribeRate: null };
  }
}

async function fetchIntegrations(client: AxiosInstance): Promise<IntegrationStat[]> {
  logger.info('Fetching integration stats...');
  try {
    const { data } = await client.get('/crm/v3/extensions/calling/settings');
    // Just check if calling integration is configured as a proxy for integration usage
    return data ? [{ name: 'Calling', connected: true }] : [];
  } catch (err: any) {
    logger.warn('Could not fetch integrations', { error: err.message });
    return [];
  }
}

export async function runFeatureAdoption(client: AxiosInstance): Promise<FeatureAdoptionData> {
  logger.info('Running feature adoption module...');

  const [sequences, lists, forms, reports, emailDeliverability, integrations] = await Promise.all([
    fetchSequenceStats(client),
    fetchListStats(client),
    fetchFormStats(client),
    fetchReportStats(client),
    fetchEmailDeliverability(client),
    fetchIntegrations(client),
  ]);

  logger.info('Feature adoption module complete', {
    sequences: sequences.total,
    lists: lists.total,
    forms: forms.total,
    reports: reports.total,
    integrations: integrations.length,
  });

  return { sequences, lists, forms, reports, emailDeliverability, integrations };
}
