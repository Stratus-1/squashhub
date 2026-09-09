# Member dashboard: My Stats and My Rankings

Rework the member dashboard so a player sees two clean blocks — what they have played (Stats) and where they stand now (Rankings) — with detail behind taps. Everything reads from the results SquashHub already stores; no second results system is created.

## What changes on the dashboard

**Removed:** the "My Stats / Club" toggle and all club-wide figures (matches, players, average duration, club bookings). The dashboard becomes purely personal.

**Block A — My Stats (performance history)**
- Season switcher at the top: `2026` and `All Time`, built from the seasons present in the data so future years appear automatically.
- One tile per category, each showing Played, Won, Lost, Win %:
  - Club (club matches, club championships and club tournaments)
  - League
  - Regional
  - National
  - Total (all categories)
- Tiles are tappable and open a match list for that category and season.
- Layout leaves room for later additions (streak, titles) without adding them now.

**Block B — My Rankings (current standing)**
- Three compact rows: Club, Regional, National — position, points and up/down movement where a previous snapshot exists.
- A level with no data shows a quiet dash instead of an empty card.
- Existing provisional badge and its rules are reused unchanged.
- Each row taps through to the relevant ranking table with the player highlighted and the players immediately above and below shown.

## Drill-down

Tapping a category opens a mobile-first sheet:
- Chronological match list: date, opponent, competition/event, score, Win/Loss chip.
- Filter by category and season, matching what was tapped.
- Tapping an opponent switches to head-to-head: overall W/L against that person plus every match between them in date order.

## Technical approach

**Single read path.** A new security-definer RPC `get_member_match_history(_member_id, _season_year, _category, _opponent_member_id)` returns a unified, club-scoped row set assembled from the existing sources:
- `matches` (club/ladder/social)
- `club_champs_matches` (club championships and tournaments, singles and doubles sides)
- `league_match_results` joined to `platform_league_fixtures` for date and division
- `nsa_rubber_history` matched through the member's association affiliation (historical league rubbers)

Each row carries `category` (club | league | regional | national), `season_year`, date, opponent name and member id, event label, score and won flag. Category for tournament rows is derived from the tournament's owning scope (`tournaments.owner_org_id` / `event_type`), defaulting to club. A companion RPC `get_member_stats_summary(_member_id, _season_year)` aggregates the same view so the tiles and the list can never disagree. Both are `SECURITY DEFINER` with `search_path = public`, restricted to the caller's own member records or club-mates already visible to them, and granted to `authenticated` only.

**Rankings** reuse what exists: `club_members.ranking_points` plus `club_ranking_snapshots` for club movement (as the current card does), and `ranking_snapshot_entries` / `ranking_snapshots` for regional (`association_id` set) and national (`association_id` null), matched on `person_id` with `player_code` as fallback. `useProvisionalSettings` and `ProvisionalBadge` are used as-is per scope.

**Historical SportyHQ import, club by club.**
- `matches` gains two additive nullable columns: `source_type` (e.g. `sportyhq_history`) and `season_year`, so imported history lives in the existing table rather than a parallel one.
- `clubs` gains `history_import_enabled` and `history_imported_at`. The flag can only be turned on once `sla_accepted_at` is set (onboarding complete), enforced in the import function, not just in the UI.
- New edge function `sportyhq-import-history` imports one club at a time. Every source match is written with an `external_ids` row (`entity_type='match'`, `source_system='sportyhq'`, `external_id=<sportyhq match id>`), and the import skips anything already recorded — rerunning is safe and creates no duplicates.
- After import, SquashHub's own results remain the ongoing truth; imported rows only ever appear in All Time and in the season they belong to.
- A super-admin control on the club record triggers the import and shows the last run; no bulk run across all clubs.

**Files**
- Replace `src/components/DashboardMyStatsCard.tsx` with a season-aware, category-based card.
- New `src/components/dashboard/MyRankingsCard.tsx` (absorbing and retiring `DashboardRankingPointsCard`).
- New `src/components/dashboard/MatchHistorySheet.tsx` for drill-down and head-to-head.
- New `src/hooks/use-member-stats.ts` wrapping both RPCs.
- `src/pages/Dashboard.tsx` and the desktop dashboard: drop the club-stats props, mount the two blocks.

## Preserved
Existing ranking maths, provisional logic, ladder ordering, tournament and league invariants, club isolation and RLS all stay as they are. Nothing is deployed or published as part of this work.
