# Help Center ticket feed: 401 findings (read-only)

## Names checked
- Function: `help-center-ticket-feed`. It signs requests with `X-Connector-Key-Id`, `X-Connector-Timestamp` and `X-Connector-Signature` (HMAC-SHA256 over method, path, timestamp and body hash), plus `Idempotency-Key = event_id`.
- Secrets that exist (names only): `HELP_CENTER_HMAC_KEY`, `HELP_CENTER_KEY_ID`, `HELP_CENTER_INGRESS_URL`, `HELP_CENTER_TENANT_SCOPE`, `HELP_CENTER_REDACTION_POLICY`, plus the caller and audience names.
- I couldn't read version metadata or the delivery mode. The mode function is restricted to the service role, and secret versions aren't exposed.

## Outbox counts
| State | Count | Last error |
|---|---|---|
| Delivered | 1 (11 attempts) | none |
| Held: single-event retry | 3 | http_401, no reason code |
| Held: after single retry | 1 | timeout |
| Held: pilot test | 11 | http_404 |
| Held: pre-pilot backlog | 22 | http_404 |
| Held: pilot test, never tried | 51 | none |
| Pending, not held | 44 | none |
| Dead | 0 | none |

## Conclusion
- **The 401 fits a key ID or secret-version mismatch.** The publisher only sends after its settings check passes, so all five settings were present and the key ID was well formed. The receiver rejected the signature itself and gave no reason code. These replies cannot tell a wrong key ID from a wrong secret version. Clock skew in the timestamp window is the only other possible cause.
- **The accepted event can be matched internally.** The delivered row has an `event_id`, which was sent as the `Idempotency-Key`, and a `correlation_id`. The receiver can match its receipt against either one. No receipt ID from the receiver is stored on our side.
- **Next step, owner only:** in the Help Center receiver's key registry, issue one new key ID and secret pair. Save both, together, in Project Settings → Secrets as `HELP_CENTER_KEY_ID` and `HELP_CENTER_HMAC_KEY`. Then, as a separately approved step, retry one held event.

Nothing was changed, retried or deployed.
