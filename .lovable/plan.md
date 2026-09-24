# AI Assistant: Live Tournament Diagnose → Repair (Super Admin Beta)

## Goal
When someone reports a live tournament problem (e.g. "Rachel & Shania appear twice, Maria & Giselle are missing"), the Assistant checks the real tournament and explains the cause. When it has proven a system bug, it fixes the problem immediately with no approval needed. It then re-checks the tournament and escalates only fixes that would change started or scored games.

## How it fits what exists today
- `ai-help` edge function (index/tools/actions/flow) already provides: server-resolved identity/role, read tools, `propose_action` → one-time preview → Confirm, `ai_assist_interactions` audit, AI Activity view, rollback, ticket escalation, idempotent retry, 40s budget.
- Tournament rules already live in `src/lib/tournament-playoffs.ts` (`buildPlayoffMatches`, `buildPlayoffPlaceholders`, `isPlayoffRowLocked`, `buildRegisteredPairMap`, `enforceRegisteredPairs`, `shouldAutoFillPlayoffs`). The diagnosis will reuse this same logic, not a copy of it.
- Data: `club_champs` settings, `club_champs_matches`, `champ_doubles_pairs`, `club_champs_registrations`, `audit_events`, `champ_round_date_audit`.

## 1. One shared integrity engine
New pure module `src/lib/tournaments/integrity.ts`. It runs in the browser and in the edge function, and is mirrored into `supabase/functions/_shared/tournament-integrity/`. A sync test keeps the two copies identical.

`checkTournamentIntegrity(snapshot) → { findings[], expectedPlayoffs, severity }`, with deterministic checks:
- **I1:** No team appears in more than one playoff slot in the same bracket (catches Rachel's duplicate).
- **I2:** Every expected qualifier appears exactly once (catches the missing Maria & Giselle).
- **I3:** The number of playoff slots matches the qualifier setting (`league_playoff_qualifiers` × pools).
- **I4:** Doubles teams in pools and playoffs match the registered pairs exactly; no rotated or rebuilt partners.
- **I5:** Pool standings count only pool (group) games; playoff results are excluded.
- **I6:** Each slot pairs Pool 1 #N with Pool 2 #N (or follows the configured mode).
- **I7:** No extra pool games beyond the configured round-robin count.
- **I8:** No withdrawn or inactive entrants appear in fixtures; the current settings and entrant list are authoritative.
- **I9:** A reserved playoff slot that has a time but no teams is flagged once pool play is complete.
- **I10:** A game that is locked (started or scored) but is wrong is reported as needing manual review, never auto-fixed.

Each finding includes: code, a plain-language message, the rows affected, a suspected cause (from audit history and timestamps, e.g. "rebuilt at 08:40 while pools were unfinished"), and whether it is repairable.

`planRepair(snapshot)`: runs the existing `buildPlayoffMatches` + `enforceRegisteredPairs` against frozen final pool standings. It then compares the result with the current rows. The output is a per-row change list (keep / update pair / fill placeholder / skip-locked). It never deletes a row with a time or any score.

## 2. New assistant tools (ai-help)
**Read tools (automatic, Super Admin beta):**
- `tournament_snapshot(champ_id)`: settings, pools, pairs, all fixtures, recent audit entries. One batched query, capped in size.
- `tournament_integrity_check(champ_id)`: returns findings + live status (`is_live` = today's date, games in progress, or games scored in the last 6 hours).
- `tournament_repair_preview(champ_id)`: the change list from `planRepair`.

**Action (Confirm required):** `repair_tournament_playoffs`
- Classified by risk:
  - **Low:** fill empty placeholders.
  - **Medium:** change the teams in unstarted games.
  - **High:** anything touching a scored or completed game. High-risk changes are never executed by the assistant; they are escalated.
- Execution goes through a new security-definer RPC, `ai_repair_champ_playoffs(champ_id, plan_hash, changes jsonb)`. In one transaction it:
  - re-checks Super Admin;
  - locks the tournament rows;
  - rejects the repair if the tournament changed since the preview (`plan_hash` mismatch);
  - refuses to touch locked rows;
  - applies only the listed pair and slot updates;
  - writes before/after to the audit record.
- After success, the edge function re-runs `tournament_integrity_check` and stores the result on the same record ("Verified consistent" or the list of remaining findings).
- Rollback: the stored before-image is restored by an inverse RPC, only if the affected rows are still unstarted and unscored. Otherwise rollback is refused and the reason is shown.

## 3. Permission model (who approves what)
A clear system bug does not need anyone's approval. If the tournament breaks its own saved settings (duplicate team, missing qualifier, split pair), that is a fault in SquashHub, not a decision anyone has to make.
- **Auto-repair (no approval, anyone can trigger by reporting):** the assistant fixes the problem straight away, whether the report comes from a club admin, a player or Super Admin, when all of these are true:
  - an integrity check proves the inconsistency;
  - the fix comes directly from the tournament's saved settings and finished pool results;
  - only unstarted, unscored games change.
  It then re-checks, tells the reporter "Fixed: Maria & Giselle are now in the 7th/8th playoff", and logs the change in AI Activity so Super Admin can see it and undo it.
- **Club admin approval:** decisions that are a matter of choice rather than a proven bug stay with the club, e.g. replacing a player or moving a game time. The tournament's own club admin confirms them in chat.
- **Super Admin approval (only exception):** anything that would change a game that has started or already has a score, or delete data. These are shown as a preview, and the reporter is told support is handling it.
- **Code defects:** the assistant can repair the data, but it cannot change the app's code. When the same fault keeps coming back, it records it as a system defect with all diagnostics so it can be fixed in the code here. The live tournament stays repaired in the meantime.
- Safety stays on the server: identity and role are never taken from what someone types, the tournament must belong to the reporter's club (Super Admin: any club), and the repair RPC re-checks all of these conditions itself. Beta flag `ai_tournament_repair` limits this to Super Admin, Riverside and Nelspruit.

## 4. Timeout and live priority
- There is a 40s overall budget, and the integrity check is deterministic, so it should take about 1 second and needs no model call.
- Fast path: if the message mentions a tournament or playoffs, or the user is on a tournament screen, the function resolves the current tournament from page context. It runs the integrity check first and gives the result to the model, so the model explains the findings rather than exploring.
- If the reply is not ready within about 20s, the function returns `{ status: "working", interactionId }` straight away. Work continues via `EdgeRuntime.waitUntil`, and the result is written to `ai_assist_interactions`. The panel polls the record every 2s, up to 90s, and shows "Checking the tournament…". The phone never sees an edge-function failure; the existing Retry and idempotency still apply.
- If the tournament is live and findings are serious, the reply is marked **Urgent**. Any ticket is created with priority `urgent`.

## 5. Escalation rules
A ticket is created only when:
- the fix would touch a started or scored game (Super Admin approval needed);
- the same fault comes back after a repair (code defect);
- the plan is out of date twice in a row; or
- the repair runs but verification still fails.
A club admin or player reporting a proven bug is not a reason to escalate. Their problem gets fixed.

The ticket body includes: tournament/club IDs, the findings, the suspected cause, the preview change list, steps attempted, and a link to the related Assistant record. It continues to use the existing retry protection against duplicate tickets.

## 6. UI/UX (AiHelpBetaPanel)
- Diagnosis card (Super Admin): tournament name, a "Live" badge, findings in plain language with the rows affected, and the suspected cause. Technical detail is collapsed.
- Repair preview card: a before → after table per game, a risk label, and skipped locked games with the reason. Buttons: Confirm repair / Cancel. Confirm is disabled for high-risk changes.
- Verification line after the repair: "Re-checked: all 12 teams appear once, pairs intact" or the list of what remains.
- AI Activity already lists actions. Add a filter for "Tournament repairs" and show before/after, verification, and rollback.
- Replies stay in the user's language; checks and actions don't depend on the language. Voice input still goes through transcript → review → send.

## 7. Audit
Each record in `ai_assist_interactions` stores: requester, effective role, club, tournament ID, original message (Afrikaans preserved), findings, plan and hash, approval time, before/after rows, verification result, rollback link, and ticket ID. An `audit_events` entry is written with the same details.

## Technical details
- Files: `src/lib/tournaments/integrity.ts` (+ tests), `supabase/functions/_shared/tournament-integrity/*` (mirror), `ai-help/tools.ts` (3 read tools), `ai-help/actions.ts` (repair action), `ai-help/index.ts` (fast path, `waitUntil` working status, gating), `ai-help/flow.ts` (risk classify, escalation decision), `use-ai-help.ts` + `AiHelpBetaPanel.tsx` (polling, cards), AI Activity filter.
- Migration: RPCs `ai_repair_champ_playoffs` and `ai_rollback_champ_playoffs` (security definer, `search_path` set, Super Admin check, row locks); allow status `working` on interactions; seed the `ai_tournament_repair` beta for Super Admin only.
- No change to the legacy tournament module's behaviour. The engine is only read by it (optionally showing an admin warning later).

## Test suite
Unit tests for the engine and planner, using fixtures built from the Family Doubles tournament (2×6 pools, 5 rounds, 6 position finals):
1. **Rachel exact:** Rachel & Shania in two slots, Maria & Giselle missing → I1 + I2. The plan moves Maria & Giselle into the unstarted slot and leaves completed games untouched.
2. Duplicate in a slot that is already scored → I10. High risk, no auto-fix, escalation.
3. Partner rotated in a playoff → I4. The plan restores the registered pair.
4. Playoff result counted in pool standings (phantom sixth game) → I5. The plan is based on pool-only standings.
5. Extra pool round created → I7 is reported; the planner never deletes scored games.
6. Timed slots cleared after a format change → I9. The plan fills the reserved slots and keeps their time and court.
7. Withdrawn team still in fixtures → I8.
8. A healthy tournament → no findings, and no ticket.
9. Tournament changed between preview and Confirm → stale plan rejected.

Edge-function / flow tests:
10. Super Admin, Afrikaans text marked as spoken → diagnosis + preview, no data change before Confirm.
11. Confirm → RPC applied, verification passes, audit record has before/after, rollback works while games are unstarted.
12. Club admin (Rachel) sends the same report → automatic repair, verification, "Fixed" reply, AI Activity entry; no ticket.
13. Slow path longer than 20s → `working` returned; polling delivers the result; retry creates no duplicate ticket.
14. Repair verification fails → ticket raised automatically with the attempted steps.

Live acceptance (safe copy): run scenario 1 on a cloned test tournament at Riverside as Super Admin, from voice input through repair, verification, AI Activity and rollback.

## Acceptance criteria
- When Rachel (club admin) sends her exact report, the assistant finds the cause, fixes it automatically without approval, re-checks, and replies "Fixed". The phone never shows an edge-function error.
- No started or scored game is changed without Super Admin approval; those games are always skipped and reported.
- Every automatic fix is visible to Super Admin in AI Activity and can be undone.
- Every repair appears in AI Activity with before/after, verification and rollback status.
- All tests above pass. Nothing is published without a request.
