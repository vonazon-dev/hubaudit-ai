/**
 * Module 2: Process Health
 * Audits deal pipelines, workflows, required field adherence,
 * and lifecycle stage gaps.
 */
import { AxiosInstance } from 'axios';
import { fetchAllPages } from '../../lib/hubspotClient';
import { ProcessHealthData, PipelineStat, WorkflowStat } from '../../types/audit';
import { logger } from '../../lib/logger';

interface HsRecord {
  id: string;
  properties: Record<string, string | null>;
}

async function fetchPipelineStats(client: AxiosInstance): Promise<PipelineStat[]> {
  logger.info('Fetching pipeline stats...');

  // Get all deal pipelines
  const { data: pipelineData } = await client.get('/crm/v3/pipelines/deals');
  const pipelines = pipelineData.results ?? [];

  const stats: PipelineStat[] = [];
  const stagnantCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const pipeline of pipelines) {
    // Fetch deals in this pipeline
    const deals = await fetchAllPages<HsRecord>(client, '/crm/v3/objects/deals', {
      properties: 'dealname,amount,closedate,hubspot_owner_id,notes_last_updated,pipeline',
      filterGroups: JSON.stringify([{
        filters: [{ propertyName: 'pipeline', operator: 'EQ', value: pipeline.id }],
      }]),
    });

    let stagnantDeals = 0, missingCloseDate = 0, missingAmount = 0;

    for (const deal of deals) {
      const p = deal.properties;
      if (!p.notes_last_updated || p.notes_last_updated < stagnantCutoff) stagnantDeals++;
      if (!p.closedate) missingCloseDate++;
      if (!p.amount) missingAmount++;
    }

    stats.push({
      id: pipeline.id,
      label: pipeline.label,
      stageCount: pipeline.stages?.length ?? 0,
      dealsInPipeline: deals.length,
      stagnantDeals,
      missingCloseDate,
      missingAmount,
    });
  }

  return stats;
}

async function fetchWorkflowStats(client: AxiosInstance): Promise<WorkflowStat[]> {
  logger.info('Fetching workflow stats...');

  try {
    const { data } = await client.get('/automation/v4/flows', { params: { limit: 100 } });
    const workflows = data.results ?? data.flows ?? [];

    return workflows.map((w: any): WorkflowStat => ({
      id: w.id,
      name: w.name ?? 'Unnamed',
      enabled: w.isEnabled ?? w.enabled ?? false,
      hasDescription: Boolean(w.description?.trim()),
      enrolledCount: w.enrolledCount ?? 0,
      type: w.flowType ?? w.type ?? 'CONTACT_FLOW',
    }));
  } catch (err: any) {
    logger.warn('Could not fetch workflows (scope may be missing)', { error: err.message });
    return [];
  }
}

async function fetchRequiredFieldsAdherence(client: AxiosInstance): Promise<number> {
  logger.info('Checking required fields adherence...');

  try {
    const { data } = await client.get('/crm/v3/properties/deals');
    const required = (data.results ?? []).filter((p: any) => p.formField === true);

    if (required.length === 0) return 100;

    // Sample last 200 deals to check adherence — no filter, just fetch and check
    const deals = await fetchAllPages<HsRecord>(
      client,
      '/crm/v3/objects/deals',
      { properties: required.map((p: any) => p.name).slice(0, 10).join(',') },
      200,
    );

    if (deals.length === 0) return 100;

    let populated = 0;
    let total = 0;

    for (const deal of deals) {
      for (const field of required.slice(0, 10)) {
        total++;
        if (deal.properties[field.name]) populated++;
      }
    }

    return Math.round((populated / total) * 100);
  } catch (err: any) {
    logger.warn('Could not check required fields', { error: err.message });
    return -1;
  }
}

async function fetchLifecycleStageGaps(client: AxiosInstance): Promise<string[]> {
  logger.info('Checking lifecycle stage gaps...');

  const stages = [
    'subscriber', 'lead', 'marketingqualifiedlead',
    'salesqualifiedlead', 'opportunity', 'customer', 'evangelist', 'other',
  ];

  try {
    const gaps: string[] = [];

    for (const stage of stages) {
      const { data } = await client.get('/crm/v3/objects/contacts', {
        params: {
          limit: 1,
          filterGroups: JSON.stringify([{
            filters: [{ propertyName: 'lifecyclestage', operator: 'EQ', value: stage }],
          }]),
        },
      });

      if ((data.total ?? 0) === 0) gaps.push(stage);
    }

    return gaps;
  } catch (err: any) {
    logger.warn('Could not check lifecycle stages', { error: err.message });
    return [];
  }
}

export async function runProcessHealth(client: AxiosInstance): Promise<ProcessHealthData> {
  logger.info('Running process health module...');

  const [pipelines, workflows, requiredFieldsAdherence, lifecycleStageGaps] = await Promise.all([
    fetchPipelineStats(client),
    fetchWorkflowStats(client),
    fetchRequiredFieldsAdherence(client),
    fetchLifecycleStageGaps(client),
  ]);

  logger.info('Process health module complete', {
    pipelines: pipelines.length,
    workflows: workflows.length,
    requiredFieldsAdherence,
    lifecycleGaps: lifecycleStageGaps.length,
  });

  return { pipelines, workflows, requiredFieldsAdherence, lifecycleStageGaps };
}
