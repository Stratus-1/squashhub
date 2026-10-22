# Swiss final-round sequencing

## Changes
- Audit shared Swiss generation, projections and saved round boundaries.
- Add adjacent-current-rank pairing as a final-round preference for full Swiss fields and independent hybrid Swiss cohorts, using each division's configured final round.
- For earlier rounds, prefer fair legal pairings that keep final-round adjacency available where possible. Never guarantee future participants or repeat opponents.
- Keep locked RR groups, saved rounds and approved exact-chart displays unchanged; explain unavoidable final-round exceptions.

## Critical Uitsig safety override
- Freeze all existing Uitsig tournament/category identities against sequencing activation or regeneration; preserve their pairing/progression rendering and saved records exactly, including approved imperfections.
- Activate the optimizer only through a prospective tournament-scoped policy on newly generated tournaments. Existing records without that policy retain the previous algorithm. No setup-save or view-triggered adoption, migrations, backfills or global background regeneration.
- Corrections to existing Riverside test tournaments require explicit scoped approval; no saved games are changed by this implementation.

## Technical details
- Use one pure optimizer shared by generation and projections, preserving ranking, opponent history, existing locked fixtures and fair bye selection.
- Extend focused tests for six-player hybrid, four/five-round full Swiss, rank changes, no repeats, odd cohorts and final-round conflicts; assert legacy/Uitsig inputs unchanged and policy denial.
- Validate Riverside preview read-only with write requests blocked; refresh the local server bundle only if required. No hosted mutations, notifications, deployment or publication.

## Limitations
- Future results may change rankings, so earlier-round lookahead can preserve opportunities but cannot guarantee final adjacent pairings.
- If no complete legal matching exists, stop with an explicit issue rather than introduce a repeat.
- Post-deployment hosted byte-for-byte checks are deferred because deployment is not authorized; run read-only before/after preview fingerprints now.