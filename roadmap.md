# Roadmap
- [ ] Riverside YouTube pilot: use the existing Friday Round Robin test fixture Albert Erasmus vs Joubert Khumalo; add/verify the viewing link once Willem supplies it. No fixtures/results changed; stream-link feature not implemented yet.
- [x] Explain how to schedule a YouTube phone livestream and share its viewing link for the Riverside pilot.
- [x] Fix social-event email links to the invited club and allow secure accept/decline without login, scoped to the invited occurrence; 39 focused checks and synthetic signed-out phone/desktop flows passed, email function deployed. Old emails cannot be changed; real delivered-email check remains unverified.
- [x] Uitsig: Berni over Jenny 3–0 forfeit recorded and verified in results/standings; Kaylee’s own Past Fixtures correction preview verified.
- [x] Uitsig: Frans R4 already completed (Past Fixtures), R5 upcoming; Frans/Ron is saved R3. No dates or draw changed.
- [ ] Uitsig: score-entry incident needs exact failing match/error; Kayla booking failure needs authorised session or screen/error (session mint unavailable). Her next fixture waits for outstanding Ladies A R2, so no speculative opponents generated.
- [ ] Uitsig Ladies A: create chart-decided games (awaiting Willem confirmation).
- [x] Bar bridge parity: 0358 applied once, identical timestamped migration track added; player-admin-inspection deployed only, 111 focused tests pass. Live signatures/grants verified; authenticated Firebase/device flow and remote GitHub sync cannot be independently verified here.

- [x] Update and deploy only player-admin-inspection for validated native payment-checkout redirects; 37 handler regressions passed and deployed no-secret requests return 401; no financial writes or web publication. Real GCP authenticated checkout remains untested here.

- [x] Audit and apply Player booking permission-cap parity in the two existing RPCs (0355); verify live definitions/signatures/grants and isolated PostgreSQL regressions without publishing or production-row changes.

- [x] Compare Nelspruit September/October Sage reports with existing ledger and bank imports; deliver preliminary review and identify split bank lines/non-bank adjustments.
- [x] Import verified September/October original bank statement rows without ledger posting or duplicate income.
- [x] Prepare review-only Nelspruit September/October reconstruction: 125 bank movements, 51 allocation candidates, five verified payout equations and scoped existing-ledger snapshot; no ledger postings.
- [x] Post 19 clean Nelspruit Sep/Oct bank payments (R23,117.76; maintenance, prizes/events, bank charges), linked to bank lines.
- [x] Complete Nelspruit Sep/Oct bank reconciliation (3 Nov): Stitch payouts marked already-allocated (not re-posted), Yoco payouts posted as bar income, 17 missing receipts posted, matched receipts linked; opening balance entry posted — ledger bank at 31 Oct = R67,336.59 exactly. Flagged items for Willem: Karen Musica R300 over-recording, SADAQAT R1,200 payment source, Vian R40 / Jacques R300 unexplained top-ups, Wynand Klaver fees not raised, purposes of Glen Paterson R356/R2,000, "monthly" R335, "clubhemp" R570.
- [ ] Finalise and approve Nelspruit closing balances/postings — needs grouped allocation review, member opening-history verification, supplier statements, cash/stock counts and asset evidence; no August trial balance required. Snapshot is not a full or tested restore.
- [x] Verify historical Stitch payout fees separately: five September/October fees total R20.70, already recorded; no duplicate fees added.

- [x] Issued invoices not yet due must not reduce available-to-spend (gate ignores them until the due date).
- [x] Add/verify explanatory text in My Account and the dashboard: invoices not yet due are excluded from "available to spend".
- [x] Diagnose Uitsig Men's A / Ladies B placement finals missing from Upcoming Fixtures and saved dates/courts.
- [x] Check third/fourth-place finals in the progression log and keep its stage display consistent.
- [x] Refresh pending play-off fixture information after explicit saved setup changes, preserving played games and player bookings.
- [x] Uitsig hang (2026-11-02): transient issue on Manage Tournaments; recovered on its own. Backend checks healthy, club landing ~1.6s on the live site, admin finance pages slow only on first preview load.
- [ ] Watch: Google sign-in on a club where the member isn't listed shows a blocking "Is this a new membership application?" popup (GoogleIdentityCheck) — confirm whether Willem should be exempt (2026-11-02)
- [x] Nelspruit Makro payments reviewed: stay recorded as bar cost of sales (not Stock on hand), tuck-shop stays under Bar — Willem's choice, no ledger changes.

## Open tasks
- [x] Reclassify Bamanye Ntonjane's 27 October R23/R20 as direct bar sales, removing member credits without changing bank receipts.
- [x] Audit Nelspruit member credits against recorded bar charges and linked direct-sales references: no exact-reference duplicates; Francois, Gareth, Gerrie van Niekerk, Deidre and Andre have corresponding bar debits.
- [ ] Confirm before correcting ambiguous candidates: John Cussons R75 (25 Sep, labelled bar payment but no bar debit); Zach Wiid R20 (26 Oct, separate paid R20 direct sale 31 seconds later with different reference); Ruaan Naude R100 (3 Nov, separate paid R20 sale). Payment purpose/provider references do not establish duplication; requires Willem or receipt confirmation.
- [x] Review support ticket re member balances (CSIR, 29 Oct): added As-at date report + export to Member Balances dialog
- [x] Replied to and closed only the completed CSIR member-balances support ticket; verified saved reply and Closed status in the signed-in inbox.
- [x] Investigated Zach Wiid's Nelspruit R75 top-up Unauthorized ticket: active linked account, sign-in at 08:11 UTC, prior successful top-ups, no new payment session. Rejection occurs during sign-in validation before Stitch; exact failed-session cause is unconfirmed. Payment tickets remain open; no payment/code changes.
- [ ] Verify Zach's payment after signing out and back in; requires his fresh retry/error evidence, without initiating a real payment on his behalf.

## Uitsig bank reconciliation corrections (7 Nov)
- [ ] Post confident bank corrections (duplicate Lights EFT, missing bank fees, Marizel second R300, Bernard/Jenny payments, 20 Oct electricity/stock/cleaning payments, rounding).
- [ ] Joker Draw tickets: bar item "Joker Draw Sales" (no cost) and record PayFast ticket sales with actual fees.
- [ ] Bring in GoBook Lights Account PayFast payments from the schedule.
- [ ] Move the opening bank balance to the bank statement's earliest date/balance (16 Oct, R53,585.41) — Willem's instruction.
- [ ] Remaining items need Willem: Squasha Teers R11,045, Berdina R1,200/R100, Brett Funds owed R100, Izak R870, Michelle/Clay R800, PayFast statement before 2 Nov.
