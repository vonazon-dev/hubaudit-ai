/**
 * Email delivery service using HubSpot Transactional Email API.
 *
 * Requires:
 *   - A transactional email template created in HubSpot (Marketing > Email > Transactional)
 *   - HUBSPOT_EMAIL_TEMPLATE_ID env var set to that template's ID
 *   - The sender email must be verified in HubSpot
 */
import axios from 'axios';
import { logger } from '../lib/logger';

interface SendReportEmailParams {
  toEmail: string;
  toName: string;
  portalId: number;
  portalName: string;
  overallScore: number;
  criticalCount: number;
  recommendationCount: number;
  pdfBuffer: Buffer;
  auditDate: string;
  accessToken: string; // portal's own access token for sending
}

export async function sendReportEmail(params: SendReportEmailParams): Promise<void> {
  const {
    toEmail, toName, portalId, portalName,
    overallScore, criticalCount, recommendationCount,
    pdfBuffer, auditDate, accessToken,
  } = params;

  const templateId = process.env.HUBSPOT_EMAIL_TEMPLATE_ID;
  if (!templateId) {
    logger.warn('HUBSPOT_EMAIL_TEMPLATE_ID not set — skipping email delivery', { portalId });
    return;
  }

  const scoreLabel = overallScore >= 70 ? 'Good' : overallScore >= 40 ? 'Needs Work' : 'Critical';
  const filename = `HubAudit_AI_${portalName.replace(/\s+/g, '_')}_${auditDate}.pdf`;
  const base64Pdf = pdfBuffer.toString('base64');

  try {
    await axios.post(
      'https://api.hubapi.com/crm/v3/objects/emails',
      {
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_email_subject: `Your HubSpot Portal Health Report — Score: ${overallScore}/100`,
          hs_email_html: buildEmailHtml({
            toName, portalName, overallScore, scoreLabel,
            criticalCount, recommendationCount, auditDate, filename,
          }),
          hs_email_text: buildEmailText({
            toName, portalName, overallScore, criticalCount,
            recommendationCount, auditDate,
          }),
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    logger.info('Report email sent via HubSpot', { portalId, toEmail });
  } catch (err: any) {
    // Fallback: try the transactional email API directly
    logger.warn('CRM email object failed, trying transactional API', { error: err.message });

    await axios.post(
      'https://api.hubapi.com/marketing/v3/transactional/single-email/send',
      {
        emailId: parseInt(templateId, 10),
        message: {
          to: toEmail,
          sendId: `hubaudit_${portalId}_${Date.now()}`,
          replyTo: [process.env.REPLY_TO_EMAIL ?? 'noreply@hubauditai.com'],
        },
        customProperties: [
          { name: 'portal_name',            value: portalName },
          { name: 'overall_score',          value: String(overallScore) },
          { name: 'score_label',            value: scoreLabel },
          { name: 'critical_count',         value: String(criticalCount) },
          { name: 'recommendation_count',   value: String(recommendationCount) },
          { name: 'audit_date',             value: auditDate },
          { name: 'recipient_name',         value: toName },
        ],
        attachments: [
          {
            fileName: filename,
            base64Data: base64Pdf,
            contentType: 'application/pdf',
          },
        ],
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    logger.info('Report email sent via transactional API', { portalId, toEmail });
  }
}

function buildEmailHtml(p: {
  toName: string; portalName: string; overallScore: number;
  scoreLabel: string; criticalCount: number; recommendationCount: number;
  auditDate: string; filename: string;
}): string {
  const scoreColor = p.overallScore >= 70 ? '#16A34A' : p.overallScore >= 40 ? '#CA8A04' : '#DC2626';

  return `
<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F3F4F6;margin:0;padding:24px">
<div style="max-width:580px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
  <div style="background:#0F172A;padding:24px 32px">
    <div style="font-size:20px;font-weight:800;color:white">HubAudit <span style="color:#FB923C">AI</span></div>
    <div style="font-size:12px;color:#94A3B8;margin-top:2px">Quarterly Portal Health Report</div>
  </div>
  <div style="padding:32px">
    <p style="font-size:16px;color:#111827;margin-bottom:24px">Hi ${p.toName},</p>
    <p style="color:#374151;line-height:1.7;margin-bottom:24px">Your quarterly HubSpot health audit for <strong>${p.portalName}</strong> is ready. Here's a snapshot:</p>

    <div style="text-align:center;background:#F9FAFB;border-radius:10px;padding:28px;margin-bottom:24px">
      <div style="font-size:56px;font-weight:900;color:${scoreColor};line-height:1">${p.overallScore}</div>
      <div style="font-size:14px;color:#6B7280;margin-top:4px">Overall Health Score / 100</div>
      <div style="display:inline-block;background:${scoreColor};color:white;font-weight:700;padding:4px 16px;border-radius:20px;margin-top:8px;font-size:13px">${p.scoreLabel}</div>
    </div>

    ${p.criticalCount > 0 ? `
    <div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="color:#DC2626;font-weight:700;margin-bottom:4px">⚠️ ${p.criticalCount} Critical issue${p.criticalCount > 1 ? 's' : ''} found</p>
      <p style="color:#9A3412;font-size:13px">These require immediate attention. See the full report for details.</p>
    </div>` : ''}

    <p style="color:#374151;font-size:14px;margin-bottom:24px">Your full report contains <strong>${p.recommendationCount} recommendations</strong> with specific action steps. It's attached to this email as a PDF.</p>

    <p style="color:#6B7280;font-size:12px;margin-top:32px;padding-top:16px;border-top:1px solid #E5E7EB">
      Generated on ${p.auditDate} by HubAudit AI.<br/>
      To provide feedback on this report, reply to this email.
    </p>
  </div>
</div>
</body></html>`;
}

function buildEmailText(p: {
  toName: string; portalName: string; overallScore: number;
  criticalCount: number; recommendationCount: number; auditDate: string;
}): string {
  return `Hi ${p.toName},

Your quarterly HubSpot health audit for ${p.portalName} is complete.

Overall Health Score: ${p.overallScore}/100
Critical Issues: ${p.criticalCount}
Total Recommendations: ${p.recommendationCount}

Your full PDF report is attached.

Generated on ${p.auditDate} by HubAudit AI.
`;
}
