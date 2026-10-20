# Roadmap

- [ ] NSC ladder follow-up: allow higher-ranked opponents in own pyramid row and directly-above row; verify saved settings and confirmed-result movement for Stiaan vs Leone; preserve pending verification and avoid unrelated ladder reshuffles.

- [x] NSC Stiaan vs Leone: owner-reported 3–1 saved pending verification, one notice/email queued, audited; game scores absent and positions unchanged. No existing challenge; same-row pyramid restriction and old outgoing challenge preserved. Profile shortcut now opens the selected opponent via existing ladder checks; preview only. Member submission not exercised; Riverside Super Admin check only.

- [x] Shared category calendar: all saved tournament fixtures visible, selected category green; undated games listed. 18 checks pass; signed-in fictional Riverside RR and Swiss categories checked, day view shows 15 fixtures (11 selected/4 other), month totals and detail opening verified. Preview only; no data changes/publication.

- [x] NSC tonight's doubles test scores cleared: two rubbers audited/reset, two pending test ranking awards rejected, stale marker lock released. All 15 rubbers unscored; affected signed-in scorecards read back blank. Fixtures/players/bookings retained; devices must reload before real scoring.

- [ ] Uitsig Men's B final uploaded 24-player chart: confirm whether the four R3/R5 repeated position pairs are intentional exceptions before applying to preview; saved games/live data unchanged.

- [x] Exact uploaded 18-player five-round chart applied to Uitsig Men's C proposed view only, with explicitly approved repeats. 38 tests pass; authenticated Men’s C preview opened and checked. Saved rounds stay factual (so may differ from chart); default generation and other clubs unchanged. No publication or live-data changes.

- [x] Revised 24-player proposed preview: R4 1v4/2v3, R2 duplicate 5v8/6v7 switched to 5v7/6v8; R5 adjacent finals. Provisional R3 collisions switched; no repeated position pairs. 58 tests pass; fictional-player browser preview visibly checked R4/R5. Live engine/saved fixtures unchanged; no publication. Real tournament flow not independently rechecked.

- [x] GoBook duplicate-identity correction deployed to API/sync; 35 synthetic checks pass. Two authenticated live refreshes return 200; Uitsig Book court opens, refreshes and offers tonight's 19:30 Court 4 free slot. No player booking submitted, no GoBook booking/cancellation or hardware command; final player submission intentionally untested.

- [x] Replaced Member sales/Card sales with Closed tabs, payment-method subcategories and order totals; nine focused checks pass and authenticated Riverside report/filter reads have no errors. Frontend-only, preview-only; no sales writes.

- [x] Source-only cancellation refresh: both GoBook sync paths remove missing unused holds at any time, preserve championship players/fixture links, abort on ownership-read errors; page reload no longer reuses a three-minute sync cache and successful sync refreshes hold restrictions. Activation awaits deployment approval.
- [x] Clarified GoBook authority implemented in source: current holds import after noon, absent unused holds cancel; API fixture picker refreshes selected dates and confirmation, fails closed on read errors, has no free fallback, and permits additional dates. Cancelled holds yield no free starts. No live writes/deployment/publication.
- [x] GoBook-authoritative capacity activated with prior explicit approval: API/sync deployed and old noon/Friday release jobs disabled. Supersedes local noon release. Member booking submission deliberately not performed on live games.

- [x] Noon release diagnosed: cron ran but GoBook reactivated seven unused holds. Source fixes shared cutoff for both sync paths, preserves linked/member rows, and confines ordinary booking restrictions to the selected day. Synthetic tests pass; no live bookings/external calls/hardware touched.
- [x] Noon-release sync fix superseded by approved GoBook authority; Gerhard controls external holds, no automatic local noon release.

- [x] Fix confirmed Swiss play-by generation in shared/server source: known next-round pairings save without court bookings, use their target round deadline, preserve existing games; 51 tests passed including synthetic Riverside writer readback/idempotency and participant booking permissions. Bundle regenerated locally; preview build OK.
- [x] Approved Uitsig repair: saved 12 confirmed missing Round 2 games (Mens B 2, C 4, D 6), all with saved 29 Oct play-by deadline and pending notices; zero automatic court bookings. No confirmed missing Round 3 pairings yet. Marnus–Riaan saved and visible in authenticated admin Log View; player-session booking not exercised. No deployment; future automatic server activation still awaits explicit deployment approval.

- [x] Priority follow-up: hosted read-only check confirms zero saved Marnus–Riaan games and only their completed Round 1 games. Fixture-list code offers booking only for saved eligible games; play-by predictions are excluded by projectCourtFixtures. Therefore their projected next game is not a bookable fixture. No live changes or source repair performed; player-session UI remains unverified.

- [x] Priority read-only diagnosis: Marnus (Jacobus Marthinus Kamfer) and Riaan van Wyk both have completed Round 1 but no Round 2 fixtures. Round 2 is self/play-by; createDecidedSwissGames consumes projectCourtFixtures, which excludes applied play-by rounds and requires planned court slots. Thus the progress grid can show their names as Projected without creating a bookable match. No games/bookings/code changed; live repair requires explicit approval.
- [x] Counter cash-up built (off by default): consecutive shifts, totals per payment type incl. tips, prefilled reconciliation, counted cash + variance, tip payouts below, history. Backend added; not published; not yet exercised with synthetic Riverside shift.

- [x] Read-only: explained Projected is not a persisted bookable fixture; specific Marnus–Riaan record not inspected. No fixture or booking changes.

- [x] Added default-off tip/cash-up switches, QR/member/counter cash/terminal/account tips, named staff balances, cash payouts and separate reporting. 59 tests and fictional Riverside QR cash-request flow verified; no live sales changes or publication.
- [ ] Online tip checkout and provider settlement release awaits explicit release approval; currently fail-closed. No payment functions deployed. Cash-up workflow remains deferred beyond its switch, as approved.

- [x] Audited all 78 Uitsig championship fees against assessments and reflected payments: only Gerhard had a duplicate R60 adjustment, now reversed with balanced audit history. Fee wallet-paid; R152 opening balance retained. Assessment-based payment-preserving fix applied; six disposable PostgreSQL tests passed, hosted readback shows zero mismatches. Member statement UI not independently opened; no publication.
- [x] Included Uitsig top-up members in audit: other reflected top-ups had no replacement tournament charges; no provider/recurring handlers changed.

- [x] Restored 19 lost Uitsig allocations across screenshots/snapshot on 45-minute slots; no remaining future snapshot allocation missing, 23 future active links and zero court overlaps. Deadline reconciliation now preserves saved allocations (live before/after verified; 18 tests). Clearing mechanism supported by matching round-update timestamps; initiating actor unconfirmed. Completed withdrawals, newer allocations and personal bookings preserved; not published.

- [x] Photo-reported visitor-tab RPC ambiguity: send all six arguments explicitly; focused counter regression verified. No backend or sales changes; not published.

- [x] Counter "Top-Up member account": button on member tabs with amount entry, cash/card-at-bar confirmation, journal Dr cash|bank / Cr debtors, confirmed wallet entry, auto-settle of outstanding fees (buffer + monthly-mandate rules), idempotent. Migration 0211 applied; guard verified; build OK. Button/dialog not exercised on screen; full top-up flow not yet run with synthetic data; not published.

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
- [x] Counter 'Paid since cash-up' tab + running totals panel (method totals, tips per person, expected cash). Preview only.
- [x] Tournament messaging switch: email opponent to verify entered result
- [x] Uitsig Men's A: R1 flipped, R2 re-paired
- [x] Withdrawn-keep-position (bye) marker + automatic walkovers; Brett marked
- [x] Uitsig: Adele + Nicole removed; Ladies B 2 pools of 4, results kept
- [ ] Help Center secrets update form (paused, user interrupted)
- [ ] Pick players ignores saved 2-pool choice (investigate code; data fixed directly)
- [x] Correct result: Lisa Rahman beat Austyn 15-6,15-12,15-8 (not Lisa van Reeuwyk)
- [x] Wording: "Current standings" -> "Current positions"; Matches Won column removed (grid card, Results tab, Log View) — 11 tests pass
- [x] Ladies B pools: Yolanda -> Pool B, Jenny -> Pool A so played opponents stay together (Berni v Elizane, Austyn v Lisa Rahman, Liezel v Jenny); Liezel v Jenny restored as played (15-8,15-10,15-6); pools are one swap from pure snake
- [x] Mens B, C, D and Ladies A Swiss groups: five rounds each (setup file, stage config and mirror all say 5; page shows Round 5 / of 5)
- [x] Swiss progression view log was showing as round robin — caused by a damaged setup file; repaired and verified Swiss "Current positions" log for all four groups
- [ ] Setup file still lists the old Ladies B / Ladies C split (including Adele du Rand and Nicole Hamer) — decide whether to align it with the live pools
