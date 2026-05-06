import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import { logger } from './lib/logger';
import { initDb } from './lib/db';
import oauthRouter from './routes/oauth';
import apiRouter from './routes/api';

// ── Validate required env vars on startup ──────────────────────────────
const REQUIRED_ENV = [
  'HUBSPOT_CLIENT_ID',
  'HUBSPOT_CLIENT_SECRET',
  'APP_BASE_URL',
  'TOKEN_ENCRYPTION_KEY',
  'DATABASE_URL',
];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  logger.error('Missing required environment variables', { missing });
  process.exit(1);
}

// ── App setup ──────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// Security headers
app.use(helmet());

// CORS — tighten origins in production
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? [process.env.APP_BASE_URL!, 'https://app.hubspot.com']
        : true,
    credentials: true,
  }),
);

// Request logging
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global rate limiter — 200 req / 15 min per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
  }),
);

// ── Routes ─────────────────────────────────────────────────────────────
app.use('/oauth', oauthRouter);
app.use('/api', apiRouter);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ──────────────────────────────────────────────────────────────
console.log(process.env.DATABASE_URL);
initDb()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`HubAudit AI backend running`, {
        port: PORT,
        env: process.env.NODE_ENV ?? 'development',
        baseUrl: process.env.APP_BASE_URL,
      });
    });
  })
  .catch((err) => {
    logger.error('Failed to initialize database', { error: err.message });
    process.exit(1);
  });

export default app;
