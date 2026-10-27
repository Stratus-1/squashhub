# Roadmap

## In progress
- [x] Backup: dated CSV copy of Uitsig fixtures and logs → /mnt/documents/uitsig-fixture-backup-2026-10-27 (done 27 Oct)
- [x] Projection/preview views: no projected names for unsettled positions (done earlier)
- [ ] Remove the Uitsig hard freeze entirely (Willem, 27 Oct — backup exists, auto generation wanted from now on)
- [ ] Partial Swiss fixture generation: certified settled pairs + full RR block (Rounds 3–5) once post-R2 positions provably final; remainder stays incremental
- [ ] Enable `tournament_swiss_partial_rounds` flag for Uitsig club; rebuild + deploy auto-progress engine; generate & verify Men's C/D R3–5 fixtures with play-by deadlines, no auto court bookings
- [ ] Update freeze memory + issue log; run tests

## Constraints
- Structural engine changes: flag-gated via club_beta_features, tests required.
