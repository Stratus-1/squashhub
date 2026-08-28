# NSA on SquashHub: mirror 2026, backfill stats, build a ranking model

Goal: SquashHub becomes NSA's admin system. Step one is to pull NSA's 2026 season into SquashHub and display it, keeping every NSA identifier so nothing double-creates when we later cut over. Alongside that, pull just enough 2024/2025 result data to power a proper player ranking.

## Phase 1 — Mirror the 2026 NSA season (read-only)

Scheduled scraper that reads NSA's public/admin pages and stores everything locally:

- Clubs, teams, leagues (level + reserve flag), fixtures, results, and per-rubber player lines.
- Every record keeps its NSA id in `external_ids` (`source_system = 'nsa'`), so re-runs update instead of duplicate.
- Players match on NSF number first, then name+club; anything ambiguous lands in a review queue rather than creating a person.
- Runs nightly plus an on-demand "Sync from NSA" button on the association dashboard, with a sync log (records seen / created / updated / skipped).

Display: NSA-sourced fixtures and results appear in the existing association Leagues and Fixtures screens, tagged **From NSA** and locked from editing while NSA is still authoritative.

## Phase 2 — Stats-only backfill for 2024 and 2025

We don't import full admin history — only what the ranking needs per rubber:

- Season, league/level, team, player, the position (string) they played, opponent, and win/loss with games.
- Stored as archived seasons so they never appear in active selectors.

## Phase 3 — Ranking model

Ranking is earned per rubber and reflects *where* a player competes, not just how often they win. Proposed formula:

```text
rubber points = base(result) x league_weight x position_weight x opponent_factor
season score  = sum of rubber points, capped to best N rubbers
ranking score = 2026 x 1.00 + 2025 x 0.50 + 2024 x 0.25
```

- **base(result)** — win 10, loss 3 (losses still reward turning up), plus a small bonus for a 3-0 win and for a loss taken to 5.
- **league_weight** — higher leagues are worth more (1st League 1.00, each level down x0.85, reserve teams x0.70). Configurable per association.
- **position_weight** — playing String 1 counts more than String 5 in the same league (String 1 1.00 down to about 0.80), so a player can't farm points at the bottom of a strong team.
- **opponent_factor** — beating a higher-ranked player scales up, beating a much lower-ranked one scales down. Uses the previous ranking snapshot so it's stable within a run.
- **Best N** — protects players who play fewer fixtures; N configurable (default 12).
- Every component is stored on the ledger row, so a player's ranking is fully explainable ("this is where your points came from").

Recalculated nightly and after each result, with a stored snapshot per run so movement (up/down arrows) can be shown.

Screens: association Rankings tab (filter by league, gender, club) and a personal ranking panel with the points breakdown.

## Phase 4 — Cutover (decide later)

Built so either path works: keep posting results out to NSA while mirroring in, or flip SquashHub authoritative and turn the outbound post off. A reconciliation report flags any fixture where SquashHub and NSA disagree.

## Technical notes

- Scraping via a Deno edge function using the existing NSA session/credential handling, run on a cron schedule; Firecrawl as a fallback for pages that need JS rendering.
- New tables: `nsa_sync_runs`, `nsa_sync_issues` (review queue), `ranking_snapshots`, `ranking_rubber_points`; reuse `external_ids`, `platform_league_*`, `people`, `league_seasons`.
- Ranking weights live in an association-scoped settings row so NSA, Lowveld and others can tune independently.
- Ranking maths lives in `src/lib/rankings/` with unit tests before any UI is wired.

## Open items to confirm with NSA

- Permission to scrape and, ideally, a data export for 2024/2025 rather than crawling.
- Whether their position/string labels are consistent across seasons (affects position_weight).
