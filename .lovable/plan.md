# AI Maintenance Manager — Phase 1 (investigation report + proposed build)

Nothing in this plan changes existing AI Assistance behaviour. Approving it starts the Phase 1 build only; no external service is connected.

## A. What exists today
- **Requests:** `ai_assist_interactions` holds each assistant turn: original `request_text`, attachments, page context, role, `interpretation`, proposed action + preview, a status (`answered`, `proposed`, `executed`, `cancelled`, `escalated`, `bug_reported`, `failed`, `rolled_back`, …), before/after data, `ticket_id`, `bug_report_id`, `conversation_id`. About 46 rows today.
- **Bugs:** `ai_bug_reports` stores structured bugs (feature, expected vs actual behaviour, evidence, reproduction, severity, suspected/verified). It de-duplicates by fingerprint, counts repeats, reopens regressions, and tracks a lifecycle (`open` → `investigating` → `fix_in_development` → `fix_ready` → `published` → `fixed`). Only Super Admin can read or update it.
- **Support tickets:** `support_threads` / `support_messages` open automatically when the assistant escalates.
- **Backend:** the `ai-help` function (ask / propose / confirm / rollback loop, action catalogue, bug recording, repairs). The `club_beta_features('ai_actions')` flag controls who gets it.
- **Super Admin UI:** the "AI Activity" panel inside `/admin/support` (`AiActivityPanel`), with interaction detail, the linked bug and rollback.
- **Requester UI:** the "My requests" history, whose statuses come from the real bug and ticket lifecycle (`src/lib/ai-requests.ts`).
- **Audit:** `audit_events` (actor, club/org, entity, action, reason, before/after). The service role writes it; admins read entries in their scope.
- **GitHub / Lovable integration:** none is active. The GitHub connector was offered earlier but cancelled. No webhook, API token or outbound Lovable mechanism exists in the project.

## B. Reuse
- Keep `ai_assist_interactions` as the untouched record of what the member said. It is never edited by the maintenance flow.
- Reuse `ai_bug_reports` de-duplication, so many reports become one maintenance case.
- Reuse `audit_events` for the cross-system trail, the support tickets for member communication, the `has_role(...,'admin')` Super Admin check, and the `/admin/support` page as the home for the new tab.

## C. Phase 1 architecture
```text
Member -> ai-help (unchanged) -> ai_assist_interactions / ai_bug_reports
                                   | (DB trigger, append-only link)
                                   v
                          maintenance_cases  <-- maintenance_analyses (versioned)
                                   |         <-- maintenance_status_history
                                   |         <-- maintenance_actions (proposed fixes)
                     maintenance-queue function (service role, Phase 2 agent door, disabled)
                                   |
                   Super Admin "Maintenance" tab (review / approve / reject)
```
- A **case** is one underlying problem. It links to one or more interactions and optionally one bug report.
- New interactions with status `escalated`, `bug_reported` or `failed`, and any new bug report, automatically open or attach to a case as **New**. Plain `answered` Q&A does not create cases.
- A one-off backfill creates cases for the existing unresolved rows only. Original rows are not modified.
- There is no auto-deploy path. The furthest any automated actor can move a case is **Ready for Super Admin review**.

## D. Database changes (one migration)
- `maintenance_cases`: `id`, `club_id`, `org_id`, `reporter_user_id`, `reporter_member_id`, `bug_report_id`, `title`, `status`, `risk`, `sensitive_area` (text[]), `requires_approval` (bool, forced true for sensitive areas), `current_analysis_id`, `technical_result` (jsonb), `created_at`, `updated_at`, `closed_at`.
  - Status is limited to: `new`, `analysing`, `needs_info`, `issue_identified`, `fix_requested`, `fix_in_progress`, `ready_for_review`, `approved`, `completed`, `unable_to_resolve`, `rejected`.
- `maintenance_case_interactions`: links cases to interactions (`case_id`, `interaction_id`), unique pair.
- `maintenance_analyses` (append-only, versioned): `summary`, `affected_module`, `probable_cause`, `classification` (bug / misunderstanding / data_issue / configuration / feature_request), `proposed_action`, `risk` (low / medium / high), `code_change_needed`, `db_change_needed`, `more_info_needed`, `info_request`, `actor_type` (system / agent / super_admin), `actor_label`, `created_at`.
- `maintenance_status_history` (append-only): `case_id`, `from_status`, `to_status`, `actor_type`, `actor_user_id`, `actor_label`, `note`, `created_at`. A trigger writes it on every status change.
- `maintenance_actions`: the proposed fix or instruction. Fields: `case_id`, `kind` (lovable_instruction / data_fix / config / reply_to_member), `instruction_text`, `target` (lovable / github / manual), `external_ref` (Phase 2), `state` (draft / sent / in_progress / result_received / approved / rejected), `result_summary`, `approved_by`, `approved_at`, `rejection_reason`.
- Guard trigger:
  - Only Super Admin may move a case to `approved`, `completed` or `rejected`.
  - Non-Super-Admin actors are blocked beyond `ready_for_review`.
  - Allowed transitions follow a fixed state machine.
- Every table gets GRANTs, RLS and `updated_at` triggers, per project rules.

## E. UI changes
- New **Maintenance** tab in `/admin/support`, next to AI Activity. It shows status chips (New | Analysing | Needs info | Fix in progress | Awaiting approval | Completed | Failed) with counts, and filters for club, risk and module.
- **Case detail:**
  - Original query (verbatim, read-only) and linked interactions.
  - Member, club, date and time.
  - Analysis versions and the proposed fix with its risk and sensitive-area badges.
  - Status history timeline and the technical result.
  - Buttons: Add analysis, Request info (reuses the support ticket), Mark ready for review, **Approve** / **Reject with reason**, Close.
- A link from each AI Activity row to its case.
- The member-facing "My requests" screen is unchanged in Phase 1.

## F. Security
- RLS: Super Admin only (`has_role`) for read and update on all maintenance tables. There is no member or club-admin access in Phase 1, so member data is not widened.
- Writes from automation go only through a new `maintenance-queue` function running as service role. It offers `list_new`, `get_case` (redacted), `submit_analysis`, `set_status` and `propose_action`.
  - In Phase 1 it accepts only Super Admin JWTs.
  - Machine credentials are rejected until Phase 2 adds a scoped secret `MAINTENANCE_AGENT_KEY`, which the user adds. It will have allowlisted operations and a rate limit.
- The redacted case view sent to an agent removes ID numbers, DOB, phone and email and replaces them with member IDs and club name. Attachments are shared only as short-lived signed URLs.
- Sensitive areas (payments/billing, rankings, results/structures, memberships, permissions, organisation hierarchy, migrations, member data changes) always set `requires_approval`. Approval is checked server-side.

## G. Audit
- Every transition writes `maintenance_status_history`. Every analysis and action is its own append-only row.
- Key events are mirrored to `audit_events` (`entity_type='maintenance_case'`) with actor, previous/new status and reason: case opened, ready for review, approve, reject, completed.
- The instruction text is stored. Secrets, tokens and raw personal data are never logged.

## H. Preservation
- There are no changes to `ai-help`, its statuses, the action catalogue, the requester screens or the tickets.
- The only additions are an AFTER INSERT/UPDATE trigger that creates links and a read-only backfill.
- `ai_bug_reports.status` keeps driving "My requests". When a case completes, Super Admin can optionally mark the linked bug `published` / `fixed` through the existing flow.

## I. Phase 2 (outline only)
- The authorised maintenance agent calls `maintenance-queue` with its scoped key, analyses cases and drafts a `lovable_instruction` action.
- It sends the instruction to Lovable through Lovable's supported agent/API interface, if and when it is available to this workspace, and stores the reference in `external_ref`. The result and tests come back as `result_received`, and the case moves to `ready_for_review`.
- Publishing stays a manual Super Admin step.
- GitHub is optional per case (`target='github'`). The Lovable-to-GitHub sync still gives source history and rollback without turning each query into an issue.

## J. Risks and concerns
- An official Lovable agent interface for sending external fix instructions is not confirmed for this workspace. Phase 2 depends on it, and I will verify it before building.
- Prompt injection: member text could try to steer the agent. It is treated as data only, and the agent may only propose; approval gates stay.
- Personal data leaving the platform to an external agent: redaction is required, and POPIA applies.
- Case noise: too many cases can be created. De-duplication through the bug fingerprint and the "no plain Q&A" rule limit it.
- Two status systems (bug lifecycle vs case lifecycle) could drift. They are kept linked, and the case is the Super Admin's view.
- "Approved" means approved to publish. The actual publish still happens outside the app.

## Tests (build step)
- State machine tests: no non-Super-Admin move past `ready_for_review`.
- A sensitive area forces approval.
- The trigger links a case without editing the source rows.
- The redaction helper removes personal data.
