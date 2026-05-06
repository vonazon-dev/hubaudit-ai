/**
 * PDF generator service.
 * Renders the HTML report template to a PDF buffer using Puppeteer.
 *
 * Works in two modes:
 *   - Local dev: uses locally installed Chrome/Chromium
 *   - Production (DigitalOcean): uses @sparticuz/chromium bundled binary
 */
import puppeteer from 'puppeteer-core';
import { AuditPayload } from '../types/audit';
import { CategoryScores } from '../audit/scoringEngine';
import { AiAnalysis } from '../types/aiAnalysis';
import { buildReportHtml } from './reportTemplate';
import { logger } from '../lib/logger';
import path from 'path';
import fs from 'fs';
import os from 'os';

async function getBrowserExecutable(): Promise<string> {
  // Production: use @sparticuz/chromium
  if (process.env.NODE_ENV === 'production') {
    const chromium = await import('@sparticuz/chromium');
    return chromium.default.executablePath();
  }

  // Local dev: find system Chrome or Chromium
  const candidates = [
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    'No Chrome/Chromium found for local PDF generation. ' +
    'Install Google Chrome or set NODE_ENV=production to use bundled Chromium.'
  );
}

export async function generatePdf(
  payload: AuditPayload,
  scores: CategoryScores,
  analysis: AiAnalysis,
  portalName: string,
): Promise<Buffer> {
  logger.info('Generating PDF report', { portalId: payload.portalId });

  const executablePath = await getBrowserExecutable();
  const html = buildReportHtml(payload, scores, analysis, portalName);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    logger.info('PDF generated', {
      portalId: payload.portalId,
      sizeKb: Math.round(pdfBuffer.length / 1024),
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Saves the PDF buffer to a temp file and returns the file path.
 * Used for local testing — check the output folder to view the PDF.
 */
export async function savePdfLocally(
  buffer: Buffer,
  portalId: number,
): Promise<string> {
  const dir = path.join(os.tmpdir(), 'hubaudit');
  fs.mkdirSync(dir, { recursive: true });

  const filename = `HubAudit_AI_Portal${portalId}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, buffer);

  logger.info('PDF saved locally for inspection', { filepath });
  return filepath;
}
