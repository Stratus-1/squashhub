## Goal

When a tournament is generated, also create the playoff/finals fixtures **up front** as placeholder matches (e.g. "Winner Pool A vs Runner-up Pool B", "Winner SF1 vs Winner SF2"). Slot them into the schedule after the group-stage cutoff, so the whole tournament — from Friday pool games through Sunday finals — appears on the fixture list at day 1.

As pool results come in, the placeholder slots fill with real players (existing "Regenerate play-offs" logic already handles this).

## What changes

### 1. Build placeholder playoff rows at generation time
- Today `buildPlayoffMatches` only produces rows once standings are known.
- Add a companion `buildPlayoffPlaceholders({ champId, mode, leagueCount, minLeagueSize, isDoubles, enable3rd })` in `src/lib/tournament-playoffs.ts` that returns the same row shape but with:
  - `player_a_member_id / player_b_member_id = null`
  - `stage_label` describing the source: e.g. `"League 1 · Pos 1 · Semi-final (P1 A vs P4 A)"`, `"Final (Winner SF1 vs Winner SF2)"`, `"3rd Place (Loser SF1 vs Loser SF2)"`.
  - A new `placeholder_a` / `placeholder_b` text column so the UI can render "Winner Pool A" etc. before players are known.

### 2. Schedule pool games first, playoffs after cutoff
- In `ClubChampsTab.tsx` scheduler (`customizeDailySchedule` + slot loops):
  - Reuse the group-stage cutoff already discussed (default: last pool day evening, or user-set date+time).
  - Pass 1 — pool matches into slots **before** cutoff (using the balanced `slotOrder` we added).
  - Pass 2 — playoff placeholders into slots **at/after** cutoff, in bracket order (QF → SF → 3rd/Final), with a minimum gap so a player isn't scheduled back-to-back once resolved.
- If placeholders overflow available post-cutoff slots, show a warning in the capacity box ("Play-offs need 2 more slots after 15:00 Sat").

### 3. Persisting placeholders
- Insert placeholder rows into `club_champs_matches` at generation time alongside pool matches. They already fit the schema (player IDs are nullable). Add the `placeholder_a` / `placeholder_b` columns via migration.

### 4. Filling placeholders as results come in
- Extend the existing `handleGeneratePlayoffs` flow in `ClubChampsView.tsx`:
  - Instead of deleting + recreating playoff rows, look up matching placeholder rows by `(stage, group_number, bracket_position, round_number)` and `UPDATE` them with real `player_*_member_id` values, preserving the pre-assigned court + start_time.
  - When a QF/SF completes, auto-fill the downstream Final/3rd placeholder (same logic already in place, just switched from insert to update).

### 5. UI
- Fixtures list + pool cards in `ClubChampsView.tsx`: when player IDs are null, render `placeholder_a` / `placeholder_b` strings (e.g. "Winner Pool A") instead of "TBD".
- Standings/pools tabs unchanged.

## Technical notes

- Migration: `ALTER TABLE club_champs_matches ADD COLUMN placeholder_a text, ADD COLUMN placeholder_b text;` — no RLS/grant changes needed (existing table).
- Scheduler change is confined to the two slot loops we recently touched in `ClubChampsTab.tsx`; the `slotOrder` interleaving stays for the pre-cutoff pass.
- No changes to standings/points logic.

## Open question

Do you want the group-stage cutoff to be:
- **(a) Auto** — last pool day at 12:00 (so afternoons on Sat = playoffs), or
- **(b) Manual** — you pick the exact date+time in the wizard when generating fixtures?

If you're happy with the plan, tell me which cutoff option and I'll implement.
