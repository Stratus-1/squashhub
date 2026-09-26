# AI Maintenance Manager — Phase 2 plan (direct agent connection)

This is a planning document only. Phase 2 stays switched off until it is approved and a pilot is signed off. The plan never publishes or deploys to production on its own.

## 1. Starting point (Phase 1, as built)

- **`maintenance_cases`** is the authoritative case record. It has:
  - statuses: new, analysing, needs_info, issue_identified, fix_in_progress, awaiting_approval, approved, ready_for_release, released, completed, unable_to_resolve, rejected;
  - risk and sensitive areas, plus a `requires_approval` flag;
  - `last_actor_type`: system, assistant, agent or super_admin.
- **Status guard:** a database trigger allows only permitted status changes. It refuses `approved`, `released` and `completed` when the last actor is automated.
- **Supporting tables:**
  - `maintenance_case_requesters`: everyone who reported the case, from fingerprint de-duplication.
  - `maintenance_analyses`: investigation write-ups.
  - `maintenance_events`: the case history, mirrored to `audit_events`.
- **`maintenance_actions`** holds proposed work:
  - kind: lovable_instruction, data_fix, config or member_reply;
  - target: lovable, github or manual;
  - `external_ref`, `auto_allowed`;
  - state: draft, queued, in_progress, result_received, awaiting_approval, approved, rejected, done.
- **The `maintenance-queue` function** is Super Admin only. It handles these operations: submit_analysis, set_status, propose_action, record_result, decide_action, ask_member.
- **The shared policy module** decides risk, redaction (`redactPii`), `policyFor` and `canTransition`.
- **AI Assistance** (`ai-help`) triages every outcome. Questions and safe actions never create cases.

## 2. Two agent channels (verified facts vs assumptions)

| Channel | Status | Role in Phase 2 |
|---|---|---|
| A. The authorised external maintenance agent (the ChatGPT or Lovable agent that can already instruct this project through Lovable's supported agent interface) | Confirmed by Willem | The only thing that sends development instructions to Lovable |
| B. The SquashHub backend calling a Lovable API directly | Not verified. The codebase has no credential, endpoint or SDK for it | Not used. May be explored later as an optional add-on, only after it is confirmed to exist |

So SquashHub never talks to Lovable itself. SquashHub **notifies and serves** the external agent, and the agent instructs Lovable.

## 3. Trigger and orchestration

```text
case becomes eligible ─► outbox row (maintenance_dispatches) ─► signed webhook to agent
            ▲                                                          │
            └──── scheduled sweep retries undelivered/expired ◄────────┘
agent ─► pulls redacted case packet ─► claims lease ─► works ─► posts results
```

- **Eligibility:** kind = bug, status new or analysing, dispatch enabled, and the case type is on the pilot allowlist. Tier A items never arrive here (see section 4).
- **Outbox table `maintenance_dispatches`**:
  - fields: case_id, attempt, idempotency_key = case_id + analysis version, state (pending, delivered, claimed, expired, failed, dead), lease_expires_at, last_error;
  - only one active dispatch per case, enforced by a partial unique index.
- **Wake-up:** a database trigger on the case enqueues a row. pg_net sends the webhook, which the project already uses for email and push. The webhook carries only the case id and a nonce, never case content.
- **Fallback sweep:** runs every 5 minutes. It re-sends pending or expired rows with exponential backoff (1, 5, 15, 60 minutes). After 5 attempts the row becomes `dead` and the case is flagged "Agent unreachable". If the agent cannot take webhooks, it can instead poll `agent/next`, which uses the same lease rules.
- **Lease:** the agent calls `claim`, which grants a 30-minute lease renewable by heartbeat. An expired lease returns the case to the queue. A second claim is refused, so the same case is never worked twice.

## 4. Investigation vs execution (final rule)

INVESTIGATE / DIAGNOSE / PREPARE / TEST may proceed automatically under safeguards at every risk level, including sensitive cases (redacted packet, code inspection, non-production code changes, tests/build). EXECUTE SENSITIVE LIVE CHANGE / PUBLISH / RELEASE always requires the appropriate approval: live/destructive data, payments/billing, rankings, results/structures, member merge/deletion, roles/security, organisation hierarchy, production schema/migrations, production secrets/config, cross-organisation history, publish/deploy/release, or anything beyond requester authority. Encoded as `execution_class` (investigate/prepare/test vs execute_live/release).

## 4b. Autonomy tiers (enforced on the server, never by the agent)

| Tier | Which cases | What happens |
|---|---|---|
| A | Question, or a fix one of AI Assistance's existing safe actions can make | Handled by AI Assistance under the requester's own permissions. No case is created. Unchanged from Phase 1 |
| B | Low risk, no sensitive areas, allowlisted case type | The agent may investigate, instruct Lovable, change code and run tests automatically. The case stops at ready_for_release. No autonomous publish |
| C | Medium or high risk, or any sensitive area — investigation, preparation and testing still run automatically; approval only gates live change/release (payments, merges/deletions, rankings, results/structures, permissions/roles, organisation hierarchy, schema/migrations, destructive work, anything affecting several organisations or history) | The agent may investigate and draft. Before any Lovable instruction the action waits in awaiting_approval, and it always needs approval again before release |
| D | Needs more authority than the requester has | Sent to the right admin level (club, association, federation, or Super Admin), using existing role checks. The agent cannot raise anyone's permissions |

Tier C also covers any Lovable instruction whose text mentions migrations, RLS, edge-function secrets or payments. `detectSensitiveAreas` catches these again when the instruction is submitted.

## 5. Direct Lovable handoff and correlation

1. The agent submits a `lovable_instruction` action through `agent/propose_action`. The server then:
   - recomputes risk and applies the section 4 tier rules;
   - stores the exact instruction text;
   - stamps a correlation tag `[SH-MC:<case-short-id>:<action-id>]` that must appear in the Lovable message.
2. If the action is allowed, the agent sends the instruction through the external channel (channel A). It then calls `agent/handoff` with:
   - the Lovable message/job reference, stored in `external_ref`;
   - the time it was sent;
   - a SHA-256 hash of the text actually sent, which must match the stored instruction.
3. The agent watches the Lovable session and reports progress through `agent/progress`: working, tests_passed, tests_failed, needs_input, done. When finished it posts `agent/result` with:
   - a summary;
   - the files or areas changed and the commit SHA, if available;
   - test counts;
   - whether the build succeeded.
4. The standard instruction template tells Lovable to:
   - keep the correlation tag;
   - not publish;
   - run the relevant tests;
   - append an entry to the issue log;
   - report the changed files.

## 6. End-to-end flow

```text
report ─► ai-help triage ─► (A: resolve) | bug ─► case(new) ─► dispatch ─► agent claims (analysing)
 ─► reproduce/analyse ─► needs_info? ask_member via existing support thread
 ─► issue_identified ─► tier B: instruction sent | tier C: awaiting_approval ─► Willem approves
 ─► fix_in_progress (Sent to Lovable / Lovable working) ─► tests pass ─► ready_for_release
 ─► Willem publishes manually ─► marks released ─► requesters notified ─► completed after 7 quiet days
```

## 7. Super Admin experience

The case status stays as it is. A separate `agent_stage` field is shown on the maintenance screen: Queued for agent, Agent investigating, Sent to Lovable, Lovable working, Tests passed, Tests failed, Ready for review, Approved, Released, Unable to resolve, Agent unreachable.

- **"Needs you"** contains only cases waiting on Willem:
  - tier C approvals;
  - ready for review or release;
  - dead dispatches;
  - repeated failed tests;
  - a regression reopened on a released case;
  - a tier D escalation with no one else able to act.
- Everything else sits in an "Agent working" view, with no notifications.
- A live stream of events for each case (realtime subscription on `maintenance_events`).
- A settings card with the kill switch, the pilot allowlist, daily limits and credential rotation.

## 8. Security

- **Agent credential:** a dedicated `MAINTENANCE_AGENT_SECRET` created with the secret generator. It is used only for HMAC-SHA256 request signing. It is never a user login and never the service-role key.
- **Signed requests both ways:**
  - Outbound webhooks are signed with a separate `MAINTENANCE_WEBHOOK_SECRET`. The agent enters this shared secret itself.
  - Inbound calls to the new `maintenance-agent` function carry a timestamp, a nonce and a signature header.
  - A request older than 5 minutes, or a reused nonce, is rejected. Nonces are kept 24 hours in `maintenance_agent_nonces`.
- **Rotation:** two active keys are accepted during rotation (`_NEXT`). A rotation runbook lives in the settings card, and every rotation is written to the audit log.
- **Least privilege:** the agent function can only:
  - read redacted packets for claimed cases;
  - write analyses, events, progress, actions and results;
  - move a case into its allowed automated statuses.

  It can never approve, release, complete, touch member or financial tables, or run SQL. The Phase 1 database guard stays in force.
- **Rate limits:** at most 20 dispatches a day, 3 active cases and 10 Lovable instructions a day. Hitting a limit pauses dispatch and flags it to Willem.
- **Redaction and prompt injection:** every packet is built on the server with `redactPii`. Member text, screenshots and attachments go in a clearly separated `untrusted_member_content` block, and the agent contract says it is data only. Screenshots are shared as short-lived signed links, never embedded. Instructions the agent submits are rejected if they copy member text word for word beyond a set limit, or contain known injection patterns.

## 9. Audit (what can be reconstructed)

Each item comes from one of these sources:
- **Reporters and their permissions/scope when reporting:** `maintenance_case_requesters`, plus a new snapshot column holding role, club and organisation scope.
- **Classification and risk history:** `maintenance_analyses`.
- **The exact packet sent to the agent:** stored hashed, plus a redacted copy in `maintenance_dispatches.packet`.
- **The agent's analysis:** `maintenance_analyses`.
- **The exact Lovable instruction and its sent hash, plus the Lovable reference, commit SHA, changed files and tests:** `maintenance_actions` and `technical_result`.
- **Approvals and rejections, with who and when:** `maintenance_actions`.
- **Release and member notification:** `maintenance_events`.

Secrets and signatures are never stored or logged.

## 10. GitHub's role

- The existing Lovable ↔ GitHub sync already provides commit history, diffs and rollback. We reuse it and record the commit SHA on the case.
- No GitHub issue is created per report. GitHub pull requests are optional and used only if Willem wants review of tier C code later.
- To roll back a code change, revert it in Lovable History or GitHub. The case records the SHA it reverted to.

## 11. Member feedback

- **More information needed:** the agent calls the existing `ask_member` operation, which uses the original support thread or AI Assistance thread. The case moves to needs_info and resumes when the member replies.
- **Released:** every linked requester gets a plain message in My Requests and support, for example "This has been fixed — thanks for reporting it." It contains no technical or security detail. This reuses the existing notice path.

## 12. Failures and rollback

| Failure | Handling |
|---|---|
| Agent unavailable | Backoff retries, then `dead` and flagged "Agent unreachable". The case stays open |
| Lovable unavailable or instruction timed out (no progress for 60 minutes) | Action becomes failed. The agent may retry once, then the case is flagged |
| Tests fail | The action records failed tests. The agent may send one follow-up fix attempt; after two failures the case is flagged |
| Duplicate cases | Fingerprint de-duplication plus one active dispatch per case. Late duplicates only add requesters |
| Partly finished work | The case stays at fix_in_progress with a partial result. Never ready for release without passing tests |
| Review rejected | Moves to issue_identified with the reason. A new instruction needs a fresh approval |
| Regression after release | A matching new report reopens the case (existing trigger). A revert option points to the recorded SHA |

## 13. Pilot and safe activation

1. **Stage 0 (dark):** everything is deployed with dispatch off. Kill switch `app_settings.maintenance_agent_dispatch = off`, which does not affect AI Assistance.
2. **Stage 1 (shadow):** the agent receives cases and investigates only. Lovable instructions are drafts; Willem reviews quality for 2 weeks.
3. **Stage 2 (pilot):** tier B is allowed only for allowlisted types, such as display bugs and copy or layout faults. The daily limits above apply.
4. **Stage 3:** widen the allowlist based on measured outcomes. Autonomous publishing stays out of scope for Phase 2.

## 14. Tests required before activation

- Permission inheritance: tier D routing to the correct level; an agent can never trigger higher permissions.
- Forged signature, expired timestamp, replayed nonce, and a rotated key during overlap.
- Duplicate webhook delivery; two agents claiming at once; an expired lease re-queued.
- Prompt injection in member text, screenshots or attachments stays in the untrusted block and cannot change instructions.
- Redaction of phone numbers, emails, ID numbers and tokens in packets.
- Agent timeout, Lovable timeout, failed tests, partial results, rejected review.
- Approval gates: tier C cannot be sent before approval; the agent cannot set approved, released or completed.
- Kill switch: stops dispatch while AI Assistance keeps working (existing tests stay green).
- The instruction hash must match the stored text, and the correlation tag must be present.

## Technical summary of changes (for implementation later)

- **One additive migration:**
  - new tables: `maintenance_dispatches`, `maintenance_agent_nonces`;
  - new columns: `maintenance_cases.agent_stage` and `maintenance_case_requesters.scope_snapshot`;
  - on `maintenance_actions`: `sent_hash`, `sent_at`, `correlation_tag`, `commit_sha`, `tests jsonb`;
  - an enqueue trigger, the sweep cron job, and the kill-switch setting.

  Existing statuses are unchanged; the database guard is extended so the agent cannot approve.
- **New edge function `maintenance-agent`**, signature-authenticated, with endpoints: next, claim, heartbeat, packet, analysis, ask_member, propose_action, handoff, progress, result, release_notice_ready.
- **`maintenance-queue`:** adds dispatch control, the allowlist, limits and rotation for Super Admin.
- **Shared policy module:** gains the tier function, the instruction guard and packet builder (mirrored to the frontend copy).
- **`MaintenancePanel`:** agent stages, live timeline and settings card.
- **`ai-help`:** unchanged apart from the existing triage.
