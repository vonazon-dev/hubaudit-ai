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
  Link,
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
    tickets: ObjectStats;
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
    reports: { total: number };
    emailDeliverability: { bounceRate: number | null; unsubscribeRate: number | null };
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

hubspot.extend<'settings'>(({ context }: any) => (
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
      <Flex direction="column" align="center" gap="medium">
        <Text>Loading your audit report...</Text>
      </Flex>
    );
  }

  if (status === 'pending') {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Audit In Progress" variant="info">
          Your HubSpot account audit is running. This typically takes 2–5 minutes.
          This page checks automatically every 20 seconds.
        </Alert>
        <Button onClick={fetchReport} variant="secondary">Check Now</Button>
      </Flex>
    );
  }

  if (status === 'not_found') {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="No Audit Found" variant="warning">
          No audit report was found for your portal. This can happen if the server
          restarted shortly after you installed the app.
        </Alert>
        <Button onClick={triggerAudit}>Run Audit Now</Button>
      </Flex>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <Flex direction="column" gap="medium">
        <Alert title="Audit Failed" variant="danger">
          Something went wrong during your audit. Click below to try again.
        </Alert>
        <Button onClick={triggerAudit}>Retry Audit</Button>
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return (
    <Flex direction="column" gap="extra-small">
      <Heading>{children}</Heading>
      <Divider />
    </Flex>
  );
}

function MetricBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Box>
      <Flex direction="column" align="center" gap="extra-small">
        <Text format={{ fontWeight: 'bold' }}>{value}</Text>
        <Text>{label}</Text>
        {sub ? <Text>{sub}</Text> : null}
      </Flex>
    </Box>
  );
}

function ScoreRow({ label, score }: { label: string; score: number }) {
  return (
    <Flex direction="row" justify="between" align="center">
      <Text>{label}</Text>
      <Flex direction="row" align="center" gap="small">
        <Tag variant={scoreVariant(score)}>{score} / 100</Tag>
        <Tag variant={scoreVariant(score)}>{gradeLabel(score)}</Tag>
      </Flex>
    </Flex>
  );
}

// ── Report view ────────────────────────────────────────────────────────

function ReportView({ result, onRerun }: { result: AuditResult; onRerun: () => void }) {
  const { scores, analysis, payload } = result;
  const p = payload ?? null;

  const byRisk = (['critical', 'high', 'medium', 'low'] as const)
    .map((risk) => ({
      risk,
      items: analysis.recommendations.filter((r) => r.risk === risk),
    }))
    .filter((g) => g.items.length > 0);

  const generatedDate = formatDate(analysis.generatedAt);
  const totalWorkflows = p?.processHealth?.workflows?.length ?? 0;
  const activeWorkflows = p?.processHealth?.workflows?.filter((w) => w.enabled).length ?? 0;

  return (
    <Flex direction="column" gap="large">

      {/* ── 1. Header ─────────────────────────────────────────────── */}
      <Flex direction="row" justify="between" align="start">
        <Flex direction="column" gap="extra-small">
          <Heading>HubAudit AI</Heading>
          <Text>Quarterly Portal Health Report</Text>
          <Text>Generated {generatedDate}</Text>
        </Flex>
        <Button onClick={onRerun} variant="secondary">Re-run Audit</Button>
      </Flex>

      <Divider />

      {/* ── 2. Overall Score ─────────────────────────────────────── */}
      <Flex direction="column" gap="medium">
        <Flex direction="row" align="center" gap="medium">
          <Heading>{scores.overall} / 100</Heading>
          <Tag variant={scoreVariant(scores.overall)}>
            {gradeLabel(scores.overall)}
          </Tag>
        </Flex>

        <Flex direction="row" gap="large">
          {[
            { label: 'CRM Cleanliness',  score: scores.crmCleanliness },
            { label: 'Process Health',   score: scores.processHealth },
            { label: 'Feature Adoption', score: scores.featureAdoption },
            { label: 'User Activity',    score: scores.userActivity },
          ].map(({ label, score }) => (
            <Flex key={label} direction="column" align="center" gap="extra-small">
              <Tag variant={scoreVariant(score)}>{score}</Tag>
              <Text>{label}</Text>
            </Flex>
          ))}
        </Flex>

        <Flex direction="row" gap="small">
          {(['critical', 'high', 'medium', 'low'] as const).map((risk) => {
            const count = analysis.recommendations.filter((r) => r.risk === risk).length;
            return count > 0 ? (
              <Tag key={risk} variant={riskVariant(risk)}>
                {risk.charAt(0).toUpperCase() + risk.slice(1)}: {count}
              </Tag>
            ) : null;
          })}
        </Flex>
      </Flex>

      <Divider />

      {/* ── 3. Executive Summary ─────────────────────────────────── */}
      <Flex direction="column" gap="medium">
        <SectionTitle>Executive Summary</SectionTitle>

        <Text format={{ italic: true }}>
          "{analysis.executiveSummary.overallVerdict}"
        </Text>

        <Flex direction="row" gap="large">
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: 'bold' }}>What's working well</Text>
            {analysis.executiveSummary.topWins.map((win, i) => (
              <Text key={i}>✓  {win}</Text>
            ))}
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: 'bold' }}>Top gaps to address</Text>
            {analysis.executiveSummary.topGaps.map((gap, i) => (
              <Text key={i}>✗  {gap}</Text>
            ))}
          </Flex>
        </Flex>

        {analysis.executiveSummary.closingNote ? (
          <Alert title="Key Insight" variant="info">
            {analysis.executiveSummary.closingNote}
          </Alert>
        ) : null}
      </Flex>

      <Divider />

      {/* ── 4. Health Score Breakdown ─────────────────────────────── */}
      <Flex direction="column" gap="medium">
        <SectionTitle>Health Score Breakdown</SectionTitle>
        <Flex direction="column" gap="small">
          <ScoreRow label="CRM Cleanliness"  score={scores.crmCleanliness} />
          <ScoreRow label="Process Health"   score={scores.processHealth} />
          <ScoreRow label="Feature Adoption" score={scores.featureAdoption} />
          <ScoreRow label="User Activity"    score={scores.userActivity} />
        </Flex>
      </Flex>

      <Divider />

      {/* ── 5. Portal at a Glance ────────────────────────────────── */}
      {p ? (
        <Flex direction="column" gap="medium">
          <SectionTitle>Portal at a Glance</SectionTitle>

          <Flex direction="row" gap="medium">
            <MetricBox label="Contacts"  value={p.crmCleanliness.contacts.total} />
            <MetricBox label="Companies" value={p.crmCleanliness.companies.total} />
            <MetricBox label="Deals"     value={p.crmCleanliness.deals.total} />
            <MetricBox label="Tickets"   value={p.crmCleanliness.tickets.total} />
          </Flex>

          <Flex direction="row" gap="medium">
            <MetricBox
              label="Total Users"
              value={p.userActivity.total}
              sub={p.userActivity.neverLoggedIn > 0
                ? `${p.userActivity.neverLoggedIn} never logged in`
                : undefined}
            />
            <MetricBox label="Pipelines" value={p.processHealth.pipelines.length} />
            <MetricBox
              label="Workflows"
              value={totalWorkflows}
              sub={`${activeWorkflows} active`}
            />
            <MetricBox
              label="Forms"
              value={p.featureAdoption.forms.total}
              sub={`${p.featureAdoption.forms.active} active`}
            />
          </Flex>
        </Flex>
      ) : null}

      <Divider />

      {/* ── 6. Action Plan ───────────────────────────────────────── */}
      <Flex direction="column" gap="medium">
        <SectionTitle>
          {`Action Plan — ${analysis.recommendations.length} Recommendations`}
        </SectionTitle>
        <Text>Sorted by priority. Address critical and high items first for maximum ROI.</Text>

        {byRisk.map(({ risk, items }) => (
          <Flex key={risk} direction="column" gap="small">
            <Tag variant={riskVariant(risk)}>
              {risk.charAt(0).toUpperCase() + risk.slice(1)} ({items.length})
            </Tag>

            {items.map((rec) => (
              <Box key={rec.id}>
                <Flex direction="column" gap="extra-small">
                  <Text format={{ fontWeight: 'bold' }}>{rec.title}</Text>
                  <Text>
                    <Text format={{ fontWeight: 'bold' }}>Problem: </Text>
                    {rec.problem}
                  </Text>
                  <Text>
                    <Text format={{ fontWeight: 'bold' }}>Impact: </Text>
                    {rec.impact}
                  </Text>
                  <Text>
                    <Text format={{ fontWeight: 'bold' }}>Action: </Text>
                    {rec.action}
                  </Text>
                  {rec.hubspotUrl ? (
                    <Link href={rec.hubspotUrl}>→ Open in HubSpot</Link>
                  ) : null}
                </Flex>
              </Box>
            ))}
          </Flex>
        ))}
      </Flex>

      <Divider />

      {/* ── 7. Detailed Metrics ──────────────────────────────────── */}
      {p ? (
        <Flex direction="column" gap="large">
          <SectionTitle>Detailed Metrics</SectionTitle>

          {/* CRM Cleanliness per-object */}
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: 'bold' }}>CRM Cleanliness</Text>
            <Flex direction="row" gap="medium">
              {([
                { label: 'Contacts',  data: p.crmCleanliness.contacts },
                { label: 'Companies', data: p.crmCleanliness.companies },
                { label: 'Deals',     data: p.crmCleanliness.deals },
                { label: 'Tickets',   data: p.crmCleanliness.tickets },
              ] as const).map(({ label, data }) => (
                <Box key={label}>
                  <Flex direction="column" gap="extra-small">
                    <Text format={{ fontWeight: 'bold' }}>{label}</Text>
                    <Text>Total: {data.total}</Text>
                    <Text>Unassigned: {data.unassigned}</Text>
                    <Text>Stagnant: {data.stagnant}</Text>
                    <Tag variant={scoreVariant(data.completenessScore)}>
                      {data.completenessScore}% complete
                    </Tag>
                  </Flex>
                </Box>
              ))}
            </Flex>
          </Flex>

          <Divider />

          {/* Deal Pipelines table */}
          {p.processHealth.pipelines.length > 0 ? (
            <Flex direction="column" gap="small">
              <Text format={{ fontWeight: 'bold' }}>Deal Pipelines</Text>
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

          <Divider />

          {/* User Activity */}
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: 'bold' }}>User Activity</Text>
            <Flex direction="row" gap="medium">
              <MetricBox label="Total Users"     value={p.userActivity.total} />
              <MetricBox label="Active (30d)"    value={p.userActivity.active} />
              <MetricBox label="Inactive (90d+)" value={p.userActivity.inactive} />
              <MetricBox label="Never Logged In" value={p.userActivity.neverLoggedIn} />
            </Flex>
            {p.userActivity.superAdmins > 0 ? (
              <Text>Super admins: {p.userActivity.superAdmins}</Text>
            ) : null}
            {p.userActivity.usersWithNoRole > 0 ? (
              <Text>Users without a role: {p.userActivity.usersWithNoRole}</Text>
            ) : null}
          </Flex>

          <Divider />

          {/* Feature Adoption */}
          <Flex direction="column" gap="small">
            <Text format={{ fontWeight: 'bold' }}>Feature Adoption</Text>
            <Flex direction="row" gap="medium">
              <MetricBox
                label="Lists"
                value={p.featureAdoption.lists.total}
                sub={`${p.featureAdoption.lists.active} active`}
              />
              <MetricBox
                label="Forms"
                value={p.featureAdoption.forms.total}
                sub={`${p.featureAdoption.forms.active} active`}
              />
              {p.featureAdoption.reports.total > 0 ? (
                <MetricBox label="Emails" value={p.featureAdoption.reports.total} />
              ) : null}
              {p.featureAdoption.emailDeliverability.bounceRate !== null ? (
                <MetricBox
                  label="Bounce Rate"
                  value={`${p.featureAdoption.emailDeliverability.bounceRate}%`}
                />
              ) : null}
            </Flex>
          </Flex>

          {/* Lifecycle stage gaps */}
          {p.processHealth.lifecycleStageGaps.length > 0 ? (
            <Flex direction="column" gap="small">
              <Text format={{ fontWeight: 'bold' }}>Lifecycle Stage Gaps</Text>
              <Text>
                No contacts in: {p.processHealth.lifecycleStageGaps.join(', ')}
              </Text>
            </Flex>
          ) : null}

        </Flex>
      ) : null}

      {/* ── 8. Footer ────────────────────────────────────────────── */}
      <Divider />
      <Text>
        Generated by HubAudit AI · {generatedDate} · Model: {analysis.modelUsed} ·
        Duration: {Math.round(result.durationMs / 1000)}s
      </Text>

    </Flex>
  );
}
