# Roadmap

## Open
- [ ] Thursday 22 Oct Uitsig grid shows stale 20-minute championship rows — root cause: projected fixtures from OTHER tournaments (20- and 30-min durations, courts 37–39, 20/24/26) leak into the bookings grid's championship layout. Filter projections to the club's actual reserved tournaments / courts, or exclude non-reserved tournaments from the grid's champ layout.
- [ ] Fixtures-list "Book a court" picker shows tournament slots for Tuesday that are not actually available; must be consistent with Monday's correct behavior and respect the no-override rule for admins too.



## Open
- [ ] Fixture-aware picker filtering and authenticated end-to-end rejection remain unverified; server protection is applied.

## Done
- [x] Uitsig grid always uses saved 45-minute slots: club settings now merged live (no 30-minute fallback); Wed 21 Oct verified 05:15–21:45 in 45-min rows, no duplicates. Tournament setup re-checked: every duration is 45. Not published.
- [x] Uitsig Club Champs setup, all eight category durations, planning guide and both scheduling copies set to 45 minutes; other tournaments unchanged.
- [x] Six approved 21/22 Oct fixtures rescheduled through protected authenticated RPCs; saved booking intervals verified at exactly 45 minutes, same dates/courts. Built-in in-app schedule notifications applied.
- [x] Grid prefers configured duration; signed-in Uitsig Wednesday preview verified normal 45-minute rows and relocated games. Fixture slot generation now supports 45 minutes; 28 focused tests passed. Frontend changes not published.
- [x] Gerhard/Jason's conflicting booking cancelled with history retained; fixture unscheduled. Nico/Johann restored to Court 1, 20 Oct 18:00; read-back verified.
- [x] Server rejects bookings over scheduled, unlinked championship games for players and admins; six isolated PostgreSQL regression checks passed. No publication.
- [x] Published 18 Oct 2026: champs-slot fixes (grid display, 35-min reschedule slots, freed old slot), reserved-court 35-min time column, recurring transactions, average-cost fill-in, two-decimal money display, cost-per-tot hint on purchase lines, WhatsApp/SMS switches, Enter Transaction date fix, dialog size fix
- [x] Security scan run before publishing: 30 findings, all previously dismissed by Willem, none unresolved
- [x] Shared grid rows retain every game; four regression tests and signed-in Riverside fictional 35-minute sequence verified, including opening the middle booking
- [x] Court grid shows 35-min champ games on every 45-min row they overlap — verified live on Uitsig Wed 21 Oct
- [x] Reschedule dialog offers the champs' own 35-min slots inside the reserved evening; 45-min club slots stay outside champs times
- [x] Moved champ game leaves its old slot available (hold no longer restored on move) — applied to the backend
- [x] 118 tournament tests pass, types clean, build OK, server engine rebuilt
