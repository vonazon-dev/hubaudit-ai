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
} from '@hubspot/ui-extensions';

const BACKEND = 'https://hubaudit-ai-i4z82.ondigitalocean.app';

type PageStatus = 'loading' | 'pending' | 'complete' | 'failed' | 'not_found' | 'error';

interface Scores {
  overall: number;
  crmCleanliness: number;
  processHealth: number;
  featureAdoption: number;
  userActivity: number;
}

interface Recommendation {
  id: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  problem: string;
  impact: string;
  action: string;
}

interface AuditResult {
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

hubspot.extend(({ context }: any) => (
  <AuditPage portalId={context.portal.id} />
));

function AuditPage({ portalId }: { portalId: number }) {
  const [status, setStatus] = useState<PageStatus>('loading');
  const [result, setResult] = useState<AuditResult | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      const resp = await hubspot.fetch(
        `${BACKEND}/api/report?portalId=${portalId}`,
      );

      if (resp.status === 404 || resp.status === 401) { setStatus('not_found'); return; }
      if (resp.status < 200 || resp.status >= 300)    { setStatus('error');     return; }

      const data = await resp.json();

      if (data.status === 'pending')  { setStatus('pending'); return; }
      if (data.status === 'failed')   { setStatus('failed');  return; }
      if (data.status === 'complete') {
        setResult(data.result);
        setStatus('complete');
      }
    } catch {
      setStatus('error');
    }
  }, [portalId]);

  const triggerAudit = useCallback(async () => {
    try {
      setStatus('loading');
      await hubspot.fetch(`${BACKEND}/api/audit/trigger?portalId=${portalId}`, {
        method: 'POST',
      });
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
          Your HubSpot account audit is running in the background. This typically
          takes 2–5 minutes. This page checks automatically every 20 seconds.
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

function scoreVariant(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

function riskVariant(risk: string): 'danger' | 'warning' | 'default' | 'success' {
  if (risk === 'critical') return 'danger';
  if (risk === 'high')     return 'warning';
  if (risk === 'medium')   return 'default';
  return 'success';
}

function ReportView({ result, onRerun }: { result: AuditResult; onRerun: () => void }) {
  const { scores, analysis } = result;
  const byRisk = (['critical', 'high', 'medium', 'low'] as const)
    .map((risk) => ({ risk, items: analysis.recommendations.filter((r) => r.risk === risk) }))
    .filter((g) => g.items.length > 0);

  return (
    <Flex direction="column" gap="large">

      {/* Header */}
      <Flex direction="row" justify="between" align="center">
        <Heading>HubAudit AI Report</Heading>
        <Button onClick={onRerun} variant="secondary">Re-run Audit</Button>
      </Flex>

      {/* Overall score */}
      <Flex direction="row" align="center" gap="small">
        <Text format={{ fontWeight: 'bold' }}>Overall Score</Text>
        <Tag variant={scoreVariant(scores.overall)}>{scores.overall} / 100</Tag>
      </Flex>

      {/* Category scores */}
      <Box>
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: 'bold' }}>Category Breakdown</Text>
          {[
            { label: 'CRM Cleanliness',  score: scores.crmCleanliness },
            { label: 'Process Health',   score: scores.processHealth },
            { label: 'Feature Adoption', score: scores.featureAdoption },
            { label: 'User Activity',    score: scores.userActivity },
          ].map(({ label, score }) => (
            <Flex key={label} direction="row" justify="between" align="center">
              <Text>{label}</Text>
              <Tag variant={scoreVariant(score)}>{score}</Tag>
            </Flex>
          ))}
        </Flex>
      </Box>

      <Divider />

      {/* Executive summary */}
      <Flex direction="column" gap="small">
        <Heading>Executive Summary</Heading>
        <Text>{analysis.executiveSummary.overallVerdict}</Text>

        <Text format={{ fontWeight: 'bold' }}>What's going well</Text>
        <Flex direction="column" gap="extra-small">
          {analysis.executiveSummary.topWins.map((w, i) => (
            <Text key={i}>+ {w}</Text>
          ))}
        </Flex>

        <Text format={{ fontWeight: 'bold' }}>Areas to improve</Text>
        <Flex direction="column" gap="extra-small">
          {analysis.executiveSummary.topGaps.map((g, i) => (
            <Text key={i}>- {g}</Text>
          ))}
        </Flex>

        <Text>{analysis.executiveSummary.closingNote}</Text>
      </Flex>

      <Divider />

      {/* Recommendations */}
      <Flex direction="column" gap="medium">
        <Heading>Recommendations ({analysis.recommendations.length})</Heading>

        {byRisk.map(({ risk, items }) => (
          <Flex key={risk} direction="column" gap="small">
            <Tag variant={riskVariant(risk)}>
              {risk.charAt(0).toUpperCase() + risk.slice(1)} ({items.length})
            </Tag>

            {items.map((rec) => (
              <Box key={rec.id}>
                <Flex direction="column" gap="extra-small">
                  <Text format={{ fontWeight: 'bold' }}>{rec.title}</Text>
                  <Text format={{ fontWeight: 'bold' }}>Problem</Text>
                  <Text>{rec.problem}</Text>
                  <Text format={{ fontWeight: 'bold' }}>Impact</Text>
                  <Text>{rec.impact}</Text>
                  <Text format={{ fontWeight: 'bold' }}>Action</Text>
                  <Text>{rec.action}</Text>
                </Flex>
              </Box>
            ))}
          </Flex>
        ))}
      </Flex>

      <Divider />

      <Text>
        Generated {new Date(analysis.generatedAt).toLocaleString()} · Model: {analysis.modelUsed} · Duration: {Math.round(result.durationMs / 1000)}s
      </Text>

    </Flex>
  );
}
