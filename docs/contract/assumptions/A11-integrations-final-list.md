# Annex 3 #11 — Final integration list for Layer 3

- **Status:** `DRAFT — pending Sigma confirmation`
- **Contract reference:** Annex 3 item #11 (line 1007)
- **Lock window:** at the start of Layer 3 Cycle 7

## 1. The assumption (verbatim)

> *Final integration list for Layer 3 is locked, in writing, at the start of Layer 3 Cycle 7.*

## 2. Locked integration list

### Inbound (Sigma receives data)

| Integration               | Direction | Status                | Source code |
| ------------------------- | --------- | --------------------- | ----------- |
| Primavera P6 XER          | upload    | ✅ live (Cycle 1)     | `backend/src/modules/ingestion/parsers/p6-xer.parser.ts` |
| Primavera P6 PMXML        | upload    | ✅ live (Cycle 1)     | `backend/src/modules/ingestion/parsers/p6-xml.parser.ts` |
| Primavera P6 webhook push | webhook   | ✅ live (Cycle 8)     | `backend/src/modules/integrations/p6/p6-webhook.controller.ts` |
| Excel (.xlsx)             | upload    | ✅ live (Cycle 1)     | `backend/src/modules/ingestion/parsers/excel.parser.ts` |
| CSV                       | upload    | ✅ live (Cycle 1)     | `backend/src/modules/ingestion/parsers/csv.parser.ts` |
| Microsoft Project XML     | upload    | ✅ live (Cycle 8 P5)  | `backend/src/modules/ingestion/parsers/msproject-xml.parser.ts` |

### Outbound (Sigma sends notifications)

| Integration               | Status                                       | Source code |
| ------------------------- | -------------------------------------------- | ----------- |
| Email (SMTP)              | ✅ live (Cycle 8 P5)                          | `backend/src/modules/integrations/email/email.service.ts` |
| Slack incoming webhook    | ✅ live (Cycle 8) — active when URL configured | `backend/src/modules/notifications/notifications.service.ts` |
| Microsoft Teams webhook   | ✅ live (Cycle 8) — active when URL configured | `backend/src/modules/notifications/notifications.service.ts` |

## 3. Explicitly excluded (Re-scope Triggers per Annex 2)

- Any additional inbound source format (Asta · Smartsheet · etc.).
- Any additional outbound channel (SMS · WhatsApp · pager · etc.).
- Real-time / streaming ingestion — default is batch.
- Multi-tenant integration brokers.
- Bi-directional sync with P6 / MS Project (Sigma's data does **not** flow back to upstream tools).

## 4. Operational requirements

| Channel    | Required at Cycle 7 start                                |
| ---------- | -------------------------------------------------------- |
| SMTP email | `EMAIL_SMTP_URL` (e.g., Hostinger SMTP or Mailtrap)      |
| Slack      | `SLACK_WEBHOOK_URL` from Sigma's Slack workspace         |
| Teams      | `TEAMS_WEBHOOK_URL` from Sigma's Teams channel           |

When a URL is not configured, the corresponding channel falls back to structured log only (per the existing `notifications.service.ts` pattern) — the platform remains operational with reduced notification reach.

## 5. Confirmation signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      |           |
