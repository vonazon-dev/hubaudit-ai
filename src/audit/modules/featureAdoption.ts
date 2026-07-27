/**
 * Module 3: Feature Adoption
 * Checks usage of lists and forms.
 * Sequences and reports removed — no reliable API endpoint available for marketplace apps.
 * Integrations removed — calling settings endpoint is portal-specific.
 * Requires scopes: crm.lists.read, forms
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

export async function runFeatureAdoption(client: AxiosInstance): Promise<FeatureAdoptionData> {
  logger.info('Running feature adoption module...');

  const [lists, forms] = await Promise.all([
    fetchListStats(client),
    fetchFormStats(client),
  ]);

  logger.info('Feature adoption module complete', {
    lists: lists.total,
    forms: forms.total,
  });

  return {
    sequences: { active: 0, total: 0 },
    lists,
    forms,
    integrations: [],
  };
}
