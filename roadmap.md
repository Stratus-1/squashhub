# Roadmap

## In progress
- [x] Backup: dated CSV copy of Uitsig fixtures and logs → /mnt/documents/uitsig-fixture-backup-2026-10-27 (done 27 Oct)
- [x] Projection/preview views: no projected names for unsettled positions (done earlier)
- [x] Remove the Uitsig hard freeze entirely (done: policy neutralised, tests updated, engine rebuilt+deployed)
- [x] Progression log: unsettled players show TBD in Round 3 preview; verified in preview, publish scheduled
- [x] First generation run: Men's C R3/R4 certified fixtures + Men's B 2 created; Men's D correctly nothing (unsettled); walkover trigger auto-completed Tarryn v Brett (Brett withdrawn)
- [ ] BLOCKED on Willem: Men's C/D Round 5 is configured "club"-scheduled (not play-by) with same date as R4 (12 Nov) — pre-existing since 21 Oct; needs decision before R5 fixtures generate
- [ ] Verify published site shows the corrected progression log
- [ ] Partial Swiss fixture generation: certified settled pairs + full RR block (Rounds 3–5) once post-R2 positions provably final; remainder stays incremental
- [ ] Enable `tournament_swiss_partial_rounds` flag for Uitsig club; rebuild + deploy auto-progress engine; generate & verify Men's C/D R3–5 fixtures with play-by deadlines, no auto court bookings
- [ ] Update freeze memory + issue log; run tests

## Constraints
- Structural engine changes: flag-gated via club_beta_features, tests required.
