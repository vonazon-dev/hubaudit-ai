# Platform Auditor — Setup Guide

*This is the customer-facing Setup Guide content for the HubSpot Marketplace listing. Paste the sections below into the listing's Setup Guide field on developers.hubspot.com.*

## What this app does

Platform Auditor connects to your HubSpot portal and runs an automated health audit of your CRM data, deal pipelines, workflows, and user activity. Within a few minutes of installing, you'll get a scored report — CRM cleanliness, process health, feature adoption, and user activity — with an AI-generated summary and a prioritized list of fixes, delivered as a downloadable PDF and viewable directly inside HubSpot.

## Before you install

- You'll need **Super Admin** permissions on your HubSpot account to install the app and grant the requested permissions.
- No configuration, API keys, or setup work is required on your end — the audit runs automatically once you connect your account.

## Installing Platform Auditor

1. From the [HubSpot Marketplace listing](#), click **Install app** (or **Connect app**, depending on where you're installing from).
2. Log in to the HubSpot account you want to audit, if prompted.
3. Review the requested permissions on the authorization screen. Platform Auditor reads (never writes or modifies):
   - Contacts, companies, deals, and tickets
   - Deal pipelines and properties
   - Workflows/automations
   - Forms and active lists
   - Account users (for seat/activity checks)
4. Click **Connect app** to authorize. You'll be redirected back to HubSpot.
5. Your first audit starts automatically in the background — this typically takes 2–5 minutes. You don't need to keep a browser tab open; it runs server-side.

## Finding your report

Once the audit finishes, you can view your report in either of two places inside HubSpot:

- **App sidebar**: Look for **Platform Auditor** in the left sidebar navigation — this opens the full report as a standalone page.
- **Settings**: Go to **Settings → Integrations → Connected Apps → Platform Auditor** to view the same report from your account settings.

The report includes an overall health score out of 100, category-level scores (CRM cleanliness, process health, feature adoption, user activity), an AI-written executive summary, and a prioritized list of recommendations you can act on immediately.

## Running a new audit

Platform Auditor is designed as a periodic health check rather than a live dashboard — audits run on a 90-day cadence per portal to keep the analysis meaningful (CRM data changes gradually, not minute-to-minute).

- From either the sidebar page or Settings view, click **Run Audit Now** to trigger your first audit, or **Re-run Audit** once you're eligible again.
- If you try to re-run before the 90-day window is up, the app will tell you how many days remain until your next eligible audit.

## Removing Platform Auditor

You're always in control of your data — uninstalling is a normal HubSpot flow with no extra steps required:

1. Go to **Settings → Integrations → Connected Apps**.
2. Find **Platform Auditor** and click **Remove app** (then confirm).
3. HubSpot notifies us the moment you uninstall, and we immediately and permanently delete your stored access tokens and audit report data. No data is retained after removal.

## Support

Questions or issues installing/using the app? Contact **[support email/link]**.
