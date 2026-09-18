# Ladies who play in the men's league

Some ladies — especially strong 1st and 2nd league players — regularly play in the men's league. Today they only appear in a men's team's pool if an admin pulls them in by hand, and they only ever appear on the ladies' ladder. This adds a switch that lets proven cross-gender players be filled into men's teams automatically and ranked in the men's ladder as well.

The data already proves who they are: every regional-league rubber is tagged "Mens" or "Ladies", with the league level and the string position played. For example Kaylee Hunt has 29 men's rubbers across the 2nd to 5th leagues, Starla Phillips 35 across the 2nd to 7th.

## The switch

A new setting, "Ladies may play and be ranked in the men's league":

- Set on the association (e.g. NSA) as the default for every club under it.
- A club can override it for itself.
- Off everywhere by default, so nothing changes for clubs that don't want it.

## Who qualifies

A lady qualifies when she has played at least one men's-league rubber in the current or previous season. Older history alone does not qualify her, but it still informs her suggested position. A player can always be removed by hand.

## Filling up leagues

When the switch is on, men's teams show qualifying ladies in their Available pool automatically, marked so a captain can see who they are and which men's league level they normally play. They are ordered with everyone else by strength, follow the same substitution rules (movement cap, sub direction) as any other player, and disappear from other pools once placed — no double-booking. Ladies' teams are unaffected: she stays in her own team's pool exactly as now.

## The club ladder

She keeps her ladies' ladder place unchanged, and also appears in the men's ladder with a small marker, slotted in by her men's-league form (league level, string position and win rate over recent seasons). Men can challenge her and she can challenge them, exactly like any other entry in that ladder.

The existing "Refine rankings from regional league stats" button becomes gender-aware: the men's ladder is refined from men's-league rubbers, the ladies' ladder from ladies' rubbers.

## Technical notes

- Schema: `league_associations` (or `league_rules`) gets `cross_gender_league_play_allowed boolean not null default false`; `clubs` gets a nullable `cross_gender_league_play_allowed` override (null = inherit). Resolution helper mirrors the existing association-rules inheritance pattern. A new nullable `cross_gender_ladder_position int` on `club_members` holds the men's-ladder slot for a cross-listed lady, so `ladder_position` remains the single source of truth for her own ladder. Grants + RLS unchanged in shape (existing club-scoped policies cover the new columns).
- Eligibility source: new `src/lib/leagues/cross-gender.ts` — pure functions that turn `nsa_rubber_history` rows (`category = 'Mens'`, `season_year >= latest - 1`) plus local history (`league_week_lineups`, `league_match_results`, `member_league_registrations` in a men's league) into a `Map<club_member_id, { qualifies, lastSeason, typicalLeagueLevel, typicalPosition }>`. Matched by normalised association number, same normalisation as `use-league-strength.ts`.
- `FillUpLeaguesTab.tsx`: add a `crossGenderPool` alongside the existing `pulledLadies`/`byePool`, gated on the resolved switch, deduped through `seenMembers` and hidden by `positionedAnywhere`. Placement still runs through `checkSubEligibility`; the switch also implies `cross_gender_subs_allowed` for these players so the engine does not block them.
- `computeLeagueStrength` gains a `category` filter so men's and ladies' refinement read different rubber sets; `use-league-strength.ts` selects `category` and passes it through.
- `Ladder.tsx` / `use-data.ts` `useLadder`: cross-listed members are appended to the men's bucket with a `crossGender` flag and ordered by `cross_gender_ladder_position`; per-gender numbering for the ladies' ladder is untouched. `LadderTab.tsx` gets the same dual listing plus drag-to-reorder writing `cross_gender_ladder_position`.
- Challenges: `use-ladder-config`/challenge creation currently scopes opponents by gender bucket — extend the opponent query to include cross-listed members of the ladder being challenged in.
- Tests: `src/test/cross-gender-league.test.ts` for qualification windows and pool inclusion, plus extra cases in `ladder-league-strength.test.ts` for the category filter and in `league-sub-eligibility` for the switch-driven cross-gender allowance.
- Ladder immutability respected: nothing is written until an admin saves the ladder.
