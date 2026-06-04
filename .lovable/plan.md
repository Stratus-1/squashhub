# Per-league break time + swap fixtures

## 1. Per-league fixed slot + break time

Keep the existing **slot length per league** (already stored in `club_champs.group_durations`). Add a new per-league **break minutes** so the bell rings *before* the end of the slot, leaving changeover time built into the schedule.

### Model

For each league:
- `slot_minutes` = existing `group_durations[league]` (e.g. 30, 15)
- `break_minutes` = new per-league setting (e.g. 5, 2.5)
- `bell_minutes` = `slot_minutes − break_minutes` ← what the Bells timer counts down to

Example:
- League 1: 30 min slot, 5 min break → bell at 25 min. Games at 08:00, 08:30, 09:00…
- League 4: 15 min slot, 2.5 min break → bell at 12.5 min. Games at 08:00, 08:15, 08:30, 08:45, 09:00…

Both leagues sync on the hour, courts never overlap, and players always have the same recovery between their own games.

### Schema (additive, one migration)

- `club_champs.group_break_minutes jsonb default '{}'` — `{"1": 5, "2": 5, "3": 3, "4": 2.5}`
- `club_champs.default_break_minutes numeric default 5` — fallback used when a league hasn't been customised

No data backfill needed; absent keys fall back to the default, and the default falls back to 0 for any legacy tournament (so existing tournaments behave exactly as today).

### UI

- **Bells admin wizard** (`ClubChampsTab.tsx` — "Time cap per league" row): add a second small input **"Break (min)"** next to the cap. Row label becomes *"League 1 — 30 min slot − 5 min break = bell at 25 min"* so admins see the effect.
- **Champ wizard top section**: add a default-break input next to the default match duration.
- Schedule list (the screenshot you sent) stays exactly the same — the start times already reflect the slot stride.

### Scheduler change

`ClubChampsTab.tsx` generator (≈ lines 890–1040) already strides each court by `matchDuration` per league. **No change needed** to slot placement — the start times you see in the screenshot are correct because they're slot-based, not bell-based. The only addition is persisting `group_break_minutes` so the timer can use it.

### Bells marker timer

`BellsFormat.getTimeCapMinutes(champ, groupNumber)` (in `src/lib/tournament-formats/bells.ts`) currently returns the league's slot length. Change it to return `slot_minutes − break_minutes` (clamped to ≥ 1 min). That's the only place the timer reads from, so the bell will now ring at the correct point and the changeover window is preserved.

## 2. "Swap with another fixture" action

On every scheduled row in the admin schedule (the list in your screenshot — `ClubChampsTab.tsx`) and the public schedule (`ClubChampsView.tsx`), add a small **Swap** button per row that opens a popover:

- Lists all other scheduled matches in this tournament (date · time · court · pair vs pair).
- Type-ahead search by player name to narrow the list quickly.
- Clicking a target match **swaps `scheduled_date`, `scheduled_time`, and `court_id`** between the two rows in a single transaction.
- Validation before swap:
  - Neither set of four players ends up playing two matches at the same slot anywhere else in the schedule.
  - If a conflict exists, the offending row is disabled in the list with a small "conflict" badge (same pattern already used in `FinalizeTournamentSetupDialog`).
- No reshuffling of any other matches — pure A↔B swap.

This works just as well on phones as on desktop and stays robust if the admin is tapping courtside. No drag-and-drop layer, per your call.

## 3. Notifications

Per your call: **no push/email**. Players see the updated time/court the next time they open the app (data is already live via React Query).

## Out of scope

- Who is paired with whom, which league they're in — unchanged.
- Court bookings — admin still presses **Make Court Bookings** after a swap (existing button rewrites bookings from the schedule).
- Standings, live scoring, marker UI — unchanged except for the corrected bell timing.

## Files touched

- `supabase/migrations/<new>.sql` — add `group_break_minutes`, `default_break_minutes`.
- `src/components/club-admin/ClubChampsTab.tsx` — wizard inputs (default + per-league break), schedule row "Swap" action.
- `src/pages/ClubChampsView.tsx` — same "Swap" action on the public schedule.
- `src/lib/tournament-formats/bells.ts` — `getTimeCapMinutes` returns `slot − break`.
- `src/lib/tournament-formats/types.ts` — extend `ChampLike` with the new fields.

One migration + four frontend edits. No edge functions.
