# Tournament expansion: league invitees & league-ranking handicap (v3)

Adds your latest clarification: the league-based invite list is just the **starting roster**. After that, admin can swap in any player from any league at any time (no cutoff), and the handicap recomputes automatically for the new pairing.

## 1. Invite by league (with reserves)

In **Invite-only** registration mode, add an "Invite source" picker:

- **Manual member tick-list** (default, current behaviour).
- **By league** — pick one or more leagues (e.g. "4th League") and choose:
  - Include reserves (default on).
  - Auto-add new players that join the league before entries lock (toggle).

Admin can untick individuals; excluded IDs are stored so re-syncs don't re-add them. This only governs the **initial invite list**. Once the tournament is running, admin can pull in anyone from any league as a sub via the existing player-swap UI on the fixture — no cutoff date.

Storage on `club_champs`:
- `invite_source text` default `'manual'` (`'manual' | 'leagues'`)
- `invite_include_reserves boolean` default `true`
- `invite_excluded_member_ids uuid[]` default `'{}'`
- (reuses existing `source_league_ids uuid[]`)

On Save, "By league" expands into `club_champs_registrations` invite rows (`invited_by_admin=true`, `status='invited'`), pulling reserves from `member_league_registrations` where `is_reserve=true`.

## 2. League-ranking handicap (singles)

New toggle in tournament setup: **"Use league-ranking handicap"** (off by default; singles only).

Each player has exactly one league + ladder position (`member_league_registrations → league_number, ladder_position`). Reserves use the league they reserve for.

### Formula (no cap)

Concatenate leagues in order into a single global ladder:

```
globalIndex(player) = sum(size of every league above player's league) + ladder_position
diff                = globalIndex(weaker) − globalIndex(stronger)
strongerStart       = −diff      (e.g. −3, −7, −10, …)
weakerStart         = 0
```

Examples (3rd league size 8):
- 3rd #1 vs 3rd #4 → −3 / 0
- 3rd #1 vs 4th #2 → −10 / 0
- 2nd-league sub #5 vs 3rd #4 → 2nd-league sub starts on −7

### On the marker

Scoreboard opens at e.g. `−3 / 0`. Both players score normally until the bell. **Final stored score = handicap + points scored**, so Bells-style "total points scored" standings naturally include it. Admin can override starting numbers per fixture.

### Recomputing on substitutions

Because subs can come from any league at any time, the handicap helper runs every time a fixture's player_a/b/partner_a/b changes — overwriting `handicap_a/b` on that match row (unless admin has manually pinned a value). Matches that have already started or finished are left alone.

### Storage

- `club_champs.handicap_mode text` default `'none'` (`'none' | 'league_rank'`)
- `club_champs_matches.handicap_a int` default `0`
- `club_champs_matches.handicap_b int` default `0`
- `club_champs_matches.handicap_locked boolean` default `false` (set when admin manually edits the offset, prevents auto-recompute)

Doubles hides the toggle for this pass.

## Files touched

- `supabase/migrations/<new>.sql` — six new columns above, safe defaults, no RLS changes.
- `src/components/club-admin/ClubChampsTab.tsx` — wizard UI for both features, league-expansion on Save, persistence, manual-override editor for starting scores.
- `src/lib/tournament-formats/handicap.ts` (new) — pure `computeHandicap(playerA, playerB, leagueSizes)` + bulk applier; called from fixture generation and from the player-swap path.
- `src/lib/tournament-formats/standard.ts` and `bells.ts` — invoke the helper when `handicap_mode='league_rank'`.
- `src/components/tournaments/SwapFixtureButton.tsx` (and wherever the swap mutation lives) — recompute handicap for the affected match after a sub.
- `src/pages/MatchMarker.tsx` — seed scoreboard with `handicap_a/b`; show small "HCP −3" chip beside each name.
- `src/pages/ClubChampsView.tsx` — show handicap on the fixture card.
- `src/integrations/supabase/types.ts` — regenerated.

Say "build it" and I'll ship.
