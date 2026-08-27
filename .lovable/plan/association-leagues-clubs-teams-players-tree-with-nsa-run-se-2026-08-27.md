# Association Leagues: clubs → teams → players tree, with NSA-run seasons

Today the NSA workspace shows the club Leagues wizard, which only knows about leagues the association tenant itself owns — hence "No associations added yet". The association needs a view of everyone else's leagues instead.

## 1. Season tree (read-first)

New **Leagues** view for association tenants: a season selector (2026 default) over a three-level tree.

```text
1st League (2026)
  Uitsig 1                     Uitsig            8 players
    Jan Botha  NSF1234  #1
    ...
  Adelaar 1                    Adelaar           6 players
Needs league assignment
  Correctional Services 1
```

- Pulls every team row of every affiliated club (156 teams across 15 clubs exist already from the NSA import), grouped by league level, then team, then registered players with league number and rank.
- Toggle to flip the grouping: **By league level** (default) or **By club**.
- Search across club, team and player name. Counters per level. Reserves flagged.
- Read-only: teams stay owned by their club; the association never silently edits a club's roster.
- Also surfaces which clubs have submitted nothing for the selected season, so NSA can chase them.

## 2. NSA-created teams for clubs not yet on SquashHub

An **Add team** action on any club in the tree lets NSA create the team row on that club's behalf (name, code, level, category, reserves flag), tagged as association-created. Players can be added as placeholder entries with name + NSF number, so fixtures and results work before the club joins. When the club later submits its own teams, the association-created rows are shown side by side and can be replaced rather than duplicated.

## 3. Rounds and fixtures, association-wide

Reuses the existing round generator (`league_rounds`, `platform_league_fixtures`) at association scope:

- **Two legs**: Round 1 home, Round 2 return (venues swap automatically), matching how the current season runs.
- Play nights (day-of-week) plus start date, weekly cadence.
- **Skip holidays**: SA public holidays for the season year are pre-loaded as skip dates and can be ticked/unticked, plus free-form extra skip dates (club shutdowns). Skipped weeks push the fixture forward, they don't drop it.
- Preview table before commit; fixtures are written per league level with home/away club and venue.

## 4. Scope and safety

- Only association admins of that tenant see this; club admins keep their existing club Leagues wizard untouched.
- No schema change to how clubs own leagues; the association reads through `association_affiliated_clubs` and writes only rows it creates.
- Row access for the new cross-club reads goes through an association-scoped policy, not a broadened public read.

## Technical notes

- New `src/components/association-admin/AssociationLeaguesTab.tsx` + `src/lib/leagues/association-tree.ts` (pure grouping/filtering, unit-tested like `league-tree.ts`).
- `AssociationDashboard.tsx` routes `leagues` to the new tab instead of the club `LeaguesTab`.
- Data: `leagues` joined to affiliated `clubs`, `member_league_registrations` for players; level grouping reuses `levelFromName`/`isReserveLeague`.
- Holiday list: static SA public-holiday table per year in `src/lib/leagues/holidays.ts` (no external API).

## Sequencing

1. Tree view + season selector + search (read-only).
2. Association-created teams and placeholder players.
3. Two-leg round/fixture generator with holiday skipping.
