# Roadmap

- [ ] Read-only check: explain whether the Projected label prevents Marnus booking his game with Riaan; do not change fixtures or bookings.

- [ ] Implement optional Bar tips across QR/member/counter settlement, per-staff balances, cash payouts and separate cash-up switch; customer chooses staff at self-service settlement. Await plan approval before financial changes.

- [x] Audited all 78 Uitsig championship fees against assessments and reflected payments: only Gerhard had a duplicate R60 adjustment, now reversed with balanced audit history. Fee wallet-paid; R152 opening balance retained. Assessment-based payment-preserving fix applied; six disposable PostgreSQL tests passed, hosted readback shows zero mismatches. Member statement UI not independently opened; no publication.
- [x] Included Uitsig top-up members in audit: other reflected top-ups had no replacement tournament charges; no provider/recurring handlers changed.

- [x] Restored 19 lost Uitsig allocations across screenshots/snapshot on 45-minute slots; no remaining future snapshot allocation missing, 23 future active links and zero court overlaps. Deadline reconciliation now preserves saved allocations (live before/after verified; 18 tests). Clearing mechanism supported by matching round-update timestamps; initiating actor unconfirmed. Completed withdrawals, newer allocations and personal bookings preserved; not published.

- [x] Photo-reported visitor-tab RPC ambiguity: send all six arguments explicitly; focused counter regression verified. No backend or sales changes; not published.

## Open
- [x] Final Swiss pairing pattern approved by Willem (19 Oct 2026): even halves stay equal (24 = 12/12), uneven halves put the extra player in the top group (18 = 10/8); rounds 3-5 use gaps 1v6, 1v7, 1v5 with nearest-player swaps so no two positions meet twice from round 2 on; repairs stay within halves. Rounds 1-2 and saved/played games untouched. All Swiss tests pass; not published.
- [x] Shared Swiss generation/projection no-repeat formula for ALL clubs from round 3; rounds 1–2 and saved games preserved. 290 tests passed; Uitsig screen checked read-only. Unpublished.
- [x] Explained standard Swiss score-group pairing versus fixed-position crossover.
- [ ] Database-level Swiss rematch guard and service rollout await release approval; no live deployment in this step.
- [ ] SportyHQ integration blocked on official API documentation.

## Done
- [x] Thursday 22 Oct Uitsig 20-minute rows fixed: club_champs_matches fixture query was not club-scoped, so other clubs' 20/30-minute tournaments leaked into Uitsig's grid and slot pickers. Fixture labels now filter to the current club (champ.club_id), query key includes club, query gated on myClub. Tuesday and Thursday grids verified clean 45-minute rows with games/holds correct.
- [x] Fixtures-list "Book a court" picker no longer offers occupied reserved slots: champsSlotStarts now skips holds already carrying a scheduled game (player rows present); regression test added; 7 slot tests + 13 booking-protection tests pass. No-admin-bypass rule unchanged (server trigger already blocks admins).




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
- [x] Counter mode: Member/Visitor tab choice — member search opens a linked tab, account charge without member code (staff PIN is authority); visitor keeps name+phone. NOT published.
- [x] Member account shows full purchase history (account + cash/card/online) via my_bar_purchases on the bar "My Tab" section. NOT published.
- [x] Show card/cash/online bar purchases on My Account statement (informational, no balance impact) — verify as Riverside login
- [x] Uitsig stale Swiss Round 6 removed from four saved structured stages; existing games/results/bookings untouched. Hosted read-back and signed-in Men’s C display verified five rounds; no publication.

- [x] Uitsig Men's B/C/D + Ladies A = 4 Swiss rounds (setup + running tournament)
- [x] Structure page Swiss round changes reach the running tournament (block lowering below created rounds)
- [ ] Clarify repeat-opponent swap rule with Willem (awaiting his choice)
- [x] Book a court dialog too tall on smaller screens — header stays fixed, body scrolls within 90% of the screen height
- [x] Fixture can be explicitly linked to a player's own paid GoBook booking ("Use for this fixture"); clearing/moving never cancels it (migration 0205)
