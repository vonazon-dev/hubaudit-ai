/**
 * Module 2: Process Health
 * Audits deal pipelines, workflows, required field adherence,
 * and lifecycle stage gaps.
 */
import { AxiosInstance } from 'axios';
import { countSearch } from '../../lib/hubspotClient';
import { ProcessHealthData, PipelineStat, WorkflowStat } from '../../types/audit';
import { logger } from '../../lib/logger';

async function fetchPipelineStats(client: AxiosInstance): Promise<PipelineStat[]> {
  logger.info('Fetching pipeline stats...');

  const { data: pipelineData } = await client.get('/crm/v3/pipelines/deals');
  const pipelines = pipelineData.results ?? [];
  const cutoff = String(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const stats: PipelineStat[] = [];

  for (const pipeline of pipelines) {
    const inPipeline = [{ propertyName: 'pipeline', operator: 'EQ', value: pipeline.id }];

    const [dealsInPipeline, stagnantDeals, missingCloseDate, missingAmount] = await Promise.all([
      countSearch(client, 'deals', [inPipeline]),
      countSearch(client, 'deals', [
        [...inPipeline, { propertyName: 'notes_last_updated', operator: 'NOT_HAS_PROPERTY' }],
        [...inPipeline, { propertyName: 'notes_last_updated', operator: 'LT', value: cutoff }],
      ]),
      countSearch(client, 'deals', [[...inPipeline, { propertyName: 'closedate', operator: 'NOT_HAS_PROPERTY' }]]),
      countSearch(client, 'deals', [[...inPipeline, { propertyName: 'amount', operator: 'NOT_HAS_PROPERTY' }]]),
    ]);

    stats.push({
      id: pipeline.id,
      label: pipeline.label,
      stageCount: pipeline.stages?.length ?? 0,
      dealsInPipeline,
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
    const required = (data.results ?? []).filter((p: any) => p.formField === true).slice(0, 10);

    if (required.length === 0) return 100;

    const [total, ...missingCounts] = await Promise.all([
      countSearch(client, 'deals', []),
      ...required.map((p: any) =>
        countSearch(client, 'deals', [[{ propertyName: p.name, operator: 'NOT_HAS_PROPERTY' }]])
      ),
    ]);

    if (total === 0) return 100;

    const totalMissing = missingCounts.reduce((sum, c) => sum + c, 0);
    const totalSlots = total * required.length;
    return Math.round(((totalSlots - totalMissing) / totalSlots) * 100);
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
