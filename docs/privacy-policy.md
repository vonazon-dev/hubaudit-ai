# Platform Auditor — Privacy Policy

*Draft. Have this reviewed by a lawyer before publishing — this is not legal advice.*

**Last updated:** July 21, 2026

This Privacy Policy describes what data Platform Auditor (the "App") accesses from your HubSpot account, how it is used, who it is shared with, and how long it is retained.

## 1. Data we access

When you install the App, HubSpot asks you to approve a set of permissions ("scopes"). The App only ever **reads** this data — it never creates, edits, or deletes anything in your HubSpot portal. Specifically, we access:

| Data | Purpose |
|---|---|
| Contacts, companies, deals, tickets (read-only) | Assess record completeness, ownership, and staleness for the CRM Cleanliness score |
| Deal pipelines and deal properties | Assess pipeline hygiene (missing close dates, missing amounts) for the Process Health score |
| Workflows/automations | Assess adoption and documentation for the Process Health score |
| Lists and forms | Assess feature adoption |
| Account users (via Settings API) | Assess seat activity and role assignment for the User Activity score |

We do not access marketing email content, website content, or any object types beyond those listed above.

## 2. How we process your data

The App aggregates the data above into anonymized, numeric statistics (counts, percentages, and score values — for example, "23 of 47 contacts are missing an email address"). These aggregated statistics, and only these statistics, are sent to a third-party AI provider (Azure OpenAI or OpenAI, depending on configuration) to generate the plain-language executive summary and recommendations in your report.

**We do not send raw personal data** — such as individual contact names, email addresses, phone numbers, or ticket contents — to the AI provider. Only aggregated counts and scores are included in what's sent for analysis.

## 3. Data storage and retention

- **Access tokens**: Your HubSpot OAuth access and refresh tokens are stored encrypted and used solely to authenticate API requests to your portal on your behalf.
- **Audit reports**: The scores and summary generated for your portal are stored so they can be displayed to you inside HubSpot between audits.
- **Retention**: We retain the above only for as long as the App remains installed on your portal. When you uninstall the App, HubSpot notifies us automatically, and we immediately and permanently delete your stored access tokens and audit report data. Nothing is retained after uninstallation.

## 4. Data sharing

We do not sell your data. We share data only with:
- **HubSpot**, as the platform through which the App operates.
- **Our AI processing subprocessor** (Azure OpenAI or OpenAI), limited to the aggregated statistics described in Section 2, solely for generating your report.

We do not share your data with any other third party.

## 5. Security

Access tokens are stored encrypted at rest. Access to production systems is restricted to personnel who need it to operate the service.

## 6. Your choices

You can revoke the App's access at any time by uninstalling it from **Settings → Integrations → Connected Apps** in your HubSpot account, which triggers immediate deletion of your stored data as described in Section 3.

## 7. Changes to this policy

We may update this Privacy Policy from time to time. Material changes will be reflected in the "Last updated" date above.

## 8. Contact

Questions about this policy or your data? Contact us at **mayankattri@vonazon.com**.
