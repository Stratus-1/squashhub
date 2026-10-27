# Roadmap

## In progress
- [x] Backup: dated CSV copy of Uitsig fixtures and logs → /mnt/documents/uitsig-fixture-backup-2026-10-27 (done 27 Oct)
- [x] Projection/preview views: no projected names for unsettled positions (done earlier)
- [x] Remove the Uitsig hard freeze entirely (done: policy neutralised, tests updated, engine rebuilt+deployed)
- [x] Progression log: unsettled players show TBD in Round 3 preview; verified in preview, publish scheduled
- [x] First generation run: Men's C R3/R4 certified fixtures + Men's B 2 created; Men's D correctly nothing (unsettled); walkover trigger auto-completed Tarryn v Brett (Brett withdrawn)
- [x] Willem decided: Men's C/D Round 5 → play-by, deadline 19 Nov (correct the club-scheduled setting)
- [x] Applied R5 correction (groups 3+4 → self/19 Nov), generation created Men's C R5 fixtures (Justin v Kamfer, du Rand v Eben, by 19 Nov); Men's D correctly none; issue log appended
- [x] Verified published site: Men's C Round 3 shows real fixtures and TBD at positions 5/10 (no projected names)
- [x] AGM ballot: Club Manager position now allows up to 3 choices (verified in DB; existing votes unaffected)
- [ ] Partial Swiss fixture generation: certified settled pairs + full RR block (Rounds 3–5) once post-R2 positions provably final; remainder stays incremental
- [ ] Enable `tournament_swiss_partial_rounds` flag for Uitsig club; rebuild + deploy auto-progress engine; generate & verify Men's C/D R3–5 fixtures with play-by deadlines, no auto court bookings
- [ ] Update freeze memory + issue log; run tests

## Constraints
- Structural engine changes: flag-gated via club_beta_features, tests required.
