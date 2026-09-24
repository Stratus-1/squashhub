# AI Assistant: Live Tournament Diagnose → Self-Heal (Beta)

## Goal
When someone reports a live tournament problem (e.g. "Rachel & Shania appear twice, Maria & Giselle are missing"), the Assistant checks the real tournament, finds the cause, and fixes it straight away when only one correct state is possible. No Super Admin or club admin approval is needed. It then re-checks the tournament, logs the change and notifies admins. It asks a person only when a judgement call is needed or a human-entered result would change. Verified code fixes are deployed without waiting for a manual publish (section 8).

**What changed in this revision**
- Approval is no longer tied to Super Admin. Proven system bugs (A1–A8) repair automatically for any report from the tournament's club.
- Only judgement items (J1–J4) need approval, and any club admin of that tournament can give it. Willem is never a bottleneck.
- A failed verification rolls back the whole repair. Admins are notified after every automatic repair.
- New section 8: tournament rules move to the server so fixes go live without a publish; verified fixes that do need an app update are published automatically after passing checks; ambiguous or unverified fixes are never published automatically.

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

**Self-healing action:** `repair_tournament_state`
- The planner labels every proposed change:
  - `deterministic`: exactly one correct state follows from saved settings, registered pairs and finished pool results. These run automatically.
  - `judgement`: more than one plausible answer, conflicting evidence, or the change would alter a human-entered score/result or another human decision. These need approval.
- Runs through a new security-definer RPC, `ai_repair_champ_state(champ_id, plan_hash, changes jsonb)`. In one transaction it:
  - checks scope: a club admin/captain or player of that tournament's club, or Super Admin;
  - locks the rows;
  - takes a snapshot of every row it will touch;
  - rejects stale plans (`plan_hash`);
  - refuses anything labelled `judgement`;
  - applies the changes;
  - re-runs the integrity checks inside the same transaction.
  If any check still fails, the whole transaction is rolled back, so nothing is left half-changed, and the case is escalated.
- After a successful commit, the assistant:
  - records the snapshot, cause, changes and verification in `ai_assist_interactions` + `audit_events`;
  - notifies the tournament's club admins (in-app, plus the Communications engine) and Super Admin in AI Activity;
  - tells the reporter the outcome.
- Rollback restores the snapshot through an inverse RPC while the affected games are still unscored.

## 3. Approval model: automatic vs approval

**Automatic: no admin or Super Admin approval.** Triggered as soon as anyone in that tournament's club reports a problem (club admin, captain or player) or Super Admin does. Diagnosis runs right away; the repair runs if proven.
| Category | Example |
|---|---|
| A1 Duplicate or missing playoff qualifiers caused by generation/recalculation | Rachel & Shania twice, Maria & Giselle missing → restored from frozen final pool standings |
| A2 Fixed doubles pair split or rotated | Restore the registered pair in every unscored game |
| A3 Playoff games counted in pool standings | Recalculate from pool games only; freeze standings |
| A4 Pool play finished but reserved playoff slots empty or unfilled | Fill the slots from frozen standings, keeping their time and court |
| A5 Extra pool games generated beyond the configured rounds (unscored) | Remove them / mark them void |
| A6 Wrong position pairing in a slot (e.g. Pool 1 #3 vs Pool 2 #4) | Restore Pool 1 #N vs Pool 2 #N |
| A7 Withdrawn team still in unscored fixtures | Apply the existing withdrawal rule |
| A8 Reserved slot times lost after a format change | Restore them from the saved schedule settings |

**Still needs approval: genuine judgement.**
| Category | Who approves |
|---|---|
| J1 A fix would change or remove a human-entered score or result (started or completed game) | Club admin of the tournament, or Super Admin |
| J2 More than one plausible correct state (e.g. unresolved tie-break, conflicting records) | Club admin of the tournament, or Super Admin |
| J3 A human decision rather than a bug (replace a player, move a time, change format) | Club admin of the tournament (existing confirm flow) |
| J4 Deleting data beyond unscored generated games | Super Admin |

Approval never depends on Willem personally: any admin of the tournament's own club can approve J1–J3. If nobody approves, the automatic parts are still repaired, and the judgement items stay listed as open.

- **Code defects:** the assistant repairs the data but cannot change the app's code. If the same corruption comes back after a repair, it opens a defect ticket with all diagnostics so it can be fixed in the code. The live tournament keeps running on the repaired state.
- Safety stays on the server: role and scope come from the server, never from what someone types. The tournament must belong to the reporter's club (Super Admin: any club). Beta flag `ai_tournament_repair` is enabled for Super Admin, Riverside and Nelspruit.
- Safety stays on the server: identity and role are never taken from what someone types, the tournament must belong to the reporter's club (Super Admin: any club), and the repair RPC re-checks all of these conditions itself. Beta flag `ai_tournament_repair` limits this to Super Admin, Riverside and Nelspruit.

## 4. Timeout and live priority
- There is a 40s overall budget, and the integrity check is deterministic, so it should take about 1 second and needs no model call.
- Fast path: if the message mentions a tournament or playoffs, or the user is on a tournament screen, the function resolves the current tournament from page context. It runs the integrity check first and gives the result to the model, so the model explains the findings rather than exploring.
- If the reply is not ready within about 20s, the function returns `{ status: "working", interactionId }` straight away. Work continues via `EdgeRuntime.waitUntil`, and the result is written to `ai_assist_interactions`. The panel polls the record every 2s, up to 90s, and shows "Checking the tournament…". The phone never sees an edge-function failure; the existing Retry and idempotency still apply.
- If the tournament is live and findings are serious, the reply is marked **Urgent**. Any ticket is created with priority `urgent`.

## 5. Escalation rules
A ticket is created only when:
- a judgement item (J1–J4) has not been approved by an admin within 10 minutes during a live tournament;
- the same fault comes back after a repair (code defect);
- the plan is out of date twice in a row; or
- verification fails (the change is rolled back automatically, then escalated).
A club admin or player reporting a proven bug is not a reason to escalate. Their problem gets fixed.

The ticket body includes: tournament/club IDs, the findings, the suspected cause, the preview change list, steps attempted, and a link to the related Assistant record. It continues to use the existing retry protection against duplicate tickets.

## 6. UI/UX (AiHelpBetaPanel)
- Outcome card for the reporter: "Checked the tournament → found → fixed automatically", a "Live" badge, a before → after list per game, and the verification result. Technical detail is collapsed.
- Judgement card, shown only to club admins of that tournament and Super Admin: open J-items with a before → after preview and Approve / Decline. Players see "An admin has been asked to decide on 1 item."
- Verification line after the repair: "Re-checked: all 12 teams appear once, pairs intact" or the list of what remains.
- AI Activity already lists actions. Add a filter for "Tournament repairs" and show before/after, verification, and rollback.
- Replies stay in the user's language; checks and actions don't depend on the language. Voice input still goes through transcript → review → send.

## 7. Audit
Each record in `ai_assist_interactions` stores: requester, effective role, club, tournament ID, original message (Afrikaans preserved), findings, plan and hash, approval time, before/after rows, verification result, rollback link, ticket ID and any deployment made. An `audit_events` entry is written with the same details.

## 8. Getting code fixes live without waiting for a manual publish
There are two kinds of fix, and they reach users in different ways:
- **Data repairs (A1–A8):** live the moment the transaction commits. Nothing needs publishing, so the tournament is fixed within seconds.
- **Code fixes (when the bug is in SquashHub itself):** the in-app assistant cannot write or publish code. It can only detect the defect and raise a ticket with full diagnostics, and I then fix the code here. To keep live tournaments from waiting on a publish:
  1. **Move the tournament rules to the server.** The pool freeze, playoff filling, fixed-pair enforcement and integrity checks will run in the database (RPCs/triggers) and edge functions, not only in the phone app. Server changes go live the moment they are deployed, with no publish and no phone refresh.
  2. **Standing permission to publish verified fixes.** When a verified, non-ambiguous bug fix also needs an app update, I publish it automatically with no separate request. Before publishing, it must pass: build, typecheck, the tournament and assistant test suites, a security scan with no critical findings, and a re-run of the integrity check on the affected tournament. A fix that is ambiguous or unverified, or that fails any check, is never published automatically; I report it instead.
  3. Every automatic deployment is recorded in the audit trail (what changed, why, checks passed, time). Club admins and Super Admin are notified in the app.
- Players' phones pick up an app update through the existing 60-second update check, so no reinstall is needed.


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
- Categories A1–A8 repair automatically, with a snapshot, one transaction, verification, audit and admin notification. J1–J4 always need approval from a club admin of the tournament or Super Admin.
- A failed verification leaves no partial change: everything is rolled back and escalated.
- Every automatic fix is visible to Super Admin in AI Activity and can be undone.
- Every repair appears in AI Activity with before/after, verification and rollback status.
- All tests above pass. Nothing is published without a request.
