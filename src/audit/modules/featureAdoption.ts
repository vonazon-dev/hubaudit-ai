/**
 * Module 3: Feature Adoption
 * Checks usage of lists, forms, and marketing emails.
 * Sequences and reports removed — no reliable API endpoint available for marketplace apps.
 * Integrations removed — calling settings endpoint is portal-specific.
 * Requires scopes: crm.lists.read, forms, content
 */
import { AxiosInstance } from 'axios';
import { FeatureAdoptionData } from '../../types/audit';
import { logger } from '../../lib/logger';

async function fetchListStats(client: AxiosInstance) {
  logger.info('Fetching list stats...');
  try {
    const { data } = await client.get('/crm/v3/lists', { params: { limit: 500 } });
    const lists = data.lists ?? data.results ?? [];
    const active = lists.filter((l: any) => (l.memberCount ?? l.metaData?.size ?? 0) > 0).length;
    return { active, total: lists.length, unused: lists.length - active };
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

async function fetchEmailStats(client: AxiosInstance) {
  logger.info('Fetching email stats...');
  try {
    const { data } = await client.get('/marketing/v3/emails', { params: { limit: 1 } });
    const total = data.total ?? 0;
    return { total, bounceRate: null as null, unsubscribeRate: null as null };
  } catch (err: any) {
    logger.warn('Could not fetch email stats', { error: err.message });
    return { total: 0, bounceRate: null as null, unsubscribeRate: null as null };
  }
}

export async function runFeatureAdoption(client: AxiosInstance): Promise<FeatureAdoptionData> {
  logger.info('Running feature adoption module...');

  const [lists, forms, email] = await Promise.all([
    fetchListStats(client),
    fetchFormStats(client),
    fetchEmailStats(client),
  ]);

  logger.info('Feature adoption module complete', {
    lists: lists.total,
    forms: forms.total,
    emails: email.total,
  });

  return {
    sequences: { active: 0, total: 0 },
    lists,
    forms,
    reports: { total: email.total, dashboardCount: 0 },
    emailDeliverability: { bounceRate: email.bounceRate, unsubscribeRate: email.unsubscribeRate },
    integrations: [],
  };
}
