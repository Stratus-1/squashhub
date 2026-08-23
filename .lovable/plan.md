# League Architecture: Permanent Leagues, Seasons, and Singles / Doubles / Hybrid

Investigation only so far — nothing was changed, and the earlier publish call was interrupted, so nothing was deployed.

## A. Current state (verified against the live schema and data)

Entities as they exist today:

- `league_associations` — this is what the UI calls a "league" (e.g. `Nelspruit Singles League` / `NIL`, `Nelspruit Doubles` / `NDL`, `Northern Squash Association` / `NSA`). It already has `scope` (internal/region), `discipline` (`singles`/`doubles`, added in the approved NIL work), `platform_association_id` mirror link.
- `leagues` — despite the name these are **teams / divisions** (`name`, `code`, `season_year`, `level`, `is_reserve`, `captain_member_id`, `archived_at`). 190 rows: 28 have `season_year = 2026`, **162 have `season_year = NULL`**.
- `league_rounds` — round/week definitions, keyed to `association_id` + `round_number`, with a **unique constraint `(association_id, round_number)`**. No season column. 10 rows.
- `member_league_registrations` — player-to-team roster, unique `(club_member_id, league_id)`. 1196 rows. Season comes only implicitly from the team row.
- `platform_league_fixtures` — 1216 rows. Keyed by `association_id` + **text `home_team_code` / `away_team_code`** and `division` text; optional `round_id`.
- `league_fixture_results` (142) — one aggregate result per fixture; `league_match_results` (658) — the individual rubbers, addressed by `position` + `home_player_code` / `away_player_code` **text**, not member IDs.
- `league_fixture_lineups` (0 rows, unused so far) and `league_week_lineups` — position → single `club_member_id`.
- `league_rules` (194) — per-league(-team)/association config: `team_size`, bonus points, sub rules. No doubles concepts.
- `seasons` table exists but is **empty and unused** (generic name/start/end only).
- `src/lib/leagues/season-level.ts` derives season/level from stored `season_year`/`level`, falling back to parsing the team **name** and `code` prefix (e.g. `NIL002`).
- `StepByStepLeagueSetup.tsx` is the current wizard: Association → Gender → League number → "How many?" (teams / players per team) → Preview allocation. Entirely singles-shaped.

## B. Gaps and risks

1. **No season entity.** Season is an integer on the team row only, and 162 of 190 team rows have it `NULL`. Rounds, fixtures and results have no season at all.
2. **`league_rounds` unique `(association_id, round_number)`** makes a 2027 "Round 1" impossible alongside 2026 Round 1. This is the single hardest blocker.
3. **Fixtures and rubbers are keyed by text codes/names**, not IDs. If a 2027 team reuses the `NIL002` code with a new name, historical 2026 fixture displays will resolve to the new name. History must be name-snapshotted.
4. **`NIL` and team codes are load-bearing** — `season-level.ts`, `Ladder.tsx`, NSA posting and `LeagueGames.tsx` all parse them. Codes must not change.
5. **Rubbers assume singles**: one player code per side per position. There is no way to record two players per side, so doubles cannot be represented today without faking a pair as a member — explicitly out of scope.
6. `member_league_registrations` unique `(club_member_id, league_id)` is fine per season team, but there is no roster-level notion of "eligible squad" vs "selected for this fixture".
7. `discipline` currently allows only `singles`/`doubles`; `hybrid` is not permitted by the check constraint.

## C. Target hierarchy

```text
Club
 └── League                (league_associations — PERMANENT: name, code, discipline)
      └── Season           (league_seasons — NEW: year/label, status, structure config)
           ├── Season Team (leagues rows, season_id set — name may change per season)
           │    ├── Roster (member_league_registrations, season-scoped via team)
           │    └── Pairs  (league_season_pairs — NEW, doubles/hybrid only)
           ├── Round       (league_rounds, season_id set)
           └── Fixture     (platform_league_fixtures, season_id + team IDs + snapshot names)
                └── Rubber (league_match_results, + kind singles|doubles, + explicit player IDs)
```

Permanent: league identity, code/abbreviation, discipline.
Season-scoped: teams, names, rosters, pairs, rounds, fixtures, rubbers, standings, rules overrides.

**Discipline** lives permanently on the league (a Doubles League stays a doubles league). Add an optional `discipline_override` on the season only as an escape hatch — the real-world case is a league that adds a doubles rubber to a previously all-singles format, which is better expressed as the season's *format config* (number of singles vs doubles rubbers), not a different discipline.

## D. Minimal safe schema changes

New:
- `league_seasons(id, club_id, association_id, season_year int, label text, status, starts_on, ends_on, format jsonb, is_current bool, archived_at)`; unique `(association_id, season_year)`; RLS mirroring `league_associations` (club members read, club admins write); GRANTs for `authenticated` + `service_role`.
- `league_season_pairs(id, season_id, team_id, player_a_member_id, player_b_member_id, label, active)` — explicit member IDs, never fake members.
- Season format config (in `league_seasons.format` or a small `league_season_format` table): `singles_rubbers`, `doubles_rubbers`, `team_size`, `pairing_policy` = `fixed_season` | `per_fixture`.

Altered (all additive, nullable-first):
- `leagues.season_id`, `league_rounds.season_id`, `platform_league_fixtures.season_id` — all nullable at first, backfilled, then made required for new rows only.
- `league_rounds`: drop unique `(association_id, round_number)`, replace with unique `(association_id, season_id, round_number)`.
- `platform_league_fixtures`: add `home_team_id`, `away_team_id` (FK to `leagues`) and `home_team_name_snapshot`, `away_team_name_snapshot`. Keep the existing text codes untouched for NSA compatibility.
- `league_match_results`: add `rubber_kind` (`singles`|`doubles`, default `singles`) and `home_player_ids uuid[]` / `away_player_ids uuid[]` alongside the existing text codes.
- `league_associations.discipline` check constraint extended to include `hybrid`.
- Indexes on every new `season_id` column and on the new team-ID columns.

Nothing is dropped or renamed. Existing columns keep working, so old code paths continue to function during rollout.

## E. Adaptive wizard flow

Create New League: Name, abbreviation/code, discipline (Singles / Doubles / Hybrid), initial season (defaults 2026).
Open existing league: current-season selector + status badge + **Create New Season** (defaults to next year, editable, with "Copy structure from <prev>" that copies team shells/format but never edits the historical season).

Season setup wizard, one engine with discipline-driven questions:

| Step | Singles | Doubles | Hybrid |
|---|---|---|---|
| Structure | teams, players per team | teams, pairs per team | teams, singles rubbers, doubles rubbers, squad size |
| Teams | create/rename season teams | same | same |
| Allocation | players → teams | build pairs, pairs → teams | players → squad, then mark singles/doubles availability |
| Pairing policy | n/a | fixed for season vs per fixture | per component |
| Rounds | unchanged | unchanged | unchanged |

Singles behaviour, including the existing "How many?" step and preview allocation, is preserved exactly.

## F. Doubles and hybrid selection model

- A pair is two real member IDs. Pairs never become members.
- `pairing_policy = fixed_season`: pairs are created up-front and default into every fixture.
- `pairing_policy = per_fixture`: pairs are chosen at team-selection time.
- At selection, each fixture rubber records its resolved player IDs into `league_match_results.home_player_ids` / `away_player_ids` and is **locked with the result**, so later pairing changes never rewrite history.
- Hybrid eligibility: one person, one member row, appearing in the squad once. Selection validation blocks the same member from being in two rubbers of the same fixture unless the season format explicitly permits it.
- Standings derive from the sum of all rubbers of a fixture regardless of kind — no separate doubles points path.

## G. 2026 backfill plan

1. Snapshot counts: teams 190, rounds 10, registrations 1196, fixtures 1216, fixture results 142, rubbers 658.
2. For each internal/region association with activity, create one `league_seasons` row for 2026 (`is_current = true`).
3. Set `leagues.season_id` for the 28 rows already marked 2026, then for the 162 `NULL` rows — these are backfilled to 2026 **only** where the association has 2026 activity; otherwise flagged for admin review rather than guessed.
4. Backfill `league_rounds.season_id` and `platform_league_fixtures.season_id` from their association's 2026 season.
5. Resolve `home_team_id`/`away_team_id` from the existing team codes and write name snapshots. Any fixture whose code does not resolve is reported, not silently dropped.
6. Re-run the same counts and assert identical totals plus zero remaining `season_id IS NULL` rows in scope. Every step is additive, so rollback is `UPDATE ... SET season_id = NULL` / dropping the new columns — no data is rewritten or recreated.

## H. Phased order

1. Phase 0 — extend `discipline` to include `hybrid`; no behaviour change.
2. Phase 1 — `league_seasons` table + backfill 2026 + validation query (read-only UI shows current season).
3. Phase 2 — season_id on rounds/fixtures, round unique-constraint swap, team IDs and name snapshots on fixtures.
4. Phase 3 — Create New Season UI + season selector; wizard refactor to the single engine (singles output byte-identical to today).
5. Phase 4 — doubles: pairs table, pairing policy, selection UI.
6. Phase 5 — hybrid: format config, mixed rubbers, standings from all rubbers.

Each phase has its own migration and its own rollback point; tests cover season derivation, round uniqueness per season, historical-name stability after a rename, singles-parity regression, pair locking, and hybrid standings math.

## I. Interaction with the Nelspruit work

No conflict. The rename to "Nelspruit Singles League", the `NDL` doubles league and the `discipline` column already exist in the database and are exactly the permanent-league shape this plan assumes. Safest order is: publish the pending Nelspruit UI work first (it is preview-only right now), then start Phase 0. `NIL` and all team codes stay untouched throughout.
