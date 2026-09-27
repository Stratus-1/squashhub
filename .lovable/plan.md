# Doubles: original-pair bonus, reserves and substitution rules

## What you'll get

1. **Original-pair bonus for doubles**
   - Doubles leagues give the bonus **per pair**, and only when **both** players of an original pair play together in their pair slot. If either player is a sub, that pair earns no bonus.
   - Singles leagues keep the current per-player rule.
   - Setting text changes for doubles leagues: "Team earns extra points for each original pair that plays together. Pairs that include a sub don't earn the bonus."

2. **Pair edits by an admin count as official**
   - When an admin changes a pair in the **Doubles pairs** window and saves, the new pair becomes the original pair from that point on. The new player then earns the bonus like everyone else in that pair.
   - Each pair change is saved with its date. Fixtures that were already scored keep the pair they had when scored, so old results and standings never change.
   - Fixtures played after the change use the new pair.

3. **Reserve setup: admin choice per league**
   - A new setting: **Reserves: Per team** (current behaviour) or **Per league (reserve team)**.
   - With "Per league", the league gets a single **Reserve team**. Each reserve is given a rank (1st, 2nd, 3rd, 4th pair level). Reserves never play as a team and never appear in standings or fixtures.

4. **Substitution rules for doubles**
   - Where subs may come from (on/off switches): **Reserve team** and **Team on bye that week**.
   - Rank rule (admin chooses): **Same rank only** (the pair-2 slot must be filled by a rank-2 player) or **Same rank or lower** (never a stronger player).
   - Rank comes from the reserve's rank or, for a bye-team player, from the pair number they play in their own team.
   - When a captain or admin picks a sub on the scorecard, only allowed players are listed. Anyone else is blocked, with a short reason, e.g. "Not on bye this week" or "Rank 1 can't sub into pair 3".
   - Subs are marked SUB, and their pair earns no original-pair bonus.

## Where it appears
- League rules settings: reserve mode, sub sources and rank rule sit next to the original-player bonus switch.
- Doubles pairs window: when reserves are "Per league", a **Reserve team** entry appears with a rank for each reserve.
- Scorecard: filtered sub picker and SUB badges.

## Technical details
- Migration (additive):
  - `league_rules`: `reserve_mode text default 'per_team'` ('per_team'|'per_league'), `sub_from_reserves bool default true`, `sub_from_bye_team bool default false`, `sub_rank_rule text default 'any'` ('any'|'same'|'same_or_lower').
  - `league_reserve_players` table (association_id, season_id, member_id, rank int, is_active), with GRANTs, RLS (club members can view, club admins can manage) and an updated_at trigger.
  - `league_team_pairs`: add `effective_from date default current_date`. An edit deactivates the old row and inserts a new row (history is kept, and old rows are never rewritten).
- Pair resolution for a fixture: pairs active on the fixture date. Scored fixtures keep using `match_format.permanentSquadSnapshot`, extended with `pairs: [[a,b],...]` per side and frozen on first save, as singles does today.
- Bonus logic moves to a pure helper in `src/lib/leagues/original-pair-bonus.ts`. Sub eligibility goes in `src/lib/leagues/doubles-sub-eligibility.ts`. `LeagueGameDetail.tsx` calls both helpers.
- Tests cover: both originals get the bonus, one sub gets none, a pair edited mid-season gives the new player the bonus, an old fixture keeps its old pair, the bye/reserve source toggles, and each rank rule.
- Nothing about singles/NIL/NSA behaviour changes. Preview only until you say "publish".
