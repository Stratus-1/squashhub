# Help Center publisher — read-only integration check

Scope: verification only. No code, data, delivery mode, schedule, migration or secret changes. No secret values are printed. Key ID `squashhub-connector-v1` only. The acceptance event is NOT run.

## Already confirmed (read before this plan)

- Source contract (current project source):
  - POST, signed path `/v1/support/tickets`, fixed approved ingress URL check.
  - Headers `X-Connector-Key-Id`, `X-Connector-Timestamp`, `X-Connector-Signature: sha256=<hex>`, plus `Idempotency-Key`.
  - Canonical string `POST\n/v1/support/tickets\n<ts>\n<sha256(body)>`, HMAC-SHA256.
  - Payload is metadata only: opaque ticket UUID, status, revision, timestamps, tenant scope, fixed category/priority, static redacted title/summary, redaction policy `squashhub-ticket-metadata-v1`.
  - Fails closed (503 `not_configured`) if key ID, HMAC key (min 32 chars, not equal to service/agent keys), ingress URL, tenant scope or redaction policy are wrong.
- Secret names present: `HELP_CENTER_KEY_ID`, `HELP_CENTER_HMAC_KEY`, `HELP_CENTER_INGRESS_URL`, `HELP_CENTER_TENANT_SCOPE`, `HELP_CENTER_REDACTION_POLICY`, `HELP_CENTER_IAP_AUDIENCE`, `HELP_CENTER_READ_AUDIENCE`, `HELP_CENTER_CALLER_SERVICE_ACCOUNT`, `HELP_CENTER_OPERATOR_EMAILS`.
- Deployment: redeployed today 07:24 UTC, submitted source SHA-256 `e8f69688…8bd54626`, from project commit `1d6253b6`; last commit touching the function `01930124` (2026-10-12).
- Runtime state: delivery mode `pilot`; allowlist 8 tickets; 89 held events (21 allowlisted), 0 claimable, 0 delivered, 0 dead; retry job present and inactive.
- Last live attempt (07:28 UTC): Gateway answered HTTP 401; event re-held as `operator_hold_20261020_hmac_mismatch`.

## Checks to run (read-only)

1. Recompute the function bundle fingerprint locally (index.ts + delivery-result.js + config) and compare with the 07:24 submitted SHA; confirm no source changes since. Run the existing `delivery-result.test.mjs` (local only).
2. Confirm deployment identity via deployment metadata/logs only (no invocation): latest boot after 07:24 and version matching the submitted SHA. If the platform cannot expose a live-version hash, report "deployment identified by submission SHA only".
3. Names-only secret listing again; confirm none of the forbidden key ID `squashhub-support-v1` appears in source/docs config (grep, no values).
4. Read-only DB check that the gate still enforces pilot inside `help_center_outbox_wake` and `help_center_outbox_claim`, and that exactly 0 rows are claimable.

## Blockers (current)

- Gateway rejected the signature (401). The stored `HELP_CENTER_HMAC_KEY` (and possibly `HELP_CENTER_KEY_ID`) cannot be verified against the GCP Secret Manager value for `squashhub-connector-v1` from here — values are not readable.
- No secure-form tool is available to me to replace an existing secret; only the owner can update it in Project Settings → Secrets.

## Safety answer for item (4)

A single allowlisted metadata-only acceptance is safe to run while pilot (gate + allowlist + one released row + inactive retry job), but it will fail with 401 until the key is corrected. Do not run it before that.

## Exact next safe action

1. Owner: in Project Settings → Secrets, confirm `HELP_CENTER_KEY_ID` = `squashhub-connector-v1` and paste the exact GCP Secret Manager value for that key ID into `HELP_CENTER_HMAC_KEY`.
2. Then (on request): redeploy only `help-center-ticket-feed`, release the one held allowlisted row, invoke the dispatch path once, report aggregate counts and Gateway classification, and re-hold on any failure.
