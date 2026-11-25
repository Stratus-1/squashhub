# Roadmap
- [x] Prepare the branded club Shelly setup guide: verified app/browser instructions, Stratus sharing and safe door-button configuration; Word validated and all six PDF pages inspected. Hardware commissioning is a club/installer handover step.
- [x] Bar checkout: clearly explain insufficient member-account credit before payment and within the tip confirmation; preserve balances and server rules.
- [x] Sweep other bar account-payment paths: counter sale, QR/OTP, admin open tabs and Player error responses; preserve settled records and permissions.
- [x] Invite list: real names + "No contact · share link" for cross-club players; Share open entry link.
- [x] Regional open entry link /t/:id/join, organiser claim review, outside-partner setting + picker, host-only account charge (backend + UI). Not yet tried: real sign-up/email round trip and an outside-partner entry on a live tournament.
- [ ] Optional "you've been entered" message to outside partners with contact details (plan C) — not built; waits on owner confirmation.
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
- [x] Open tabs: "Put on member account" button for treasurer/bar managers (Nelspruit, Wendy Truter case — Wendy had already moved hers).
- [x] Doubles invitation: partner list always shows when a player reopens their link (incl. after paying), partner chosen before payment; fix Duane Rossouw (Uitsig No Frills Doubles). Preview-only until publish.
- [ ] Check "not linked with Stitch" pay button error on Uitsig doubles invitation (player report 17 Nov) — Uitsig's Stitch setup is present; needs the exact screen/time to trace.
- [x] Reclassify Bamanye Ntonjane's 27 October R23/R20 as direct bar sales, removing member credits without changing bank receipts.
- [x] Audit Nelspruit member credits against recorded bar charges and linked direct-sales references: no exact-reference duplicates; Francois, Gareth, Gerrie van Niekerk, Deidre and Andre have corresponding bar debits.
- [ ] Confirm before correcting ambiguous candidates: John Cussons R75 (25 Sep, labelled bar payment but no bar debit); Zach Wiid R20 (26 Oct, separate paid R20 direct sale 31 seconds later with different reference); Ruaan Naude R100 (3 Nov, separate paid R20 sale). Payment purpose/provider references do not establish duplication; requires Willem or receipt confirmation.
- [x] Review support ticket re member balances (CSIR, 29 Oct): added As-at date report + export to Member Balances dialog
- [x] Replied to and closed only the completed CSIR member-balances support ticket; verified saved reply and Closed status in the signed-in inbox.
- [x] Investigated Zach Wiid's Nelspruit R75 top-up Unauthorized ticket: active linked account, sign-in at 08:11 UTC, prior successful top-ups, no new payment session. Rejection occurs during sign-in validation before Stitch; exact failed-session cause is unconfirmed. Payment tickets remain open; no payment/code changes.
- [ ] Verify Zach's payment after signing out and back in; requires his fresh retry/error evidence, without initiating a real payment on his behalf.

## Uitsig bank reconciliation corrections (7 Nov)
- [x] Post confident bank corrections (duplicate Lights EFT, missing bank fees, Marizel second R300, Bernard/Jenny payments, 20 Oct electricity/stock/cleaning payments, rounding).
- [x] Joker Draw tickets: bar item "Joker Draw Sales" (no cost) and record PayFast ticket sales with actual fees.
- [x] Bring in GoBook Lights Account PayFast payments from the schedule.
- [x] Move the opening bank balance to the bank statement's earliest date/balance (16 Oct, R53,585.41) — Willem's instruction.
- [x] Willem's answers (8 Nov) posted: PayFast Lights R19,613.12 as Lights income, Squasha Teers / Brett credit / Mielieland to opening balance, Berdina R1,200 + R100 expenses, Yoco 16–17 Oct Champs card fees + R334, Marizel R300 confirmed wages. App bank to 6 Nov R55,254.17 vs expected R55,332.64 (−R78.47 = Yoco R31.47 + R47 cleaning not on statement).
- [x] R334 (16–17 Oct Yoco) confirmed kiosk sales: moved from Club Champs income to bar sales (8 Nov).
- [x] R47 Berdina cleaning material (26 Oct) moved from bank to bar cash; R31.47 posted once as unreconciled Yoco difference (8 Nov).

- [x] Uitsig Men's B Round 4 (Gerhard, 9 Nov): preview now follows the frozen 25 Oct chart (R4 1v3, 10v12; R5 3v5/4v6, 9v12/10v11). Display only; saved games unchanged.
- [x] Checked: frozen 24-player Swiss chart document and the game-creating rules unchanged since 25 Oct.

- [x] Nelspruit: let Leagues-permission holders (Vian) edit submitted league scores, see the Standings edit pencil and adjust bonus points (BP).

- [x] Enter Transaction: Payments out and Income account pickers include balance sheet accounts (Willem, 11 Nov).
- [x] Bar counter: sort open tabs alphabetically and add a person-name search (Willem, 11 Nov).

## Comms (11 Nov 2026)
- [x] "Members with an outstanding balance" campaign audience
- [x] Default templates (Activate account, Pay outstanding balance) seeded for every new club
- [x] Nelspruit: Rachel can't see comms templates — admins/office bearers now get full member comms access (AGM ballot admin unchanged)
- [ ] Nelspruit bank recon 31 Oct–10 Nov: findings ready (app R2,854.11 low, fully itemised); awaiting Willem's approval on fixes (opening balance, Checkers duplicate/slip, Martin/Umar R100s, Quintin R450, Jacques R300).
- [x] Explained how to switch on the Shop option for Nelspruit (Divisions & categories → add "Shop"); no changes made.
- [x] Stock purchase invoice: finance staff can add non-stock 'Other items' (e.g. cleaning materials) posted to a chosen expense account, paid the same way as the invoice. 4 tests pass; screen checked at Nelspruit without saving. Not published.
- [x] Tournament package price by number of categories (e.g. 1 = R200, 2 = R300) in Step-by-Step Fees step, charged by the server.
- [x] Doubles: a player entering two doubles categories picks a partner for each category (in-app entry window fixed; invite link already did).
- [x] Reset Willem's No Frills Doubles Week entry to unregistered + unpaid for retesting.
- [x] Partner registrations pick up categories from pairs (Paid button 'Choose an eligible category').

- [x] GoBook: auto-link more Uitsig members + sort Gerhard's cases (Richard, Rico, Barend)
- [x] GoBook: auto-link more CSIR members (preview first)
- [x] Durbanville Squash Club put on trial to 31 Jan 2027 (Willem, 13 Nov).
- [ ] Letter to trial/active clubs: Stitch card fee down from 2.95% + VAT to 2.70% + VAT from Tue 17 Nov 2026. Test copy sent to Willem (willemp75@gmail.com); real letter saved as draft campaign 79cc0df3-dc57-45ac-a214-0de2932adc55 for 47 admins/office bearers at CSIR, Durbanville, Gordons Bay, Highveld, Meyerton, Nelspruit and Uitsig. St John's excluded (Zimbabwe); Riverside has only test records (james@james.co.za, hkftservices@gmail.com) so it is left out until Willem gives a real address. Wording changed to 3.40% → 3.10% VAT incl (0.3%); Stratus logo top-left + SquashHub/Stratus signature added. Second test copy to Willem, then await go-ahead to send. App Stitch rate stays as saved; Willem will adjust it when the new rate kicks in (17 Nov).
- [x] Uitsig 12 Nov Yoco: Wynand R140 / Zelda R136 moved from member account to card (13 Nov, Willem confirmed).
- [x] Uitsig 12 Nov Yoco: R23 + R13 recorded as card bar sales; saved cash-up card now R7,678 = Yoco (13 Nov).

## Regional entries (16 Nov 2026) — planning only, awaiting approval
- [ ] Plan: player may enter + pay for an external (non-member/non-visitor) partner when the tournament allows external entries.
- [ ] Plan: general open entry link for other clubs (incl. clubs not on SquashHub, e.g. Kentron / Pierre van Ryneveld); link first sends the player to register at their own club (existing member with login / existing member without login / new member), then join the tournament and pay.
- [ ] Plan: open link "I'm a member" path — if not found on the club's list, register as an EXISTING (unlisted, never NSA-seeded) member: no new-member fees, pending club approval; separate from "new member".
- [ ] No Frills Doubles invite panel shows 'Player' instead of names and '3 of 367 reached' (16 Nov screenshot) — investigate.
- [x] Tournament join: listed member without login → send activation email (click to set up login, return to entry)
- [x] Tournament join: listed member with no email → player supplies email, saved on record, activation email sent

## No Frills Doubles payments (17 Nov 2026)
- [x] John Dyason paid R210 by card with no category: payment recorded on his invitation (17 Nov). WhatsApp with link pending below.
- [x] WhatsApp John Dyason his link: choose one category + partner (sent 17 Nov).
- [x] Stop payments before a category is chosen; hold any that still arrive and alert organisers.
- [x] WhatsApp Bernard Welters his link: choose partner and pay R210 (sent 17 Nov).

## Invitation page wording (17 Nov 2026)
- [x] Entry fee shows the one-category price (R210) until categories are ticked.
- [x] Doubles button says "Select partner & proceed to payment" instead of "Accept & pay".
- [x] Accept button disabled until a category is ticked and the cellphone digits are typed.
- [x] Reset Gerhard Fourie's test entry in Uitsig No Frills Doubles back to cancelled (no fees existed; 2 test category places removed).
- [x] Bar tab: while an online card payment is unconfirmed, hide pay options and say it's in progress (was "already settled"); server message clarified, bar-card-pay deployed. Seen with James Paterson (Nelspruit, 17 Nov).
- [x] WhatsApp JP Lategan (Nelspruit) a link to finish his stuck R48 card tab; James Paterson needs none (both tabs paid).

## Uitsig Yoco difference (17 Nov 2026)
- [x] Trace Carel Ras: R221 app payment (21:42) cleared his older account balance; R311 tab closed as "card machine" at 20:45 by Jayden with no Yoco swipe.
- [x] Carel's R311 tab moved onto his member account (approved 18 Nov); books corrected, card fee reversed, Marizel's cash-up card expected R6,626 → R6,315 with audit.
- [x] Removed the double-entered R58 Jayden walk-in tab (20:35, 17 Nov; approved 18 Nov): 3 waters + 1 Buddy back in stock, R58 card + R1.53 fee entries removed, cash-up card expected R6,315 → R6,257, audited.

## League-night slowness (18 Nov 2026)
- [x] Published the scorecard load fix and the "Taking longer than usual / Tap to retry" start screen (live bundle verified).
- [ ] Decide whether to upgrade the database from Mini — waiting on Willem.

## Member statement completeness (18 Nov 2026)
- [x] Admin Member Statement now lists card/cash bar purchases and their payments exactly as My Account does (shared helper); open-tab unpaid items stay in a separate note.

## Northern District Juniors (18 Nov 2026)
- [x] Reference document of current SSA regions/associations/leagues/clubs (docs/SQUASH_SA_STRUCTURE.md)
- [ ] Build junior districts (one per province: Limpopo, Mpumalanga, North West, maybe more) — awaiting go-ahead
- [ ] Auto-sort clubs into junior districts by province — awaiting approval
- [ ] Re-scrape SportyHQ juniors + clubs — awaiting approval (background)
- [ ] Capture date of birth from SportyHQ (private birth date + first 6 ID digits) — blocked: SportyHQ shows no birth dates publicly and now blocks the automatic reader

## Nelspruit (18 Nov 2026)
- [ ] Wendy Truter R94: EFT top-up confirmed (bank + account credit) but her R94 tab stays open — move tab onto her account (awaiting Willem yes); lasting fix: admin "Put on member account" on Open tabs (awaiting yes)

## Family package approvals (18 Nov)
- [x] Check Paul Keanly (Gordons Bay) family request: who was notified, approval status
- [x] Email all office bearers/admins when a family addition needs approval
- [x] Answer: approve from email link / in-app notification (one-tap approve)
- [x] Junior structure: Northerns Junior Squash zone + 4 provincial junior associations, Junior structure screen, Provincial/Zone entry choices, Glenwood moved to NSA, structure doc/PDF updated.
- [ ] Junior province-per-season choice: stored, but not yet enforced on tournament entry (needs a first provincial junior tournament to wire against).
- [ ] Name provincial/zone admins (waits on Willem).

- [x] NSA affiliated-clubs list: 20 out-of-area clubs removed (Riverside kept; Correctional Services kept pending confirmation)

- [ ] One club structure: association Affiliated Clubs lists follow the Super Admin tree; moves from any admin login (Super Admin, zone, provincial/regional) update the tree; old association notified — plan awaiting approval
- [x] Riaan van Reeuwyk partner step: paid entrants now see a clear partner step, both events listed (pairing still his choice)
- [x] WhatsApp paid doubles entrants without a partner (Riaan, Bernard) with their link; recurrence prevented
- [x] Partner reminders (app, email, WhatsApp) to six No Frills Doubles entrants without a partner — 20 Nov
- [x] Paid entrants who pick a partner may optionally pay only the partner amount
- [x] In-app entry path requires doubles partner before payment

## Junior workspaces (19 Nov)
- [x] Workspaces for Northerns Junior Squash + 4 provincial junior associations (Vian Crafford admin of zone + all junior provincial/regional workspaces, 22 Nov 2026)
- [x] Junior tree in those workspaces: bring in / move / remove clubs, create a new club
- [x] Separate icon colours for clubs, regional associations, provincial associations and zones (workspace switcher / left menu)

## Finance journals & credit transfers (19 Nov, plan approved)
- [x] General journal entry (balanced Dr/Cr, any account, member on AR/member-credit lines, "Member did work" template)
- [x] Member-to-member credit transfer (member or admin starts, receiver accepts/declines, 14-day expiry, admin list)
- [ ] post_journal can be called by anyone without a finance permission check (pre-existing; awaiting Willem's go-ahead to tighten)
- [x] Check doubles pairs paid on one side, unpaid on the other (Lisa/Riaan, No Frills Doubles)

## No Frills Doubles (20 Nov)
- [x] Find why new entrants did not choose partners: Mixed list showed only men (fixed)
- [x] Reinhardt Mixed fee now R100 (package less partner cover)
- [x] Mixed/Mens/Ladies partner lists filtered by gender
- [x] Check a lady's Mixed and Ladies partner lists (Mixed: men only; Ladies: ladies only; 22 with no gender show in both)
- [ ] Partner-list reminders to players: on hold until Willem has checked himself

## Uitsig No Frills Doubles – shared family logins (20 Nov)
- [x] Jan Goosen now Reinhardt's Mens partner; Ebert withdrawn, his paid R210 moved to Jan; Jan owes R100 for Mixed.
- [x] Dashboard invitation cards on a shared login must say whose invitation each is (and use clean category names, not "Mixed 2").
- [x] Dashboard "Select partner & pay" must act for the right family member, matching the personal invitation link.
- [x] Emails/notices to a shared email address must name the family member they are for.
- [x] Dashboard on a shared login: when a profile (e.g. Ebert) is selected, show only that member's own tournament invitations/entries.

- [x] Invitation page: fee line shows the price list (R210 one category, R310 two categories); amount still owed on its own separate line
- [x] Make the player name prominent at the top of tournament invitation links (Willem 20 Nov).

- [x] View-as-member (i on member page): shared-login profile tabs (e.g. Goosens: Jan/Ebert/Zelda/Tiaan) not shown while viewing as that member

- [x] Uitsig: Deon Finance hanging — ledger access check timed out; fixed (0458), verified live as Deon.
- [x] Birth-date reminders: junior tree reads 6-digit IDs + missing count, Members filter, member banner (0457).

## Doubles partner fees – second entry R100 (20 Nov)
- [x] Partner cover in package-priced tournaments = partner's next category price (R100 if partner already paid R210); unpaid "additional events" shrink automatically; reduced fees bank the full payment (0463).
- [x] Correct Zelda/Jan: Mixed cover R210→R100, remove Zelda's unpaid R100, record Jan's missing R100 bank receipt, R110 as credit on Jan's account (approved).
- [x] Card/bank payments for a partner: record the partner's entry on the payer's member account ("for <partner> (<category>)"), partner shows covered (Willem chose payer's account).
- [x] Fee lines name the tournament, player and category, e.g. "No Frills – Jan Goosen – Mens Doubles", "No Frills – Zelda Goosen – Mixed Doubles" (Willem 20 Nov).
- [x] All other No Frills entries: no other second-entry overcharge; all fee lines renamed.
- [x] Michelle Arpin (R210 charged, 2 categories = R310) and Clayton Schlodder (R210 charged while Linden is paying for him) — corrected 20 Nov with the app's own fee recalculation; audited.
- [x] Reinhardt Falk's paid Mens Doubles R210 moved onto Jan Goosen's account: fee raised R210 and payment R210 both show under Jan, zero "covered by Jan" marker left on Reinhardt (Willem approved 20 Nov). Amounts and balances unchanged; audited.
- [x] Same payer-account rule applied to Neill Barnard's paid Mixed Doubles R210 — moved onto Bernice Barnard's account with fee raised and payment shown there, zero marker left on Neill; audited.
- [x] Ebert Goosen's statement cleared of the 8 self-cancelling No Frills Doubles lines (Willem approved 20 Nov); balances unchanged, removed lines kept in the finance audit log.

## No Frills pools (20 Nov)
- [x] Explain why Ladies/Mixed doubles pairs aren't placed in pools (Willem 20 Nov).
- [x] Complete pairs now placed in pools; unpaired players listed as "Waiting for a partner".
- [x] Junior squash player tick: separate auto-tick from SportyHQ junior sections (12 months), admin tick/untick in junior tree
- [x] Count/report how many more juniors SportyHQ shows for Northern Junior Squash clubs (adding new members needs approval)
- [x] Junior clubs list: show all juniors; SportyHQ-ticked junior league players in a distinct colour
- [x] Proposal: Junior squash tab on league page (built)
- [x] Junior squash tab on Leagues page: Boys/Girls x U11–U19, auto by current age (else SportyHQ estimate), drag to move, reset; clubs + junior body admins manage

## Junior birth-date reminders (21 Nov)
- [x] Juniors with email/mobile but no birth date get automatic reminders (email, WhatsApp, in-app) with a secure link to add the date; stops once added
- [x] Publish and switch on reminders: weekdays 09:23, first run Monday 23 Nov (Willem chose Monday)
- [x] Fix: players who already paid their own fee can pay their partner's fee from the invitation

## Club documents (22 Nov 2026)
- [x] Rename "Rules & Constitution" to "Rules & Documents"; document categories (standard: Constitution & amendments, AGM documents, Financial reports; clubs add own) with member-visibility switches per category and per document; chairman and secretary can upload/share.
- [x] Copy constitutions clubs already uploaded for their Stitch application into "Constitution & amendments" (hidden from members until shared).

- [x] Finance audit trail: deleted lines struck through with who/when, reversals flagged, admins/chairman/treasurer only

## Finer permissions (22 Nov 2026)
- [x] Split Finance, Bar/POS, Members, Tournaments, Communications into main areas with sub-permissions; add Documents, AGM, Bookings for others. Existing whole-area grants keep full access.
- [x] Enforce sub-permissions in background checks (migration 0478) and on screens. Not yet tried with a real part-only login end to end.
- [x] Who may hand out permissions: unchanged (admins + office bearers; chairman not own) — Willem confirmed.

## Requests 22 Nov 2026
- [x] Club Documents tile: always visible on member home
- [~] Full admin → office-bearer roles (Willem approved 22 Nov): snapshot store + review list + apply/restore built (migrations 0479–0481, Club Admin → Permissions → "Office roles review"); Riverside snapshot of 13 people saved. AWAITING Willem's sign-off to apply roles per club (pilot Riverside → CSIR → Uitsig → rest); keep one club admin per club (Willem chooses); no member messages without approval
- [x] CSIR: removed 24 deleted test lines dated 5 Oct 2026 and earlier from the audit trail

## Club documents — AI description and dates (22 Nov 2026)
- [x] AI writes a short description of each uploaded document (editable)
- [x] Show uploaded date and document date (AI suggests the document date, editable)

## Office-role Apply at Riverside (22 Nov 2026)
- [x] Riverside templates set to defaults (owner-approved); template reset only writes when changed, so the chairman can Apply for others

## Office-role rollout status (22 Nov 2026)
- [x] Riverside, CSIR, Uitsig, Highveld done
- [x] Gordons Bay: Brad Chairman, Aam Treasurer, Daniel Mommsen Secretary — no full admins left
- [x] Durbanville: left as is — Theo Engelbrecht stays full admin until Charmaine signs up (owner decision)
- [x] St John's: left as is for now (owner decision)
- [x] Nelspruit: Susan Chairman, Rachel Treasurer, Vian Crafford Club Captain (captain rights only, booking rights kept — owner decision 22 Nov 2026)

## Committee approval requests (22 Nov 2026)
- [x] Approvals module (requests, approvers, signatures, attachments, audit) in Club Admin
- [x] In-app + email notifications from SquashHub main sender
- [x] Private email link per approver: view request, files, sign/approve or decline without logging in
- [x] One-time committee pop-up (Approvals + Club documents) for active/trial clubs, then publish
- [x] Approver list: every committee member except the requester must be selectable

## Junior association registration links (approved 23 Nov)
- [x] Club list confirmed switch per junior body; links only after confirmation.
- [x] Association leaders: zone/provincial admins add leaders to bodies below them (existing person or new with optional home club, one person record).
- [x] Junior registration link per body (create/copy/share/QR/switch off).
- [x] Public /j/:token page: club pick (body's clubs only), masked name search, existing/claim/new junior paths, missing-club request.
- [x] Junior registrations inbox (club admins or association leaders approve; DOB required; parent details + consent for under-18s).
- [ ] Live use waits on Vian: confirm each body's club list, add leaders, create links. Mpumalanga West has only 1 club and no club-list editor for regional bodies yet.
- [ ] PAUSED by Willem (23 Nov): review association office bearers and resulting permissions; suggestions only.
- [x] Junior link: automatic confirmation, full member details, parent consent on the form or via a private no-login email link (0494).
- [x] Junior consent channel: email only (Willem confirmed 23 Nov); no WhatsApp consent link.
- [ ] Association office-bearer roles/permissions review — paused by Willem.

## Visitor fee payable immediately (23 Nov)
- [x] Club switch (default off, Nelspruit on): visitor fee paid by card before booking when account credit is short.
- [x] Server rule on every booking writer; Stitch visitor-fee payment kept for that fee, not swept onto old fees.
- [x] Cancelled prepaid booking: money stays on the member account for later (Willem confirmed).
- [x] Booking screen pay prompt + resume after payment; admin switch; tests.

## Uitsig bar pictures (24 Nov)
- [x] Buddy item shows the small single-serve Coke container; brandy-plus-Buddy specials keep their existing pictures.
- [x] Checked for a Secunda Squash Club: none on the platform (nearest: Highveld Squash Club Witbank, Mpumalanga Highveld Squash Association).
- [x] Invites step: let the organiser pick which zones or districts to include in a junior tournament invite (zone/district audience selection).
- [x] Junior bodies: tournament pick list uses junior squad players, not body management

## 25 Nov 2026
- [x] Uitsig 24 Nov cash-up: added the three Yoco wallet top-ups (Ryno R211, Carel R500, Bradley R500 = R1,211) to the expected card figure (R5,720 to R6,931), listed separately, counted figures untouched, audited. Member accounts already had the top-ups correctly; no balance changes.
- [x] Shirts follow bar rules: account charge only with sufficient balance/credit
