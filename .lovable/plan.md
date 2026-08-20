# League / team data model — findings and safe path forward

## Part A — How it works today (verified)

### 1. What is persisted when an admin creates a league
The `leagues` table has **no level column**. Columns are: `id`, `club_id`, `association_id`, `name`, `code`, `captain_member_id`, `nsa_team_id`, `nsa_team_code`, `reserves_per_team`, `logo_url`, `allow_cross_gender_guests`, `affects_ranking_points`, timestamps.

There is **no canonical numeric/enum level (1/2/3)** and no "First League" enum. A row in `leagues` is in practice a **TEAM** ("Boomslangs"), not a league level.

### 2. Stable id and where the level lives
The stable id is `leagues.id` (uuid) — e.g. Nelspruit `Boomslangs = 2705e33c-…`, `Apex Eagles = 53f19fb3-…`, `1st L Reserves = 051de72b-…`. Every team also carries a stable club-scoped `code` (`NIL002` … `NIL029`).

The "1st / 2nd / 3rd League" classification is **not stored on the team row at all**. It is *derived at read time* from fixtures:
- `league_rounds.name` holds the level text, e.g. `"1st League round 1"`, `"2nd League round 2"` (8 rounds exist for Nelspruit, all 2026, all under `association_id = 64eac759-…`, the tenant association).
- `platform_league_fixtures` rows for those rounds carry `home_team_code` / `away_team_code` (`NIL019`, `NIL022`, …) and `association_id = 3b0ca049-…`, the **platform** association (`league_associations.platform_association_id`).
- Code strips the trailing "round N" from the round name and votes a tier per team code.

So the level is a **string parsed from round names**, joined to teams via `code`, not a stored attribute.

### 3. How teams link to a parent league
They don't — there is no parent-league table or FK. A team's only structural parents are `club_id` and `association_id`. Team ↔ level is the fixture-derived inference above.

### 4. Reserves
Reserves are ordinary `leagues` rows named "1st L Reserves", "2nd Reserves", "3rd L Reserves", "4th L Reserves" (codes NIL007/016/028/029). They play no fixtures, so they never get a fixture-derived tier; the level is read out of their own name. Player membership is `member_league_registrations` with `is_reserve = true` (Nelspruit: 18/18/18/8 reserve registrations respectively).

### 5. Can the hierarchy be derived for Nelspruit today?
**Yes — reliably, but only by inference, not by stored data.** All four levels have 2026 rounds with fixtures covering the team codes, and the four reserves squads name their own level. `src/components/club-admin/LeaguesTab.tsx` already renders exactly this tree correctly (fixture tier → name ordinal → reserves-anchor → "Other").

### 6. Why the tournament selector still shows a flat list
**A query bug, not missing data.** In `src/components/club-admin/ClubChampsTab.tsx` (~line 1168) the tier query fetches rounds with:

```
.in("association_id", platformIds)          // 3b0ca049-… (platform)
```

but Nelspruit's `league_rounds` rows are stored under the **tenant** association `64eac759-…`. Verified: `league_rounds` grouped by `association_id` contains only `64eac759-…` (8 rows) and one unrelated id — zero rounds under any platform id. So the query returns 0 rounds → `leagueTierMap` is empty → `buildLeagueTree` finds no tier for any row → every team becomes its own orphan group → the UI looks flat ("First League Reserves", "Apex Eagles", "Baobabs", …).

`LeaguesTab.tsx` gets it right because it queries rounds by the **tenant** `assocId` and only uses the platform id for the fixtures query. A secondary contributor: `ClubChampsTab` also restricts rounds to the current calendar year, which will silently flatten the tree every January and for clubs whose season rounds sit in another year.

The hierarchy component (`LeagueSourceTree`, `buildLeagueTree`) is implemented and wired — it is simply being fed an empty tier map.

### 7–9. Assessment
- The tree can be made correct **immediately** with no schema change, by fixing the round query and reusing the same fallback ladder LeaguesTab uses.
- The tournament module already consumes **canonical league uuids** end-to-end (sources/selection/eligibility/seeding/draws use `leagues.id`); only the *grouping label* is string-derived. No downstream consumer depends on "First League" strings.
- A stored canonical level is still worth adding, because name/fixture inference breaks for new clubs with no fixtures and for renamed rounds.

---

## Part B — What should change (not implemented yet)

### Stage 1 — Fix the selector (no schema change, no data change)
In `ClubChampsTab.tsx`:
- Query `league_rounds` by the **tenant** `association_id` (the ids on `availableLeagues`), keep the platform id only for the `platform_league_fixtures` join key.
- Drop the current-year filter (or widen it to "latest season that has rounds").
- Reuse LeaguesTab's fallback chain so reserves and un-fixtured teams still land under their level: fixture tier → ordinal in own name → nearest reserves anchor by code order → ungrouped.
- Best: extract that resolution into one shared helper (e.g. `src/lib/leagues/level-resolution.ts`) used by both LeaguesTab and the tournament tree, so the two surfaces can never disagree again.

This alone gives Nelspruit: 1st League → its teams + 1st L Reserves, 2nd League → …, etc.

### Stage 2 — Add a canonical level, additive and non-destructive
- Migration: `ALTER TABLE public.leagues ADD COLUMN level int NULL, ADD COLUMN level_source text NULL;` (`'fixtures' | 'name' | 'manual'`). Nullable, no default, no constraint changes.
- Nothing else is touched: ids, codes, `association_id`, fixtures, matches, results, ladders and registrations are untouched, so no historical data moves.
- Reads keep the existing inference as fallback whenever `level IS NULL`, so behaviour is identical for any club that isn't backfilled.
- Optional later: a `reserves` boolean instead of the `/reserves?/i` name test — also additive.

### Stage 3 — Backfill rules (conservative)
Backfill `leagues.level` only where the evidence is unambiguous:
1. **Fixtures agree** — every fixture-derived tier vote for the team's code resolves to a single level → set `level`, `level_source='fixtures'`.
2. **Own name carries a single ordinal** and there is no conflicting fixture evidence → set `level`, `level_source='name'` (covers the four reserves squads).
3. **Anything else** — no fixtures, conflicting votes, no ordinal, or two levels claiming the same team → **leave NULL**. Never guess, never overwrite a non-null `level`.

Surface the leftovers in the admin Leagues tab as a small "needs a league level" prompt with a manual picker writing `level_source='manual'`. Run the backfill as a reversible one-shot (level is additive, so a rollback is just `UPDATE … SET level = NULL WHERE level_source <> 'manual'`).

### Stage 4 — Tournament module on stored ids
No change of contract needed: sources stay arrays of `leagues.id`. The tree parent becomes `COALESCE(leagues.level, derived level)` and the parent node itself remains non-selectable (ticking it selects its children), so "First League" never becomes a persisted string anywhere. Teams stay child filters; combined draws remain an explicit organiser choice.

## Technical notes
- Files involved: `src/components/club-admin/ClubChampsTab.tsx` (tier query ~1152–1250), `src/components/club-admin/LeaguesTab.tsx` (654–781, reference implementation), `src/lib/tournaments/league-tree.ts`, `src/components/club-admin/tournament/LeagueSourceTree.tsx`.
- Tables read: `leagues`, `league_rounds`, `platform_league_fixtures`, `league_associations`, `member_league_registrations`.
- Key gotcha to encode in tests: `league_rounds.association_id` is the **tenant** association, `platform_league_fixtures.association_id` is the **platform** association. Mixing them is the current bug.
