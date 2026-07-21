## Recommendation

Keep it as **one tournament** with a per-league round format, rather than two separate tournaments. Court booking, day schedule, playoffs date, and cross-league court rotation already live at the tournament level — splitting into two tournaments would force manual court coordination and duplicate registrations/playoffs/reminders.

The wizard already treats leagues as independent groups (per-league Swiss pools, per-league Bells time caps, per-league round-robin generation). Adding a per-league **format** extends the same pattern.

## What Nelspruit will see

In the wizard's **Round format** step:

- Existing dropdown stays as the tournament **default** format.
- New toggle: *"Use a different format for some leagues"*.
- When on, a small table lists each configured league with its own format dropdown (single round-robin, double round-robin, Swiss). Swiss pool/round inputs appear only next to leagues set to Swiss.
- Capacity calculator and schedule preview already loop per-league — they switch on the chosen per-league format instead of the tournament default.

Playoffs, court rotation, break minutes, and finals date remain tournament-wide (unchanged). Bells stays tournament-wide for now — we'll revisit per-league Bells when it's needed.

## Technical details

**Data model (`club_champs`)**

- Add `league_formats jsonb` — map of `group_number` (string) → `"single_round_robin" | "double_round_robin" | "swiss"`. Legacy tournaments fall back to `round_format`.
- `cross_league` remains tournament-wide and mutually exclusive with per-league mixing (the toggle is hidden when default is `cross_league`).
- `swiss_pools` / `swiss_rounds` already keyed by league — only applied where that league's format is `swiss`.

**Code changes**

- `src/components/club-admin/ClubChampsTab.tsx`
  - Add `leagueFormats` state + `formatForLeague(gi)` helper that falls back to top-level `roundFormat`.
  - Replace `roundFormat === "swiss"` / `=== "double_round_robin"` inside the per-league generation loop (~L1373–L1500) and capacity calculator (~L3958–L3979) with `formatForLeague(gi)`.
  - New UI block under the Round format select: toggle + per-league dropdown table; reuse existing Swiss pools/rounds inputs conditionally.
  - Persist/restore `league_formats` alongside `swiss_pools` in the save payload and champ-load effect (~L2877).
- `src/components/club-admin/ChampSchedulePreview.tsx` — accept `leagueFormats` and thread through per-league slot budgets; no new format-specific logic.
- Migration: add `league_formats jsonb` column on `club_champs` (nullable, default null).

**Out of scope**

- Bells per-league (deferred — flag as follow-up when needed).
- Playoffs generation, court rotation, bookings creator, invites/emails.
- Two-tournament cross-coordination — no longer needed.
