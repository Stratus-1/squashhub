# Roadmap

## In progress
- [x] Backup: dated CSV copy of Uitsig fixtures and logs → /mnt/documents/uitsig-fixture-backup-2026-10-27 (done 27 Oct)
- [ ] Partial Swiss fixture generation (opt-in, Riverside pilot): generate next-round fixtures only for mathematically settled position pairs; unsettled pairs stay ungenerated. Uitsig frozen — keeps all-or-nothing.
- [ ] Projection/preview views: show NO projected names for unsettled positions — leave the slot blank (position numbers only). Settled positions may show names.

## Constraints
- Existing Uitsig tournaments immutable (freeze). New behaviour is prospective opt-in only.
- Structural engine changes: Riverside pilot, flag-gated via club_beta_features, tests required.
