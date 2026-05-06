/**
 * Generates the full HTML string for the audit report PDF.
 * Puppeteer renders this to PDF — so full CSS, flexbox, grid all work.
 */
import { AuditPayload } from '../types/audit';
import { CategoryScores } from '../audit/scoringEngine';
import { AiAnalysis, Recommendation } from '../types/aiAnalysis';

const RISK_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high:     '#EA580C',
  medium:   '#CA8A04',
  low:      '#16A34A',
};

const RISK_BG: Record<string, string> = {
  critical: '#FEF2F2',
  high:     '#FFF7ED',
  medium:   '#FEFCE8',
  low:      '#F0FDF4',
};

const CATEGORY_LABELS: Record<string, string> = {
  crm_cleanliness:  'CRM Cleanliness',
  process_health:   'Process Health',
  feature_adoption: 'Feature Adoption',
  user_activity:    'User Activity',
};

function scoreColor(score: number): string {
  if (score >= 70) return '#16A34A';
  if (score >= 40) return '#CA8A04';
  return '#DC2626';
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Critical';
}

function gaugeArc(score: number): string {
  // SVG arc for semicircular gauge (180 degrees)
  const r = 54;
  const cx = 70;
  const cy = 70;
  const pct = score / 100;
  const angle = pct * Math.PI;
  const x = cx - r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const largeArc = pct > 0.5 ? 1 : 0;
  return `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

function scoreBar(score: number, label: string): string {
  const color = scoreColor(score);
  return `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-size:13px;color:#374151;font-weight:500">${label}</span>
        <span style="font-size:13px;font-weight:700;color:${color}">${score}/100</span>
      </div>
      <div style="background:#E5E7EB;border-radius:6px;height:10px;overflow:hidden">
        <div style="width:${score}%;height:100%;background:${color};border-radius:6px;transition:width 0.3s"></div>
      </div>
    </div>`;
}

function recommendationCard(rec: Recommendation): string {
  const color = RISK_COLORS[rec.risk];
  const bg    = RISK_BG[rec.risk];
  const link  = rec.hubspotUrl
    ? `<a href="${rec.hubspotUrl}" style="color:#2563EB;font-size:12px;text-decoration:none">→ Open in HubSpot</a>`
    : '';
  return `
    <div style="border:1px solid ${color}33;border-left:4px solid ${color};border-radius:8px;padding:16px;margin-bottom:14px;background:${bg}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <span style="font-size:14px;font-weight:700;color:#111827">${rec.title}</span>
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${color};background:white;border:1px solid ${color};border-radius:4px;padding:2px 8px">${rec.risk}</span>
      </div>
      <p style="font-size:12px;color:#374151;margin:0 0 6px"><strong>Problem:</strong> ${rec.problem}</p>
      <p style="font-size:12px;color:#374151;margin:0 0 6px"><strong>Impact:</strong> ${rec.impact}</p>
      <p style="font-size:12px;color:#1D4ED8;margin:0 0 8px"><strong>Action:</strong> ${rec.action}</p>
      ${link}
    </div>`;
}

function statBox(label: string, value: string | number, sub?: string): string {
  return `
    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px;text-align:center">
      <div style="font-size:24px;font-weight:800;color:#111827">${value}</div>
      <div style="font-size:12px;color:#6B7280;margin-top:3px">${label}</div>
      ${sub ? `<div style="font-size:11px;color:#9CA3AF;margin-top:2px">${sub}</div>` : ''}
    </div>`;
}

export function buildReportHtml(
  payload: AuditPayload,
  scores: CategoryScores,
  analysis: AiAnalysis,
  portalName: string,
): string {
  const { crmCleanliness: crm, processHealth: proc, featureAdoption: feat, userActivity: users } = payload;
  const { executiveSummary: exec, recommendations } = analysis;
  const auditDate = new Date(payload.collectedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const critical = recommendations.filter(r => r.risk === 'critical');
  const high     = recommendations.filter(r => r.risk === 'high');
  const medium   = recommendations.filter(r => r.risk === 'medium');
  const low      = recommendations.filter(r => r.risk === 'low');

  const byCategory = recommendations.reduce((acc, r) => {
    (acc[r.category] = acc[r.category] ?? []).push(r);
    return acc;
  }, {} as Record<string, Recommendation[]>);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HubAudit AI Report — ${portalName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; background: white; }
  .page { padding: 48px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 800; }
  h2 { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #E5E7EB; }
  h3 { font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 10px; }
  .section { margin-bottom: 36px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }
  .card { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 20px; }
  .tag { display:inline-block; font-size:11px; font-weight:600; border-radius:4px; padding:2px 8px; }
  .page-break { page-break-before: always; padding-top: 48px; }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════ -->
<!-- COVER PAGE                                          -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="page" style="min-height:100vh;display:flex;flex-direction:column;justify-content:space-between">
  <div>
    <!-- Header bar -->
    <div style="background:#0F172A;border-radius:12px;padding:24px 32px;margin-bottom:48px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:22px;font-weight:800;color:white;letter-spacing:-0.5px">HubAudit <span style="color:#FB923C">AI</span></div>
        <div style="font-size:12px;color:#94A3B8;margin-top:2px">Quarterly Portal Health Report</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:#94A3B8">${auditDate}</div>
        <div style="font-size:12px;color:#94A3B8">Portal ID: ${payload.portalId}</div>
      </div>
    </div>

    <!-- Portal name + score badge -->
    <div style="text-align:center;padding:32px 0 48px">
      <div style="font-size:14px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Portal</div>
      <h1 style="font-size:36px;margin-bottom:40px">${portalName}</h1>

      <!-- Health score gauge -->
      <div style="display:inline-block;position:relative">
        <svg width="140" height="90" viewBox="0 0 140 90">
          <!-- Background arc -->
          <path d="M 16 70 A 54 54 0 0 1 124 70" fill="none" stroke="#E5E7EB" stroke-width="10" stroke-linecap="round"/>
          <!-- Score arc -->
          <path d="${gaugeArc(scores.overall)}" fill="none" stroke="${scoreColor(scores.overall)}" stroke-width="10" stroke-linecap="round" transform="translate(70,70) scale(1,-1) translate(-70,-70)"/>
        </svg>
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);text-align:center">
          <div style="font-size:40px;font-weight:900;color:${scoreColor(scores.overall)};line-height:1">${scores.overall}</div>
          <div style="font-size:12px;color:#6B7280">/100</div>
        </div>
      </div>

      <div style="margin-top:12px">
        <span style="background:${scoreColor(scores.overall)};color:white;font-size:14px;font-weight:700;padding:6px 20px;border-radius:20px">${scoreLabel(scores.overall)}</span>
      </div>
    </div>

    <!-- Category score pills -->
    <div class="grid-4" style="margin-bottom:40px">
      ${[
        ['CRM Cleanliness', scores.crmCleanliness],
        ['Process Health', scores.processHealth],
        ['Feature Adoption', scores.featureAdoption],
        ['User Activity', scores.userActivity],
      ].map(([label, score]) => `
        <div style="text-align:center;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px 8px">
          <div style="font-size:26px;font-weight:800;color:${scoreColor(score as number)}">${score}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:4px">${label}</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- Risk summary footer -->
  <div style="display:flex;gap:12px;justify-content:center;padding:24px;background:#FEF2F2;border-radius:10px">
    ${[
      ['Critical', critical.length, '#DC2626'],
      ['High', high.length, '#EA580C'],
      ['Medium', medium.length, '#CA8A04'],
      ['Low', low.length, '#16A34A'],
    ].map(([label, count, color]) => `
      <div style="text-align:center;min-width:80px">
        <div style="font-size:28px;font-weight:900;color:${color}">${count}</div>
        <div style="font-size:11px;color:#6B7280">${label}</div>
      </div>`).join('<div style="width:1px;background:#E5E7EB"></div>')}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGE 2: EXECUTIVE SUMMARY                           -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="page page-break">
  <div class="section">
    <h2>Executive Summary</h2>
    <div class="card" style="margin-bottom:20px">
      <p style="font-size:15px;color:#1E293B;line-height:1.7;font-style:italic">"${exec.overallVerdict}"</p>
    </div>
    <div class="grid-2" style="gap:16px">
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:20px">
        <h3 style="color:#15803D;margin-bottom:12px">✓ What's working well</h3>
        ${exec.topWins.map(w => `<p style="font-size:13px;color:#166534;margin-bottom:8px;padding-left:12px;border-left:3px solid #4ADE80">● ${w}</p>`).join('')}
      </div>
      <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:20px">
        <h3 style="color:#C2410C;margin-bottom:12px">⚠ Top gaps to address</h3>
        ${exec.topGaps.map(g => `<p style="font-size:13px;color:#9A3412;margin-bottom:8px;padding-left:12px;border-left:3px solid #FB923C">● ${g}</p>`).join('')}
      </div>
    </div>
    <div style="margin-top:16px;padding:16px;background:#EFF6FF;border-radius:8px;border:1px solid #BFDBFE">
      <p style="font-size:13px;color:#1E40AF;line-height:1.6">💡 ${exec.closingNote}</p>
    </div>
  </div>

  <!-- Score breakdown -->
  <div class="section">
    <h2>Health Score Breakdown</h2>
    <div class="card">
      ${scoreBar(scores.crmCleanliness, 'CRM Cleanliness')}
      ${scoreBar(scores.processHealth, 'Process Health')}
      ${scoreBar(scores.featureAdoption, 'Feature Adoption')}
      ${scoreBar(scores.userActivity, 'User Activity')}
    </div>
  </div>

  <!-- Quick stats -->
  <div class="section">
    <h2>Portal at a Glance</h2>
    <div class="grid-4">
      ${statBox('Contacts', crm.contacts.total.toLocaleString())}
      ${statBox('Companies', crm.companies.total.toLocaleString())}
      ${statBox('Deals', crm.deals.total.toLocaleString())}
      ${statBox('Tickets', crm.tickets.total.toLocaleString())}
    </div>
    <div class="grid-4" style="margin-top:12px">
      ${statBox('Total Users', users.total, `${users.neverLoggedIn} never logged in`)}
      ${statBox('Pipelines', proc.pipelines.length)}
      ${statBox('Workflows', proc.workflows.length, `${proc.workflows.filter(w => w.enabled).length} active`)}
      ${statBox('Forms', feat.forms.total, `${feat.forms.active} active`)}
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGE 3: RECOMMENDATIONS                             -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="page page-break">
  <div class="section">
    <h2>Action Plan — ${recommendations.length} Recommendations</h2>
    <p style="font-size:13px;color:#6B7280;margin-bottom:20px">Sorted by priority. Address critical and high items first for maximum ROI.</p>

    ${critical.length ? `<h3 style="color:#DC2626;margin-bottom:10px">🔴 Critical (${critical.length})</h3>${critical.map(recommendationCard).join('')}` : ''}
    ${high.length    ? `<h3 style="color:#EA580C;margin-bottom:10px;margin-top:20px">🟠 High (${high.length})</h3>${high.map(recommendationCard).join('')}` : ''}
    ${medium.length  ? `<h3 style="color:#CA8A04;margin-bottom:10px;margin-top:20px">🟡 Medium (${medium.length})</h3>${medium.map(recommendationCard).join('')}` : ''}
    ${low.length     ? `<h3 style="color:#16A34A;margin-bottom:10px;margin-top:20px">🟢 Low (${low.length})</h3>${low.map(recommendationCard).join('')}` : ''}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGE 4: DETAILED DATA                               -->
<!-- ═══════════════════════════════════════════════════ -->
<div class="page page-break">
  <h2>Detailed Metrics</h2>

  <!-- CRM Cleanliness -->
  <div class="section">
    <h3>CRM Cleanliness</h3>
    <div class="grid-2" style="gap:12px">
      ${[
        ['Contacts', crm.contacts],
        ['Companies', crm.companies],
        ['Deals', crm.deals],
        ['Tickets', crm.tickets],
      ].map(([label, obj]: any) => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px">
            <span style="font-weight:600">${label}</span>
            <span style="font-size:13px;font-weight:700;color:${scoreColor(obj.completenessScore)}">${obj.completenessScore}% complete</span>
          </div>
          <div style="font-size:12px;color:#6B7280;line-height:1.8">
            Total: <strong>${obj.total.toLocaleString()}</strong><br/>
            Unassigned: <strong>${obj.unassigned}</strong><br/>
            Stagnant: <strong>${obj.stagnant}</strong>
            ${obj.missingEmail ? `<br/>Missing email: <strong>${obj.missingEmail}</strong>` : ''}
            ${obj.missingPhone ? `<br/>Missing phone: <strong>${obj.missingPhone}</strong>` : ''}
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- Pipelines -->
  <div class="section">
    <h3>Deal Pipelines</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#F1F5F9;text-align:left">
          <th style="padding:8px 10px;border:1px solid #E2E8F0">Pipeline</th>
          <th style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center">Deals</th>
          <th style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center">Stagnant</th>
          <th style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center">No Close Date</th>
          <th style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center">No Amount</th>
        </tr>
      </thead>
      <tbody>
        ${proc.pipelines.map((p, i) => `
          <tr style="background:${i % 2 === 0 ? 'white' : '#F9FAFB'}">
            <td style="padding:8px 10px;border:1px solid #E2E8F0;font-weight:500">${p.label}</td>
            <td style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center">${p.dealsInPipeline}</td>
            <td style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center;color:${p.stagnantDeals > 0 ? '#DC2626' : '#16A34A'}">${p.stagnantDeals}</td>
            <td style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center">${p.missingCloseDate}</td>
            <td style="padding:8px 10px;border:1px solid #E2E8F0;text-align:center">${p.missingAmount}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <!-- User Activity -->
  <div class="section">
    <h3>User Activity</h3>
    <div class="grid-4">
      ${statBox('Total Users', users.total)}
      ${statBox('Active (30d)', users.active)}
      ${statBox('Inactive (90d+)', users.inactive)}
      ${statBox('Never Logged In', users.neverLoggedIn)}
    </div>
  </div>

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #E5E7EB;text-align:center">
    <p style="font-size:11px;color:#9CA3AF">Generated by HubAudit AI • ${auditDate} • Model: ${analysis.modelUsed}</p>
    <p style="font-size:11px;color:#9CA3AF;margin-top:4px">This report is confidential and intended for the portal administrator only.</p>
  </div>
</div>

</body>
</html>`;
}
