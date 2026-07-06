# Dynamic Court Reuse

Right now each league round and tournament group allocates fixtures onto its own fixed court list, at fixed slot times. If League A finishes on Court 1 at 20:30 but League B still has matches queued for 21:00 on Court 2, League B's fixtures don't slide over — Court 1 sits idle. Same story inside a tournament: if a Group A match ends early, Group B keeps waiting for its scheduled slot.

This work makes the scheduler court-pool aware, at both generation time and live during play.

## Phase A – Generation-time court pooling

Goal: when multiple leagues (or tournament groups) share a play night, the allocator treats their combined courts as one pool and packs fixtures into the earliest free (court × time) cell.

Changes:
- New helper `allocateAcrossPools()` in `src/components/league-games/fixtures/scheduler.ts` that takes an array of `{ id, pairings, courtIds }` pools + a shared time window, and greedily assigns each pairing to the earliest slot where any of its own courts is free — falling back to any pool court if the league admin opts into shared courts.
- Reuses existing `buildSlotTimes` / `nextNPlayDates` / court-fairness logic — no behaviour change for leagues that don't opt in.
- Wire an opt-in "Share courts with other leagues on the same night" toggle into the league round generator dialog (`GenerateFixturesDialog` under `src/components/league-games/`), default OFF so nothing existing shifts unexpectedly.
- For tournaments (`ClubChampsTab` → `generate schedule` path via `src/lib/tournament-formats/*`), apply the same pooled allocator across groups that share the same date + courts. Bells format already schedules by court list; extend it to consume freed slots from sibling groups.

## Phase B – Live court reuse when matches finish early

Goal: as a fixture is marked complete (or a marker session ends), pull the next unstarted fixture on the same evening onto that freed court + time.

Changes:
- New edge function `reflow-freed-court` (`supabase/functions/reflow-freed-court/index.ts`):
  - Input: `{ fixture_id }` that just completed, or `{ tournament_match_id }`.
  - Looks up sibling fixtures on the same `fixture_date` after `now()` on shared/adjacent courts, whose current start_time is later than the freed slot.
  - Picks the earliest queued fixture whose teams aren't already playing right now, and updates its `court_id` + `start_time` to the freed cell.
  - Writes an audit row so the change is visible and reversible.
- Trigger the function from:
  - `league_fixture_results` insert (existing result-recording path in `LeagueGameDetail`).
  - Tournament match completion path (`club_champs_matches` update where `status → completed`).
  - Marker session end (`live_marker_sessions` cleanup) as a safety net.
- Frontend already subscribes to fixture / match realtime updates, so the UI re-renders automatically. Add a subtle "Moved earlier — Court X, HH:MM" toast on the affected fixture card via existing notification hooks.

Guardrails:
- Never move a fixture whose players are actively marking (`league_marker_locks` fresh < 60s) — the existing `useFixtureLiveMarkers` check.
- Never move within 5 minutes of the original start (players may already be on court).
- Only reflow fixtures inside the same round / same tournament / same evening — no cross-day shifts.
- Admin-level kill switch: `clubs.dynamic_court_reflow_enabled boolean default true` so a club can disable it.

## Phase C – Visibility

- Add a small "Auto-shifted" indicator on fixture rows whose start_time or court_id was moved by the reflow function (badge next to the time).
- Log every reflow in a new `court_reflow_log` table so admins can see what moved and why.

## Technical section (for reviewers)

Files touched:
- `src/components/league-games/fixtures/scheduler.ts` – add `allocateAcrossPools`, keep existing exports untouched.
- `src/components/league-games/GenerateFixturesDialog.tsx` – add opt-in toggle + pass sibling league court lists.
- `src/components/club-admin/ClubChampsTab.tsx` + `src/lib/tournament-formats/bells.ts` – route through pooled allocator when groups share courts.
- `supabase/functions/reflow-freed-court/index.ts` – new function, `verify_jwt` on, service-role writes.
- New migration: `clubs.dynamic_court_reflow_enabled bool`, new `court_reflow_log` table with RLS (`club_id` scoped, admin read).
- Result-recording paths add a fire-and-forget `supabase.functions.invoke('reflow-freed-court', …)`.

No changes to existing ladder, results, or points logic. Rollout is opt-in per league at generation time; live reflow is on by default but killable per club.

Approve to start with Phase A (generation-time pooling for leagues + tournaments), then Phase B, then Phase C.