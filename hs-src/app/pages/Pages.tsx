import React, { useState, useEffect, useCallback } from 'react';
import {
  hubspot,
  Text,
  Heading,
  Flex,
  Box,
  Button,
  Tag,
  Divider,
  Alert,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableHeader,
} from '@hubspot/ui-extensions';

const BACKEND = 'https://hubaudit-ai-i4z82.ondigitalocean.app';

// ── Types ──────────────────────────────────────────────────────────────

type PageStatus = 'loading' | 'pending' | 'complete' | 'failed' | 'not_found' | 'error';
type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

interface Scores {
  overall: number;
  crmCleanliness: number;
  processHealth: number;
  featureAdoption: number;
  userActivity: number;
}

interface Recommendation {
  id: string;
  risk: RiskLevel;
  category: string;
  title: string;
  problem: string;
  impact: string;
  action: string;
  hubspotUrl?: string;
}

interface ObjectStats {
  total: number;
  unassigned: number;
  stagnant: number;
  completenessScore: number;
}

interface PipelineStat {
  id: string;
  label: string;
  dealsInPipeline: number;
  stagnantDeals: number;
  missingCloseDate: number;
  missingAmount: number;
}

interface AuditPayload {
  portalId: number;
  collectedAt: string;
  crmCleanliness: {
    contacts: ObjectStats;
    companies: ObjectStats;
    deals: ObjectStats;
  };
  processHealth: {
    pipelines: PipelineStat[];
    workflows: { id: number; name: string; enabled: boolean }[];
    requiredFieldsAdherence: number;
    lifecycleStageGaps: string[];
  };
  featureAdoption: {
    lists: { active: number; total: number };
    forms: { active: number; total: number };
  };
  userActivity: {
    total: number;
    active: number;
    inactive: number;
    neverLoggedIn: number;
    superAdmins: number;
    usersWithNoRole: number;
  };
}

interface AuditResult {
  payload: AuditPayload;
  scores: Scores;
  analysis: {
    executiveSummary: {
      overallVerdict: string;
      topWins: string[];
      topGaps: string[];
      closingNote: string;
    };
    recommendations: Recommendation[];
    modelUsed: string;
    generatedAt: string;
  };
  durationMs: number;
}

// ── Extension entry ────────────────────────────────────────────────────

hubspot.extend<'page'>(({ context }: any) => (
  <AuditPage portalId={context.portal.id} />
));

// ── Page controller ────────────────────────────────────────────────────

function AuditPage({ portalId }: { portalId: number }) {
  const [status, setStatus] = useState<PageStatus>('loading');
  const [result, setResult] = useState<AuditResult | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      const resp = await hubspot.fetch(`${BACKEND}/api/report?portalId=${portalId}`);
      if (resp.status === 404 || resp.status === 401) { setStatus('not_found'); return; }
      if (resp.status < 200 || resp.status >= 300)    { setStatus('error');     return; }
      const data = await resp.json();
      if (data.status === 'pending')  { setStatus('pending');  return; }
      if (data.status === 'failed')   { setStatus('failed');   return; }
      if (data.status === 'complete') { setResult(data.result); setStatus('complete'); }
    } catch {
      setStatus('error');
    }
  }, [portalId]);

  const triggerAudit = useCallback(async () => {
    try {
      setStatus('loading');
      await hubspot.fetch(`${BACKEND}/api/audit/trigger?portalId=${portalId}`, { method: 'POST' });
      setStatus('pending');
    } catch {
      setStatus('error');
    }
  }, [portalId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  useEffect(() => {
    if (status !== 'pending') return;
    const timer = setInterval(fetchReport, 20000);
    return () => clearInterval(timer);
  }, [status, fetchReport]);

  if (status === 'loading') {
    return (
      <Flex direction="column" align="center" gap="large">
        <Text>Loading your audit report...</Text>
      </Flex>
    );
  }

  if (status === 'pending') {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Audit In Progress" variant="info">
          Your HubSpot account audit is running. This typically takes 2–5 minutes. This page checks automatically every 20 seconds.
        </Alert>
        <Flex direction="row">
          <Button onClick={fetchReport} variant="secondary">Check Now</Button>
        </Flex>
      </Flex>
    );
  }

  if (status === 'not_found') {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="No Audit Found" variant="warning">
          No audit report was found for your portal. This can happen if the server restarted shortly after you installed the app.
        </Alert>
        <Flex direction="row">
          <Button onClick={triggerAudit}>Run Audit Now</Button>
        </Flex>
      </Flex>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Audit Failed" variant="danger">
          Something went wrong during your audit. Click below to try again.
        </Alert>
        <Flex direction="row">
          <Button onClick={triggerAudit}>Retry Audit</Button>
        </Flex>
      </Flex>
    );
  }

  if (status === 'complete' && result) {
    return <ReportView result={result} onRerun={triggerAudit} />;
  }

  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────

function gradeLabel(score: number): string {
  if (score < 25) return 'Critical';
  if (score < 50) return 'Poor';
  if (score < 75) return 'Fair';
  if (score < 90) return 'Good';
  return 'Excellent';
}

function scoreVariant(score: number): 'danger' | 'warning' | 'default' | 'success' {
  if (score < 25) return 'danger';
  if (score < 50) return 'warning';
  if (score < 75) return 'default';
  return 'success';
}

function riskVariant(risk: string): 'danger' | 'warning' | 'default' | 'success' {
  if (risk === 'critical') return 'danger';
  if (risk === 'high')     return 'warning';
  if (risk === 'medium')   return 'default';
  return 'success';
}

function riskEmoji(risk: string): string {
  if (risk === 'critical') return '🔴';
  if (risk === 'high')     return '🟠';
  if (risk === 'medium')   return '🟡';
  return '🟢';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

// ── Sub-components ─────────────────────────────────────────────────────

function SectionTitle({ children, icon, variant = 'info' }: {
  children: string;
  icon?: string;
  variant?: 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Alert
      title={icon ? `${icon}  ${children}` : children}
      variant={variant}
    />
  );
}

function StatCard({ label, value, sub, variant }: {
  label: string;
  value: string | number;
  sub?: string;
  variant?: 'danger' | 'warning' | 'default' | 'success';
}) {
  return (
    <Box padding="small" border={true}>
      <Flex direction="column" align="start" gap="extra-small">
        <Text variant="microcopy">{label}</Text>
        {variant ? (
          <Tag variant={variant}>{value}</Tag>
        ) : (
          <Text format={{ fontWeight: 'bold' }}>{value}</Text>
        )}
        {sub ? <Text variant="microcopy">{sub}</Text> : null}
      </Flex>
    </Box>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const filled = Math.round(score / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return (
    <Flex direction="row" justify="between" align="center" gap="medium">
      <Text format={{ fontWeight: 'bold' }}>{label}</Text>
      <Flex direction="row" align="center" gap="small">
        <Text>{bar}</Text>
        <Tag variant={scoreVariant(score)}>{score}/100 · {gradeLabel(score)}</Tag>
      </Flex>
    </Flex>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  return (
    <Box padding="medium" border={true}>
      <Flex direction="column" gap="small">
        <Flex direction="row" align="center" gap="small">
          <Tag variant={riskVariant(rec.risk)}>
            {riskEmoji(rec.risk)} {rec.risk.charAt(0).toUpperCase() + rec.risk.slice(1)}
          </Tag>
          <Tag variant="default">{rec.category}</Tag>
          <Text format={{ fontWeight: 'bold' }}>{rec.title}</Text>
        </Flex>

        <Divider />

        <Flex direction="column" gap="extra-small">
          <Text variant="microcopy" format={{ fontWeight: 'bold' }}>PROBLEM</Text>
          <Text>{rec.problem}</Text>
        </Flex>

        <Flex direction="column" gap="extra-small">
          <Text variant="microcopy" format={{ fontWeight: 'bold' }}>IMPACT</Text>
          <Text>{rec.impact}</Text>
        </Flex>

        <Flex direction="column" gap="extra-small">
          <Text variant="microcopy" format={{ fontWeight: 'bold' }}>ACTION</Text>
          <Text>{rec.action}</Text>
        </Flex>

      </Flex>
    </Box>
  );
}

// ── Report view ────────────────────────────────────────────────────────

function ReportView({ result, onRerun }: { result: AuditResult; onRerun: () => void }) {
  const { scores, analysis, payload } = result;
  const p = payload ?? null;

  const groups: { risk: RiskLevel; items: Recommendation[] }[] = [
    { risk: 'critical', items: analysis.recommendations.filter((r) => r.risk === 'critical') },
    { risk: 'high',     items: analysis.recommendations.filter((r) => r.risk === 'high') },
    { risk: 'medium',   items: analysis.recommendations.filter((r) => r.risk === 'medium') },
    { risk: 'low',      items: analysis.recommendations.filter((r) => r.risk === 'low') },
  ].filter((g) => g.items.length > 0);

  const generatedDate = formatDate(analysis.generatedAt);
  const totalWorkflows = p?.processHealth?.workflows?.length ?? 0;
  const activeWorkflows = p?.processHealth?.workflows?.filter((w) => w.enabled).length ?? 0;

  const critCount = analysis.recommendations.filter((r) => r.risk === 'critical').length;
  const highCount = analysis.recommendations.filter((r) => r.risk === 'high').length;
  const medCount  = analysis.recommendations.filter((r) => r.risk === 'medium').length;
  const lowCount  = analysis.recommendations.filter((r) => r.risk === 'low').length;

  return (
    <Flex direction="column" gap="extra-large">

      {/* ── 1. Header ─────────────────────────────────────────────── */}
      <Flex direction="column" gap="extra-small">
        <Flex direction="row" justify="between" align="start">
          <Flex direction="column" gap="extra-small">
            <Heading>Platform Auditor</Heading>
            <Text format={{ fontWeight: 'bold' }}>Quarterly Portal Health Report</Text>
            <Text>Generated {generatedDate}</Text>
          </Flex>
          <Button onClick={onRerun} variant="secondary">Re-run Audit</Button>
        </Flex>
        <Divider />
      </Flex>

      {/* ── 2. Overall Score Dashboard ───────────────────────────── */}
      <Flex direction="column" gap="medium">
        <SectionTitle icon="📊" variant="info">Overall Health Score</SectionTitle>

        <Flex direction="row" align="center" gap="medium">
          <Heading>{scores.overall} / 100</Heading>
          <Tag variant={scoreVariant(scores.overall)}>
            {gradeLabel(scores.overall)}
          </Tag>
        </Flex>

        <Box padding="small" border={true}>
          <Flex direction="column" gap="small">
            <ScoreBar label="CRM Cleanliness"  score={scores.crmCleanliness} />
            <Divider />
            <ScoreBar label="Process Health"   score={scores.processHealth} />
            <Divider />
            <ScoreBar label="Feature Adoption" score={scores.featureAdoption} />
            <Divider />
            <ScoreBar label="User Activity"    score={scores.userActivity} />
          </Flex>
        </Box>

        {/* Issue count badges */}
        <Flex direction="row" gap="small" wrap="wrap">
          {critCount > 0 ? <Tag variant="danger">{critCount} Critical</Tag> : null}
          {highCount > 0 ? <Tag variant="warning">{highCount} High</Tag> : null}
          {medCount  > 0 ? <Tag variant="default">{medCount} Medium</Tag> : null}
          {lowCount  > 0 ? <Tag variant="success">{lowCount} Low</Tag> : null}
        </Flex>
      </Flex>

      {/* ── 3. Executive Summary ─────────────────────────────────── */}
      <Flex direction="column" gap="medium">
        <SectionTitle icon="📋" variant="success">Executive Summary</SectionTitle>

        <Text format={{ italic: true }}>"{analysis.executiveSummary.overallVerdict}"</Text>

        <Flex direction="row" gap="large">
          <Box padding="small" border={true}>
            <Flex direction="column" gap="small">
              <Tag variant="success">What's Working Well</Tag>
              {analysis.executiveSummary.topWins.map((win, i) => (
                <Text key={i}>✓  {win}</Text>
              ))}
            </Flex>
          </Box>
          <Box padding="small" border={true}>
            <Flex direction="column" gap="small">
              <Tag variant="warning">Top Gaps to Address</Tag>
              {analysis.executiveSummary.topGaps.map((gap, i) => (
                <Text key={i}>✗  {gap}</Text>
              ))}
            </Flex>
          </Box>
        </Flex>

        {analysis.executiveSummary.closingNote ? (
          <Alert title="Key Insight" variant="info">
            {analysis.executiveSummary.closingNote}
          </Alert>
        ) : null}
      </Flex>

      {/* ── 4. Portal at a Glance ────────────────────────────────── */}
      {p ? (
        <Flex direction="column" gap="medium">
          <SectionTitle icon="🔍" variant="info">Portal at a Glance</SectionTitle>

          <Flex direction="row" gap="medium">
            <StatCard label="Contacts"  value={p.crmCleanliness.contacts.total} />
            <StatCard label="Companies" value={p.crmCleanliness.companies.total} />
            <StatCard label="Deals"     value={p.crmCleanliness.deals.total} />
          </Flex>

          <Flex direction="row" gap="medium">
            <StatCard
              label="Total Users"
              value={p.userActivity.total}
              sub={p.userActivity.neverLoggedIn > 0 ? `${p.userActivity.neverLoggedIn} never logged in` : undefined}
            />
            <StatCard label="Pipelines" value={p.processHealth.pipelines.length} />
            <StatCard
              label="Workflows"
              value={totalWorkflows}
              sub={`${activeWorkflows} active`}
            />
            <StatCard
              label="Forms"
              value={p.featureAdoption.forms.total}
              sub={`${p.featureAdoption.forms.active} active`}
            />
          </Flex>
        </Flex>
      ) : null}

      {/* ── 5. Action Plan ───────────────────────────────────────── */}
      <Flex direction="column" gap="medium">
        <SectionTitle icon="🎯" variant={critCount > 0 ? 'danger' : highCount > 0 ? 'warning' : 'info'}>Action Plan</SectionTitle>
        <Text variant="microcopy">Sorted by priority. Address critical and high items first for maximum ROI.</Text>

        {groups.map(({ risk, items }) => (
          <Flex key={risk} direction="column" gap="medium">
            <Flex direction="row" align="center" gap="small">
              <Tag variant={riskVariant(risk)}>
                {riskEmoji(risk)} {risk.charAt(0).toUpperCase() + risk.slice(1)}
              </Tag>
              <Text variant="microcopy">{items.length} item{items.length !== 1 ? 's' : ''}</Text>
            </Flex>

            {items.map((rec) => (
              <RecCard key={rec.id} rec={rec} />
            ))}
          </Flex>
        ))}
      </Flex>

      {/* ── 6. Detailed Metrics ──────────────────────────────────── */}
      {p ? (
        <Flex direction="column" gap="large">
          <SectionTitle icon="📈" variant="info">Detailed Metrics</SectionTitle>

          {/* CRM Cleanliness per-object */}
          <Flex direction="column" gap="small">
            <Heading size="extra-small">CRM Object Health</Heading>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Object</TableHeader>
                  <TableHeader>Total</TableHeader>
                  <TableHeader>Unassigned</TableHeader>
                  <TableHeader>Stagnant</TableHeader>
                  <TableHeader>Completeness</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  { label: 'Contacts',  data: p.crmCleanliness.contacts },
                  { label: 'Companies', data: p.crmCleanliness.companies },
                  { label: 'Deals',     data: p.crmCleanliness.deals },
                ].map(({ label, data }) => (
                  <TableRow key={label}>
                    <TableCell>{label}</TableCell>
                    <TableCell>{data.total}</TableCell>
                    <TableCell>
                      {data.unassigned > 0
                        ? <Tag variant="warning">{data.unassigned}</Tag>
                        : <Tag variant="success">0</Tag>}
                    </TableCell>
                    <TableCell>
                      {data.stagnant > 0
                        ? <Tag variant="warning">{data.stagnant}</Tag>
                        : <Tag variant="success">0</Tag>}
                    </TableCell>
                    <TableCell>
                      <Tag variant={scoreVariant(data.completenessScore)}>
                        {data.completenessScore}%
                      </Tag>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Flex>

          {/* Deal Pipelines */}
          {p.processHealth.pipelines.length > 0 ? (
            <Flex direction="column" gap="small">
              <Heading size="extra-small">Deal Pipelines</Heading>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Pipeline</TableHeader>
                    <TableHeader>Deals</TableHeader>
                    <TableHeader>Stagnant</TableHeader>
                    <TableHeader>No Close Date</TableHeader>
                    <TableHeader>No Amount</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {p.processHealth.pipelines.map((pipeline) => (
                    <TableRow key={pipeline.id}>
                      <TableCell>{pipeline.label}</TableCell>
                      <TableCell>{pipeline.dealsInPipeline}</TableCell>
                      <TableCell>
                        <Tag variant={pipeline.stagnantDeals > 0 ? 'danger' : 'success'}>
                          {pipeline.stagnantDeals}
                        </Tag>
                      </TableCell>
                      <TableCell>{pipeline.missingCloseDate}</TableCell>
                      <TableCell>{pipeline.missingAmount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Flex>
          ) : null}

          {/* User Activity */}
          <Flex direction="column" gap="small">
            <Heading size="extra-small">User Activity</Heading>
            <Flex direction="row" gap="medium">
              <StatCard label="Total" value={p.userActivity.total} />
              <StatCard
                label="Active (30d)"
                value={p.userActivity.active}
                sub={pct(p.userActivity.active, p.userActivity.total)}
                variant={p.userActivity.active / Math.max(p.userActivity.total, 1) >= 0.7 ? 'success' : 'warning'}
              />
              <StatCard
                label="Inactive (90d+)"
                value={p.userActivity.inactive}
                variant={p.userActivity.inactive > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="Never Logged In"
                value={p.userActivity.neverLoggedIn}
                variant={p.userActivity.neverLoggedIn > 0 ? 'danger' : 'success'}
              />
            </Flex>
            {p.userActivity.superAdmins > 0 ? (
              <Text>Super admins: {p.userActivity.superAdmins}</Text>
            ) : null}
            {p.userActivity.usersWithNoRole > 0 ? (
              <Alert title="Governance Gap" variant="warning">
                {p.userActivity.usersWithNoRole} users have no role assigned. Assign roles to enforce least-privilege access.
              </Alert>
            ) : null}
          </Flex>

          {/* Feature Adoption */}
          <Flex direction="column" gap="small">
            <Heading size="extra-small">Feature Adoption</Heading>
            <Flex direction="row" gap="medium">
              <StatCard
                label="Lists"
                value={p.featureAdoption.lists.total}
                sub={`${p.featureAdoption.lists.active} active`}
              />
              <StatCard
                label="Forms"
                value={p.featureAdoption.forms.total}
                sub={`${p.featureAdoption.forms.active} active`}
              />
            </Flex>
          </Flex>

          {/* Lifecycle stage gaps */}
          {p.processHealth.lifecycleStageGaps.length > 0 ? (
            <Alert title="Lifecycle Stage Gaps" variant="warning">
              No contacts in: {p.processHealth.lifecycleStageGaps.join(', ')}
            </Alert>
          ) : null}

        </Flex>
      ) : null}

      {/* ── 7. Footer ────────────────────────────────────────────── */}
      <Divider />
      <Flex direction="row" justify="between" align="center">
        <Text>Platform Auditor · {generatedDate}</Text>
        <Text>Model: {analysis.modelUsed} · Completed in {Math.round(result.durationMs / 1000)}s</Text>
      </Flex>

    </Flex>
  );
}
