# Help Center secrets: read-only findings and update path

Nothing was changed while checking this. No files, functions, database rows, secrets or tickets were touched.

## 1. Current configuration
- Both approved secrets already exist in the project's secret store: `HELP_CENTER_KEY_ID` and `HELP_CENTER_HMAC_KEY`. Values are hidden; I did not read or check their contents.
- The other Help Center secrets also exist (ingress URL, tenant scope, redaction policy, IAP and read audiences, caller service account, operator emails). This plan does not touch them.

## 2. Can Lovable update them securely?
Yes. Lovable can open its secure secret form for an existing secret name. The user types or pastes the value directly into that form. The value goes straight into the encrypted secret store and never appears in chat, logs, code, files or the agent's view. The agent only sees confirmation that it was saved.
- Only `HELP_CENTER_KEY_ID` and `HELP_CENTER_HMAC_KEY` would be offered, one form each.
- `HELP_CENTER_KEY_ID`: enter exactly `squashhub-connector-v1`. This is a fixed, non-secret identifier, but it still goes through the same form.
- `HELP_CENTER_HMAC_KEY`: the user pastes the existing value mapped in GCP. Lovable cannot fetch it from GCP and must not generate a new one, because the gateway must hold the same value.
- Lovable cannot confirm afterwards that the stored value matches GCP without revealing it. The only safe check is a signed delivery the ingress accepts. That needs a separate, explicit approval because it sends data, and delivery is currently paused or pilot-gated.

Equivalent manual workflow, if preferred: Project Settings → Secrets → find each of the two names → Update → paste the value → Save. No redeploy is needed. Functions read secrets at request time.

## 3. Publisher source at the latest commit (b2c0699c3, 2026-10-20)
`help-center-ticket-feed` still uses the exact approved names and contract:
- It reads `HELP_CENTER_KEY_ID` (trimmed, must match `^[A-Za-z0-9._:-]{1,128}$`, which `squashhub-connector-v1` does) and `HELP_CENTER_HMAC_KEY` (trimmed, at least 32 characters, must not equal the service-role or agent admin key).
- Ingress is pinned to `https://stratus-support-ingress-9essk3i1.uc.gateway.dev/v1/support/tickets`. If `HELP_CENTER_INGRESS_URL` differs, it fails closed.
- Signing: HMAC-SHA256 over `POST\n/v1/support/tickets\n<unix ts>\n<sha256(body)>`.
- Headers: `X-Connector-Key-Id`, `X-Connector-Timestamp`, `X-Connector-Signature: sha256=<hex>`, `Idempotency-Key` = event id. Redirects are refused and requests time out after 10 seconds.
- Payload: contract version `1.0`, redaction policy `squashhub-ticket-metadata-v1`, fixed category `product_help` and priority `normal`, with static redacted title and summary. Only ticket UUID, status, revision and timestamps are exported.
- It fails closed if tenant scope, redaction policy, URL, key ID or HMAC key is wrong, and it does nothing while delivery mode is `paused`.

## Proposed next step (only after approval)
Open the secure update form for `HELP_CENTER_KEY_ID`, then for `HELP_CENTER_HMAC_KEY`. Nothing else: no deploy, no delivery-mode change, no test send.
