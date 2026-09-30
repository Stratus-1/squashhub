# Help Center: safe live pilot (4 open cases) + read-only case-context API

## What the review found (code and functions only, no ticket data)

- Every support ticket create, status change, new message or delete adds a queue row and immediately calls the feed (`help_center_outbox_wake` fires an instant `net.http_post`, whether or not the 5-minute retry job is paused).
- The feed claims **every** due, undelivered row in id order (`help_center_outbox_claim`). No hold, pilot or scope filter exists.
- So today, one staff reply on any ticket would wake the feed and drain the 22 resolved-ticket rows along with it. The HMAC key now exists, so they would really be sent.
- When the queue looks empty, `help_center_outbox_disarm` runs `cron.unschedule` on the retry job. That **deletes** the paused job (jobid 930) instead of leaving it paused.
- Rows can't be deleted, and a delivered mark can't be undone (guard trigger). Nothing has a "held" state, so "don't send yet" needs a new column.
- `help_center_initial_sync` skips any open ticket that already has a queue row, even a failed one. It can't be the only way to get the 4 open cases in.
- Failed rows back off from 30s up to 1h and are marked dead after 12 attempts. The backlog would go dead on its own if it kept being retried, which is another reason to hold it.

## Part A: Live pilot for the 4 open cases

### Goal
Send only the 4 currently open cases. Keep the 22 resolved-ticket rows as they are: not delivered, not dead, not deleted, not sent.

### Changes (one additive migration + one publisher edit)

1. **Hold column on the queue** (new migration `supabase/migrations/<ts>_help_center_pilot_gate.sql`)
   - Add `held_at timestamptz NULL` and `hold_reason text NULL` to `help_center_ticket_outbox`.
   - Update the guard trigger so `held_at` can only be set or cleared on undelivered rows. All payload columns stay immutable.
   - Change the pending index and `help_center_outbox_claim` to add `AND held_at IS NULL`.
2. **Feed mode setting** (service-role-only row in `help_center_feed_private`, key `delivery_mode`)
   - Values: `paused` (default, claim returns nothing), `pilot` (claim only returns rows whose ticket_id is on the allowlist), `live`.
   - New table `help_center_pilot_allowlist(ticket_id uuid primary key, added_at, added_by text)`. Only `service_role` can access it (GRANT to service_role, REVOKE from anon/authenticated, RLS on, no policies).
   - The claim filter reads the mode and the allowlist, so nothing outside the pilot can drain by accident, whatever triggers a wake.
3. **Backlog hold, run once** (`help_center_hold_backlog()`, SECURITY DEFINER, service_role only)
   - Sets `held_at = now()`, `hold_reason = 'pre_pilot_backlog'` on every row where delivered_at, dead_at and held_at are all null and the ticket's current status is resolved or closed.
   - Doesn't touch attempts, delivered, dead or payload. Returns only an aggregate count.
   - Running it again changes nothing.
4. **Pilot enqueue** (`help_center_pilot_enqueue()`, SECURITY DEFINER, service_role only)
   - Takes the tickets that are open/pending/waiting/in_progress now and adds them to the allowlist (duplicates ignored).
   - For each, takes the same per-ticket advisory lock as `help_center_enqueue`. It adds one `case.created` row only if the ticket has no undelivered, unheld row, so it also covers open tickets whose earlier rows failed.
   - Existing failed rows for those tickets are released instead of duplicated. The receiver's idempotency key is `event_id`.
   - Returns only `{allowlisted, enqueued}` counts. No ticket IDs, subject, body, requester or club data.
5. **Stop disarm from deleting the paused job**
   - Change `help_center_outbox_disarm` to `cron.alter_job(active := false)` on the job selected by name, and to count only unheld rows.
   - Change `help_center_outbox_wake` so it never re-creates or re-activates the job while mode is `paused`.
6. **Publisher** (`supabase/functions/help-center-ticket-feed/index.ts`)
   - No change to the payload or signing contract.
   - Log the mode in the fail-closed/summary line. Return `{delivered, failed, mode}`.
   - Handle a `409` from the receiver as delivered (already in place).

### Pilot run order (each step needs your go-ahead)

```text
1 apply migration (mode=paused)  -> nothing can send
2 help_center_hold_backlog()     -> expect count 22
3 help_center_pilot_enqueue()    -> expect allowlisted 4
4 GCP side registers the matching HMAC key (owner action)
5 set mode=pilot, then one manual wake
6 verify 4 delivered, 22 still held, 0 dead
7 keep pilot until owner decides backlog policy
```

### What happens to the backlog afterwards (owner decision, not in this change)
- Option 1: release it (clear `held_at`) under `live` so resolved cases send their last status.
- Option 2: keep it held for good as `pre_pilot_backlog`, as an audit record.
- Either way nothing gets deleted or falsely marked delivered.

### Checks
- Tests run in rolled-back transactions against copies of structure only (no ticket rows are read):
  - claim returns nothing in `paused`, only allowlisted rows in `pilot`, and never returns held rows
  - hold and enqueue are idempotent when run twice
  - the guard still blocks changes to payload, delivered and delete
  - disarm leaves jobid 930 existing but inactive
- Aggregate-only queries before and after each step: counts by delivered, dead, held and pending. No IDs or content.
- Publisher logs contain only event_id, ok and the error code.

## Part B: Read-only case-context API (proposal, for a later build)

**Purpose:** a future central human or agent reader can fetch a limited, redacted view of one case it is allowed to see. SquashHub stays the source of truth, and the API never writes.

- **New function** `supabase/functions/help-center-case-context/index.ts`, set to `verify_jwt=false` in `config.toml`. Auth is enforced in the function's own code.
- **Separate credential:** its own HMAC key `HELP_CENTER_READER_HMAC_KEY` and key ID `HELP_CENTER_READER_KEY_ID`.
  - It must differ from the publisher key, the service role and the dispatch secret, and fails closed if not.
  - Requests are signed over method, path, timestamp and body hash. Requests older than 5 minutes are rejected, and nonces are single-use.
- **Per-case grant:** new table `help_center_case_grants(ticket_id, reader_principal, scope, expires_at, granted_by, revoked_at)`.
  - The reader must send its principal and a ticket ID that has a live, unexpired grant. Anything else returns the same 404.
  - Grants are created only by a SquashHub super admin RPC and are audited. No wildcard or bulk access.
- **Default output, bounded and redacted:**
  - Included: status, category, timestamps, message count, and the last N (max 20) staff/member message texts, each cut to 2,000 characters.
  - Emails, phone numbers, SA ID numbers, card and bank numbers are masked by a shared redactor.
  - Never included: requester name or ID, club details, attachments, AI context. Any later scope that adds one of these needs your approval and a separate `scope` value.
- **Audit:** append-only `help_center_case_access_log` records reader, ticket, scope, outcome, byte count and time. It has no content and is service-role only.
- **No writes:** the function uses a read-only SECURITY DEFINER RPC `help_center_case_context(p_ticket, p_principal, p_scope)`. Nothing is inserted except the audit row.
- **Retry:** GET requests are safe to repeat. Rate limiting is per principal only if you ask for it.

## Owner decisions needed before building
1. Backlog policy after the pilot (release vs keep held).
2. Case-context scope and retention: how long grants and audit rows are kept (proposed: grants 30 days, audit 12 months), and whether message text is allowed at all or only metadata.
3. Who registers the HMAC key on GCP, and when to switch to `pilot`.

## Technical details
- Files: new migration `supabase/migrations/<ts>_help_center_pilot_gate.sql`; edit `supabase/functions/help-center-ticket-feed/index.ts` (mode in logs only); a later separate migration and function for Part B; add `supabase/config.toml` entry for Part B; add AGENTS rule and an issue-log entry in `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md`.
- Cron job 930 stays paused throughout. Secrets are unchanged by Part A.
- Nothing is published. The function redeploy happens only after you approve.
