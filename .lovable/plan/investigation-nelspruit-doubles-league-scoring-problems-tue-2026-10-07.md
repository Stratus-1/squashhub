# Investigation: Nelspruit doubles league scoring problems (Tue 6 Oct 2026)

Read-only investigation. No code, data, settings or publishing changes. Output is a written findings report.

## Status so far
- A first look found 4 platform league fixtures dated 6 Oct 2026 (3 still `scheduled`, 1 `bye`), last updated 27 Sep. Not yet confirmed they belong to Nelspruit; no root cause is asserted yet.

## Steps
1. **Identify affected fixtures** — resolve Nelspruit's doubles leagues/seasons (tenant and platform-owned), list every 6 Oct fixture with teams, status, `league_fixture_results` rows, rubbers in `league_match_results`, lineups, marker locks and match-day access rows.
2. **Production evidence** — timestamps of result/rubber writes, rows stuck in `draft`/`setup`, missing or duplicated rubbers, mismatched player IDs (pairs vs singles slots), `live_marker_sessions`, audit events, notifications, plus database and edge-function logs for 6 Oct evening (RLS denials, permission errors, function failures).
3. **Code trace** — QR match-day shell -> tablet scoring route -> doubles scorecard generation (rubber count from association `league_rules`, pair slots) -> score-save RPCs/inserts and RLS (incl. recent `md_device_allow_setup_status` and `md_device_save_bells_result` migrations).
4. **Recent edits** — git history and migrations since ~1 Oct touching these paths; check what is published vs preview-only.
5. **Per-issue verdict** — evidence-backed cause, whether it still exists in current production code, minimum safe fix, and the regression test that would cover it (extend existing league/match-day suites).

## Deliverable
A chat report listing: affected fixtures, each problem with its evidence, cause (or "unconfirmed" where evidence is missing), still-present yes/no, proposed minimal fix and test. Fixes are only proposed, never applied, pending your approval.

## Question
If you have screenshots or the names of the teams/captains who hit the problems, sharing them will narrow step 1.
