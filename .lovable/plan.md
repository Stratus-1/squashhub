# Season Architecture — Non-Destructive Validation Report

Read-only validation. Nothing was migrated, changed or deployed. All rehearsal numbers below come from read-only queries against live data (simulated joins, no writes).

## 1. Text-code dependency audit

`home_team_code` / `away_team_code` / team codes / names appear in 331 code locations. Classified:

| Path | Usage | Class |
|---|---|---|
| `nsa-sync-fixtures`, `nsa-proxy` (import + result posting) | fixtures matched and upserted by `external_id` + upper-cased codes; codes parsed out of NSA titles | **C + B** — functional key and export field |
| `platform_league_fixtures` rows | the *only* team reference on a fixture is the text code; there is no team FK | **C** |
| `LeagueGameDetail` (lineups, rules, prefill, squads, scorecard) | `teamRulesByCode[code.toUpperCase()]`, `lineup[home_team_code]`, `originalsMap[code]`, `codesFromLive(code)` | **C** |
| `league_match_results` rubbers | `home_player_code` / `away_player_code` text, `position` int | **C** (player-level, same class of risk) |
| `InternalStandingsTab` | groups by `home/away_team_code`, maps code → `leagues.name`/`logo_url` for display; season implied by `round_date` year filter | **C for grouping, A for name** |
| `StandingsTab` (NSA) | rows keyed by `team_code`, "my team" match on `nsa_team_code || code` | **C** |
| `league-awards.ts` (stats/history) | per-team and per-player aggregation keyed by code | **C** |
| `season-level.ts` | falls back to parsing `leagues.name` and the `code` prefix (e.g. `NIL002`) when `season_year`/`level` are null | **D** — hard-coded parsing |
| `Ladder.tsx` / `ladder-impact.ts` | ladder effects gated by `league_associations.affects_ladder`, joined via team rows | **C**, but association-level, not code-level |
| `LeagueGames.tsx` | `"NIL"` hard-coded fallback abbreviation | **D** |
| Notifications / bulk bookings / marker setup | code shown in labels | **A** |

Places where a rename or a season change alters historical behaviour: every **C** row above. Because a fixture stores only a code, and the code→name map is a live lookup into `leagues`, **renaming a team rewrites the displayed name of all its past fixtures, standings rows and awards**, in every season.

## 2. Team rename safety test — **FAIL** under current schema

Simulated on the real data model (Nelspruit platform association `3b0c…`, 152 fixtures, 8 rounds, 28 season-2026 teams):

- 2026 fixture rows hold `home_team_code = 'NIL002'`; the display name comes from `leagues.name` where `code = 'NIL002'`.
- Renaming that row `Cobras → Harlequins` immediately relabels the 2026 fixtures, standings and awards — history does **not** stay stable.
- Creating a *second* team row for 2027 with the same code makes the code→team lookup return two rows. The lookup code (`InternalStandingsTab` map by code, `teamRulesByCode`, `useNsaTeamByCode`) takes whichever row wins — silently ambiguous.
- Evidence that the code space is currently assumed unique: exactly **one** duplicate code exists today (`CSI001`, two differently-named teams, both `season_year NULL`) and it is already a latent ambiguity bug.

Conclusion: **team-ID references on fixtures plus historical team-name snapshots are necessary.** There is no configuration of the current schema that passes this test.

## 3. Season-scoping validation

| Entity | Season-scoped today? | Evidence |
|---|---|---|
| `league_associations` | No — and correctly so (permanent league) | 24 rows, no season column |
| `leagues` (season teams) | Partially | `season_year`: 28 rows = 2026, **162 rows NULL** (16 associations) |
| `league_rounds` | No | no season column; 10 rows, all `round_date` in 2026; unique `(association_id, round_number)` |
| `member_league_registrations` | Indirect only (via team) | 1196 rows; unique `(club_member_id, league_id)`; 176 attach to 2026 teams |
| `platform_league_fixtures` | No | 1216 rows; season only inferable from `fixture_date` (all 2026: 2026-04-13 → 2026-09-15) |
| `league_fixture_results` | No | 142 rows, keyed only by `fixture_id` |
| `league_match_results` | No | 658 rows, keyed by `fixture_id` + `position` |
| `league_fixture_lineups` / `league_week_lineups` | No | 0 / n rows, keyed by `league_id` (team) + `week_start_date` |
| `league_rules` | No | 194 rows, per team/association |
| Standings | Pseudo-scoped by date | `InternalStandingsTab` filters rounds `round_date` between `YYYY-01-01` and `YYYY-12-31` |
| Standings DB functions/views | None exist | no Postgres function references `league_fixture_results` or `home_team_code` |

**Round-number collision — confirmed FAIL.** `league_rounds_association_id_round_number_key` is `UNIQUE (association_id, round_number)`. A 2027 "Round 1" for the same association is rejected outright. Replacing it with `UNIQUE (association_id, season_id, round_number)` permits 2026 Round 1 and 2027 Round 1 to coexist while still preventing duplicates within one season.

**Additional finding not in the earlier plan:** `platform_league_fixtures.association_id` points at the *platform* association, which is shared by many clubs (19 tenant `league_associations` rows mirror the single NSA platform row `b1cb…`). A naive tenant-scoped season join fans out 1216 fixtures into 16112. **Seasons for fixtures must be platform-association-scoped, not club-scoped**, or the backfill will duplicate rows.

## 4. Migration rehearsal (read-only simulation)

BEFORE (live, integrity signatures):

| Signal | Count |
|---|---|
| league associations | 24 (2 platform associations carry fixtures) |
| season teams (`leagues`) | 190 — 28 tagged 2026, 162 NULL, 0 archived |
| rounds | 10 (all `round_date` in 2026; 2 associations) |
| registrations | 1196 (176 on 2026 teams) |
| fixtures | 1216 (Nelspruit platform 152, NSA platform 1064) |
| lineups (`league_fixture_lineups`) | 0 |
| aggregate fixture results | 142 · id-signature `f4fa443c…` |
| rubbers (`league_match_results`) | 658 · id-signature `eb567364…` |
| standings points signature (sum home+away total points) | 3465 |

Simulated additive backfill (2 seasons created, one per platform association, `season_year = 2026`):

| Step | Result |
|---|---|
| attach teams to 2026 | 28 direct; 162 NULL-season teams belong to 16 NSA club associations with **no fixtures and no rounds** — left untouched and reported, not guessed |
| attach rounds | 10 / 10 resolve by `round_date` year |
| attach fixtures | 1216 / 1216 fall inside 2026 (min 2026-04-13, max 2026-09-15) — 100% resolvable by date |
| resolve `home_team_id` | 1206 / 1216 |
| resolve `away_team_id` | 1181 / 1216 |
| BYE placeholders (`__BYE__`) | 27 — expected, no team, skip |
| **unresolved real codes** | **18 occurrences**: `CSIL01` ×9 (NSA platform), `LG001` ×3, `LG002` ×3, `LG003` ×3 (Nelspruit platform) — no matching `leagues.code`; left NULL and reported |
| fixtures with no `round_id` | 1070 (1064 NSA + 6 Nelspruit) — season comes from date, rounds stay NULL |

AFTER assertions (all additive, so provable by construction):

- records lost: **0** — no DELETE, no INSERT into existing tables, only new nullable columns
- historical IDs changed: **0**
- scores/results changed: **0** — `league_fixture_results` and `league_match_results` are not written at all; signatures `f4fa443c…` / `eb567364…` and points total 3465 unchanged
- standings totals: unchanged — standings derive from those same untouched rows
- player stats / ladder effects: unchanged — no writes to registrations, ladder, or `affects_ladder`
- historical fixture names: stable **only after** the snapshot columns are populated; until then names remain live lookups (see §2)
- mis-scoped records: **0** — every scoped row is assigned from its own association + its own date, never inferred across associations

## 5. Season-aware UX requirements

Season selector at the league module level, defaulting to the current season, persisted in the URL (`?season=`) and in the league module context so navigating Standings → Fixtures → Rosters cannot mix years.

Views to make season-aware: Standings, Fixtures list, Results/history, Team rosters/registrations, Round management, Team selection/lineups, league-context stats and awards.

**Standings specifically** (`InternalStandingsTab`): today it derives tiers from `league_rounds` filtered on `round_date` between `<year>-01-01` and `<year>-12-31`, then loads fixtures by `round_id`, then maps codes → names via a `leagues` query filtered only on `association_id`. Required changes, none of which alter 2026 totals:

1. Replace the `round_date` year filter with `.eq("season_id", seasonId)` — for 2026 this selects exactly the same 10 rounds.
2. Filter the code→name map query by `season_id` too, so a 2027 team named Harlequins cannot relabel 2026 rows.
3. Prefer the fixture's `home_team_name_snapshot` when present, falling back to the current lookup — identical output for 2026 because snapshots are backfilled from the current names.
4. Replace the hard-coded `CURRENT_YEAR ± 2` season dropdown with the league's real season list.

`StandingsTab` (NSA) needs the same season filter on its team-code map; its aggregation itself is unchanged.

## 6. Safety sign-off

| Check | Verdict |
|---|---|
| Team rename safety under current schema | **FAIL** — rename rewrites history; reused codes become ambiguous |
| Round reuse across seasons under current schema | **FAIL** — `UNIQUE (association_id, round_number)` blocks 2027 Round 1 |
| Historical standings preservation in the rehearsed additive migration | **PASS** — zero writes to results/rubbers; signatures and 3465-point total unchanged |
| Additive backfill resolvability | **PASS with 18 reported exceptions** (`CSIL01`, `LG001-003`) |

Hard-coded / text-key dependencies to fix before or during implementation: fixture team codes as the only team reference; `teamRulesByCode`; lineup maps keyed by code; awards aggregation by code; `season-level.ts` name/code parsing; `"NIL"` fallback in `LeagueGames.tsx`; NSA sync's upper-cased code matching (must stay, it is the export contract).

Required changes before implementation:
- `league_seasons` table keyed to the **platform** association for fixtures and to the tenant association for teams/rounds.
- Nullable `season_id` on `leagues`, `league_rounds`, `platform_league_fixtures`; indexes on each.
- Swap the rounds unique constraint to `(association_id, season_id, round_number)`.
- `home_team_id` / `away_team_id` + `home_team_name_snapshot` / `away_team_name_snapshot` on fixtures; keep the text codes untouched for NSA.
- Unique `(association_id, season_id, code)` on season teams — this also surfaces the existing `CSI001` duplicate for manual cleanup rather than fixing it silently.
- RLS + GRANTs on `league_seasons` mirroring `league_associations`.

Rollback: every step is additive. Rollback is `UPDATE … SET season_id = NULL` followed by dropping the new columns/table and restoring the old rounds unique constraint. No existing row is rewritten at any point, so there is no data to restore.

Recommendation: **safe to implement**, in this order — (1) additive schema + backfill with the 18 exceptions reported to the admin, (2) snapshot/team-ID population, (3) constraint swap, (4) season-aware read paths, (5) only then the Singles/Doubles/Hybrid work. Do not begin discipline work until (4) is verified, because standings must be season-filtered before a second season can exist.

## 7. Competition category/division — first-class requirement (added, applies to Phase 3+)

Every league/competition — Singles, Doubles and Hybrid alike — carries a **competition category**: `mens`, `ladies`, `mixed`, `open`.

- `open` is **not** a synonym for `mixed`. Open permits any eligible combination regardless of gender; Mixed only enforces mixed-gender composition when the league rules say so.
- No gender assumption is hard-coded into Doubles: Men's Doubles, Ladies Doubles, Mixed Doubles and Open Doubles are all valid.

### Model

- `category` column (enum-like text, constrained to the four values) on the competition/division entity, alongside the existing `leagues.division` label and the planned `discipline` (singles/doubles/hybrid). `division` stays the NSA-facing competition label; `category` is the normalised, rule-bearing attribute.
- Nullable and additive. **Backfill only where provable** (e.g. an unambiguous NSA division label such as `Ladies 1st` → `ladies`, `Mens 2nd` → `mens`); anything ambiguous stays NULL rather than being guessed. Legacy rows are never rewritten.

### Where category participates

1. **Uniqueness** — NSA team codes legitimately repeat across categories. Code uniqueness must be scoped by `(association_id, season_id, division/category, code)`, extending the Phase 2.1 index rather than replacing it. `nsa_team_code` uniqueness per association+season is unchanged.
2. **Fixture/team resolution** — the division/category-scoped lookup in `src/lib/leagues/fixture-display.ts` (`buildTeamNameIndex`) becomes category-aware; the code-only fallback stays blanked whenever a code is ambiguous across categories.
3. **Eligibility** — replaces ad-hoc gender gates: mens/ladies restrict by member gender; mixed validates pair/team composition **only if** the league rules require it; open never restricts by gender.
4. **Filtering/UI** — category is a selectable attribute in the Singles/Doubles/Hybrid setup wizard and a filter on fixtures, standings, rosters and tournament division pickers.

### Tests (gate for the phase that ships this)

- Duplicate team codes across two categories in the same association+season are **accepted**; a duplicate within one category is **rejected**.
- Fixture resolution returns the correct team when the same code exists in Men's and Ladies (extends the existing `CSI001`/`CSIL01` cases).
- All four category options are offered and persisted for Singles, Doubles and Hybrid setup.
- Mixed pair validation passes/fails per rules flag; Open accepts any gender combination; Men's/Ladies reject out-of-category players.
- Existing integrity signatures and the 3465 standings-point total remain unchanged.

Phase gates are unchanged: any failing gate blocks the phase, and nothing is published while a gate fails.
