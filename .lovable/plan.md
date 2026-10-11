# Simplify Riverside’s playoff setup dialog

- Replace redundant format and Singles/Doubles questions with saved category information in the Riverside pilot only.
- For its single Swiss standings group and configured Quarterfinal, preview Top 8 seeded pairings (1v8, 4v5, 2v7, 3v6), with actual player names.
- Keep inherited scoring, saved date/court information, and existing Check/Create controls. Missing or contradictory settings block creation rather than guessing.
- Leave multi-pool round-robin qualification controls available where needed; preserve configured doubles pairs.
- Preserve every saved stage, including the Final in the setup plan. Do not attach stages, generate fixtures, change results, send messages, or publish during this work.

## Technical scope and checks
- Scope the new dialog presentation/preflight to Riverside plus its existing `tournament_beta` opt-in, failing closed. Other clubs retain their existing dialog and all shared generation, database, and function code stays unchanged.
- Reuse the existing Swiss ranking and mapping/preflight engine. No Swiss-count or winner-progression changes.
- Add regression tests for Swiss seeded setup versus round-robin pools and non-pilot compatibility.
- Verify the actual Riverside dialog on desktop/mobile with all backend mutations and function calls blocked; do not click Create.