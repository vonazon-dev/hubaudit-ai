# HubAudit AI — Setup Guide

## Phase 0 checklist

### 1. Create your HubSpot Public App

1. Go to [developers.hubspot.com](https://developers.hubspot.com) → your developer account
2. Click **Apps** → **Create app**
3. Fill in:
   - **App name**: HubAudit AI
   - **Description**: AI-powered quarterly health check for your HubSpot portal
4. Under **Auth** tab:
   - Add redirect URI: `https://your-app.ondigitalocean.app/oauth/callback`
   - Add scopes (copy exactly):
     ```
     crm.objects.contacts.read
     crm.objects.companies.read
     crm.objects.deals.read
     crm.objects.tickets.read
     crm.schemas.contacts.read
     crm.schemas.companies.read
     crm.schemas.deals.read
     crm.pipelines.orders.read
     automation.flows.read
     settings.users.read
     oauth
     ```
5. Copy **Client ID** and **Client Secret** → add to `.env`

### 2. Generate your encryption key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `TOKEN_ENCRYPTION_KEY` in `.env`.

### 3. Local development

```bash
cp .env.example .env
# Fill in all values in .env

npm install
npm run dev
```

Test endpoints:
- `GET http://localhost:3000/api/health` → should return `{ status: 'ok' }`
- `GET http://localhost:3000/oauth/install` → should redirect to HubSpot

### 4. Deploy to DigitalOcean

```bash
# Install doctl if needed: https://docs.digitalocean.com/reference/doctl/how-to/install/
doctl auth init
doctl apps create --spec .do/app.yaml
```

Then add secrets in the DigitalOcean dashboard under **App → Settings → Env Vars**.

Update the redirect URI in your HubSpot app to your DigitalOcean URL.

### 5. Register the uninstall webhook

In your HubSpot app settings → **Webhooks**:
- Add endpoint: `https://your-app.ondigitalocean.app/oauth/uninstall`
- Event: `app.uninstalled`

---

## Project structure

```
src/
  index.ts              ← Express app entry point
  types/index.ts        ← Shared TypeScript interfaces
  lib/
    logger.ts           ← Winston logger
    tokenStore.ts       ← Encrypted token storage (in-memory Phase 0)
  services/
    hubspotOAuth.ts     ← OAuth flow, token exchange & refresh
    cadenceGuard.ts     ← 90-day audit enforcement
  middleware/
    requirePortal.ts    ← Validates portalId on protected routes
  routes/
    oauth.ts            ← /oauth/install, /callback, /uninstall
    api.ts              ← /api/health, /status, /audit/trigger
.do/app.yaml            ← DigitalOcean App Platform spec
.env.example            ← Copy to .env and fill in values
```

## What's next (Phase 1)

- [ ] Replace in-memory token store with PostgreSQL
- [ ] Persist cadence dates in DB
- [ ] Build HubSpot API data fetcher modules (CRM cleanliness, process health, etc.)
- [ ] Add background job queue for long-running audit




  Step 3 — Dockerize the app

  Create a Dockerfile that builds the TypeScript and runs node dist/index.js. DigitalOcean App Platform can also detect
  Node apps without Docker, but a Dockerfile gives you more control and reproducibility.

  Step 4 — Deploy to DigitalOcean App Platform

  - Create a DO App from your GitHub repo
  - Attach a Managed PostgreSQL database (DO handles backups, failover)
  - Set all env vars (HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, APP_BASE_URL, TOKEN_ENCRYPTION_KEY, DATABASE_URL, etc.)
  in the DO dashboard
  - The /api/health endpoint is already wired and works as a health check

  Step 5 — Update HubSpot app settings

  Once DO gives you a live URL (e.g. https://hubaudit-ai.ondigitalocean.app), update the redirect URI in your HubSpot
  app's OAuth settings to point there. Right now it's likely pointing to localhost.
