# Roadmap
- [ ] Verify Uitsig Deon and Lazelle test-sale stock history; test transactions must have no net stock effect.
- [ ] Run one approved bounded Help Center receipt test only if existing publisher preserves one-row scope and cron; otherwise report blocker without invoking.
- [x] Removed the unpaid-fees warning and unused query from Enter Transaction; payment posting unchanged. Clean edit checks and preview build OK; no live data changes or publication.
- [x] Cleared owner-approved 11 stale Uitsig allocations: nine old club_event bookings cancelled, AJ/Ulrich detached from the preserved GoBook championship hold, Johann/Bernard already cancelled/unscheduled before this request. Hosted readback confirms all nine surviving fixtures have no booking/court/time; all 86 deadlines, 38 scored rows and 96 personal GoBook bookings unchanged. Signed-in 27 Oct court grid verifies vanished old allocations, including Lisa/Liezel; no provider writes, hardware or publication.
- [x] PIN-only counter top-up permission repaired and hosted grant confirmed; isolated PostgreSQL signed-out R100 card receipt, balanced journal, retry and invalid/missing/expired/revoked PIN, cash and foreign-club rejection checks pass. No real payment/member balance changes or publication; actual tablet payment not exercised.
- [x] Signed-in member account settlement: optional tip prompt only on Add to my member account, no OTP; single active serving PIN session auto-selected, multiple serving names selectable. 46 focused tests and disposable PostgreSQL ownership/recipient/rollback/retry/account-tip recognition tests pass; fictional dialog browser checked desktop/mobile. Order-process ON/OFF unchanged. No live charge or publication; real signed-in end-to-end settlement intentionally untested.

- [x] Scan-to-pay: added an "or" divider between the member-account option and the card-online option on both the open-tab card and the checkout card in src/pages/ScanPay.tsx. Display-only; Riverside preview verified the divider renders between the two buttons; build OK, no data changes, not published.



- [x] ScanPay member-account charge: signed-in member confirmed at the scanned club charges directly — no member number, no one-time code, including tip-enabled clubs. Session RPCs re-check ownership; guests/QR-only users keep number + OTP. Focused tests and authority gates pass. Real end-to-end charge not exercised (no live charges allowed).

- [x] Diagnosed Nelspruit closed orders: mode was OFF, member handoff wrongly submitted staffed orders. Added mode-aware self-service draft handoff and fail-closed unknown mode; 28 mode/QR/PIN tests pass, build OK. Nelspruit menu inspected read-only; during investigation external settings changed to process ON/open until 21 Oct 05:07 UTC (07:07 Johannesburg); no settings changed by this task. Riverside basket screen checked, but signed-in account lacks a usable member/venue handoff so full checkout remains unverified; no sales/payment/hardware writes or publication.

- [x] Added Outstanding balance under Member Billing → Bill member: member, amount, date and reason, Dr debtors / Cr opening balance equity, atomic audited retries under existing billing authority. Eleven focused tests and isolated PostgreSQL additive-balance/authority/retry checks pass; signed-in Riverside form and success tested with intercepted submission (no live charge). Build OK; not published.

- [x] Restore saved Round 1 results in exact Ladies A/Men's C previews: 27 focused tests pass; authenticated read-only screen check shows nine Men's C scores, three Ladies A scores and bye, with Men's C R2 still 1v9. Build OK; live games unchanged, not published.
- [x] Applied owner-approved actual Round 2 charts: seven existing fixtures corrected/audited, decided Ladies A 7v8 added with 29 Oct deadline. All nine Men's C and three Ladies A R1 scores retained; no duplicate R2 participants. Changed Andre/Leon fixture detached from personal booking, which remains active and unchanged; three unaffected bookings retained. Authenticated log verifies Justin v Riaan. Ladies A unfinished R1 feeders remain undecided; no emails/publication.

- [x] Correct Men's C exact preview: supplied position chart now stays separate from factual saved games; 39 focused checks pass and authenticated read-only Uitsig preview visibly shows R2 1v9. Saved games/default pairing unchanged; no data writes or publication.

- [x] Rachel Gates NSC: existing Treasurer grants retained; migration 0219 repairs missing bar/finance domain policies and billing/sales guards for her active NSC membership only. Synthetic PostgreSQL isolation/revocation tests pass; authenticated Rachel opens NSC Club Finance and Bar/POS and reads GL, tabs and audit successfully. No full-admin grant, financial transaction, counter/hardware operation or publication.

- [x] NSC ladder follow-up: same-row and directly-above-row higher-ranked challenges enabled; automatic ladder/points switches aligned. Missing-link reported 3–1 classified as ladder, still pending Leone verification, positions 70/68 unchanged. NSC-only idempotent member-first confirmed-result handler uses mixed-ladder engine. 22 unit checks and isolated synthetic PostgreSQL confirmation tests passed; Riverside authenticated ladder renders unchanged. Member confirmation UI not exercised; no publication or unrelated rank reset.

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
- [x] Emailed all 18 Men's C players the corrected Round 2 pairings (tournament_round_draw outbox + audit)
- [x] Uitsig Ladies A: owner's exact five-round Swiss chart applied as display-only preview (R1 1v8 2v7 3v6 4v5 bye 9; R2 1v5 2v4 6v9 7v8 bye 3; R3 1v4 3v5 6v7 8v9 bye 2; R4 1v3 2v5 6v8 7v9 bye 4; R5 1v2 3v4 bye 5; 6-9 sit out R5 per owner)
- [x] Cleared Johann van Coller's tonight bar items (NSC): tab, 6 entries (R114), orders, credits and ledger removed; stock restored (Castle Lite 42, Creme Soda 24); older Oct entries kept
- [x] Cleared Rachel Gates' 2 sparkling waters (R20) from her open tab; stock restored to 9, tab left open
- [ ] Nelspruit hang on league night — backend connection saturation (44/60); offered instance upgrade + query slimming, awaiting choice
- [x] Signed-in settle-tab member-number/OTP friction resolved through session authorization, including optional tips; anonymous QR verification preserved.
- [x] Finance transaction proof: add Take photo / scan option (camera)
