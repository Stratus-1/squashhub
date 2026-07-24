# Session-aware "Spread" scheduling

## Problem today
The current **Spread** mode (`ClubChampsTab.tsx`, `schedulePreview` memo) only balances matches per **calendar date**. It has no notion of *sessions within a day*, so:

- A Saturday with a long time window is treated as one big bucket — a pair can get all their Saturday games back-to-back in the morning and nothing in the afternoon.
- If Sunday only fits a handful of slots, most pairs finish on Saturday and never play on the last day.
- "Play at least 2 per session" is impossible to express.

## New logic (Spread mode only)

1. **Detect sessions automatically** from the existing day windows:
   - Every entry in `daySchedules` (or the global `startTime`-`endTime` for each play-day) becomes one candidate session.
   - Any session longer than a threshold (default **5 h**) is split in half at the midpoint into two sessions labelled *AM* and *PM* (a small lunch gap of `matchDuration` is skipped between them so an in-progress match isn't torn across sessions).
   - Example, Fri 18:00-21:00 + Sat 08:00-17:00 + Sun 08:00-12:00 → `["Fri eve", "Sat AM", "Sat PM", "Sun AM"]` = 4 sessions.
   - Sessions are tagged on every generated `allSlots` entry as `sessionKey` + `sessionIndex`.

2. **Per-pair session target** — for each entity (pair or player) in a league:
   ```
   gamesPerEntity = leagueMatches involving that entity
   targetPerSession = ceil(gamesPerEntity / totalSessions)
   ```
   `tryPlace` gains a new guard: in Spread mode, refuse a slot when the entity has already reached `targetPerSession` for that session (unless the fallback pass is running).

3. **Per-league session target** (keeps leagues from monopolising a session):
   ```
   leagueTargetPerSession = ceil(leagueTotalMatches / totalSessions)
   ```
   Replaces the current per-date league quota when Spread is on.

4. **Last-session anchor** — before general placement, run a **priming pass** over the *final* session that seeds one match per pair (round-robin across leagues) into that session's slots. Guarantees "everyone plays on the last day" whenever the session has capacity; the rest of the algorithm fills backwards from there.

5. **Per-session gap rule** — carry the existing "no back-to-back for the same entity" check but scope it to slots within the same session (so a pair *can* play the first slot of PM after the last slot of AM, which is what admins want).

6. **Fallback passes unchanged** — quota-relaxed pass, then conflict-allowed last resort, so scheduling never *fails* on tight tournaments; it just degrades gracefully back toward today's behaviour.

7. **Preview surfacing** — the wizard's preview step (`ChampSchedulePreview`) already lists matches by date/time; add a subtle session divider (label + match count) so admins can see the distribution before clicking **Rebuild Schedule**.

## Scope guardrails

- **Spread mode only.** *Fill* mode is untouched (still packs chronologically).
- **Rebuild only.** No migration, no data change, no automated update of any existing tournament. The algorithm change only takes effect when an admin clicks **Rebuild Schedule** in the wizard.
- **Playoff reservation** logic (`reservedSlotIdx`, `playoff_break_minutes`, `playoff_date`) stays as-is — placeholders still claim the tail slots.
- **Bells format** keeps its own separate scheduler; not part of this change.

## Technical notes (for the dev)

- File: `src/components/club-admin/ClubChampsTab.tsx` — the `schedulePreview` `useMemo` (session building at ~1495, `allSlots` at ~1547, `slotOrder` at ~1566, quotas at ~2193, `tryPlace` at ~2224).
- Add a `buildSessions(sessions, matchDuration, maxSessionMinutes = 300)` helper that returns `{ sessionKey, date, startMin, endMin, courtIds }[]`, then rebuild `allSlots` from *those* rather than from raw sessions. Every slot carries its `sessionKey`.
- Track two new counters alongside the existing per-date maps:
  - `leagueSessionCount: Map<leagueId, Map<sessionKey, number>>`
  - `entitySessionCount: Map<entityId, Map<sessionKey, number>>`
- Priming pass: iterate leagues round-robin, walk each pair's remaining matches, place one into the final session using the standard conflict check.
- No schema change — `sessionKey` is purely a client-side derivation from `(date, time)`.

## Out of scope
- UI to *manually* define sessions (auto-detected from existing day windows for now).
- Any automated re-scheduling of existing `club_champs` rows.
- Changes to *Fill* mode, drag-and-drop swap conflict rules, or the manual "Add slot / Fill slot" flow shipped earlier.

Approve to proceed, or tell me what to adjust (session threshold, priming target, whether to expose session labels on the schedule preview, etc.).
