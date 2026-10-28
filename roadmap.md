# Roadmap
- [x] Structured play-offs after a multi-pool round robin keep the saved pairing: `buildPlayoffChain` now reads the round robin's pool count (was always 1 → "1 v 4 / 2 v 3" from pool A only). Regression tests pass; 3 pre-existing cross-league doubles failures in playoff-progression.test.ts are unrelated (reproduce without the change).
- [x] Uitsig Ladies B saved semifinal corrected to A1 v B2 / B1 v A2 (guarded SQL, provisional rows relabelled); verified live: "PLAY-OFFS · 3 games left of 3" with "POOL A #1 VS POOL B #2" / "POOL B #1 VS POOL A #2". Build OK.
- [x] "By round" list heading: structured play-off games now group under "Play-offs" instead of "Pool games" (round numbers 901+ read as "no round").
- [ ] Men's A play-offs still need the organiser to click "Save & update fixtures" on the Play-offs step — with the fix it will attach the correct crossover semifinal/final (blocked on the user's explicit save).
- [ ] Men's A bracket shows A1 v B1 (old saved "placement" override beats the saved Semifinal crossover timeline) — fix precedence and check why Save & update fixtures didn't create Men's A play-off games.
