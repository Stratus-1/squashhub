# Roadmap

## Open
- [x] Notification modal: viewport-bounded header/footer, scrollable body; 26 tests and authenticated real-fixture desktop/mobile/zoom-equivalent checks. Paid claim omitted: readiness does not verify a receipt. Preview only, no sends or data writes.
- [x] Stages & Scheduling redesign (preview): collapsible numbered stage cards, timeline, court calendar, separate Playoffs heading; 4 new checks. Desktop/mobile click-through still to do.
- [x] Swiss→QF Step 1 (preview): QF screen reads Stages & Scheduling list; 'Set up Quarterfinal from saved setup' restored with once-only guard; 7 Riverside tests. Step 2 live repair awaits approval.
- [ ] Final Setup Version (design approved in principle, plan pending): one canonical per-category config, confirmed at Review & Complete Setup, versioned revisions, draw/running read only it, impact preview for running edits.
- [x] Uitsig: confirm ladies who entered both Ladies and Men’s from the final entry sheet (five).
- [x] Uitsig: restored six previously verified additions after setup closure, preserving current picks; saved selections verified at 77 unique players / 81 entries; no registrations, fixtures, fees or messages changed.
- [x] Follow-up Swiss stage semantics: verified persisted definitions/guards, removed deferred-stage creation from pilot running dialog, Generate Draw heading and missing-definition setup link; 14 tests and guarded desktop/mobile check passed. Saved winner chain preserved, not enabled: runnable QF/SF/Final definitions and Swiss engine support remain unresolved.
- [x] Urgent Riverside Swiss→QF dialog: removed generic branches in opt-in pilot, requires saved consistent Top 8, retains stage key and Check Draw/Generate Quarterfinal Draw; tests and actual read-only desktop/mobile checked. Generation remains blocked by saved qualification/style=Later, rounds=2, and existing shared Swiss-mapping contract; no engine/data changes authorized here.
- [ ] Full-screen Pick Players board: board-only zoom, name tooltips, responsive columns; verify controls and desktop/mobile without data writes or publishing.
- [x] GoBook disappearing bookings: removed cached/shared register reads from day sync; five real-handler simulated regressions pass (new booking, separate days, cancellation, invalid/failed reads). No live writes/deployment.
- [x] Swiss next-stage CTA and previous-round notices: existing setup/confirmation dialogs reused, 49 focused tests pass; Riverside desktop/mobile verified with writes blocked; no publishing. Existing playoff-suite failures and unset QF pairing remain separate limitations.
- [x] Restore existing category Standings / Fixtures & Results tabs in the single-event expanded view; Riverside desktop/mobile, category retention, scores and multiple-event cards verified with writes blocked; 14 tests pass, preview build OK.
- [ ] Member Tournaments: single current event standings inline, category switching, collapse control; verify desktop/mobile and zero/multiple/loading states without data writes.
- WhatsApp "Pay my fee" button template (`club_notice_pay`) — submitted to Meta 2026-10-09, status `received` (up to ~48h). When approved it switches over automatically: `send-comms-campaign` already selects it for owing players with a `pay_token`. Check with `select key, approval_status from whatsapp_templates where key='club_notice_pay'`.
- Shorten the WhatsApp club notice opening line to "Update from <club>:" — waiting on Meta approval of `club_notice_v5`; when approved, update the `club_notice` row (body + content_sid + friendly_name) in `public.whatsapp_templates`.
- [ ] Stitch: Nelspruit and 'Healthrate' payers not returned to SquashHub after paying — investigate
- [x] Swiss → Quarterfinal: surface setup-vs-live plan conflict instead of plain "Set up Round 6" (UI only).
- [ ] Swiss → play-offs: server op to end a started Swiss stage after a completed round + Swiss-standings seeding for QF (awaiting approval).
- [x] Nelspruit bar door not closing (2026-10-10) — resolved itself; Shelly was online, last pulse 14:22 SA, door closing by 14:25
- [x] EFT approval "DELETE requires a WHERE clause" (2026-10-10) — fixed: TRUNCATE replaces bare DELETE in finance_decide_member_transaction (migration 0111)
- [x] Member Tournaments Standings tab (2026-10-10) — removed risky inline ClubChampsView embed; single active tournament auto-navigates once per session to /club-champs/<id>; Back shows compact card, no loop; multiple/zero states unchanged

## Pick players toolbar redesign (in progress, preview only)
- Presentation-only rebuild of the Pick Players toolbar in `src/components/smart-builder/StepByStepBuilder.tsx`: row 1 = picked counts + lock-status badge, grouped action rows (Placement / Locks / View) with nowrap buttons and separators, guidance text moved to its own full-width muted row below. No selection, placement, locking or seeding logic changed.
- Playwright check blocked so far: draft with picks not reachable in headless run (visible draft "Jhb club champs" has no picked players; toolbar renders only when picks exist). Still to do: screenshot toolbar at desktop/tablet/mobile in the Riverside draft with 71 picks. Do not publish.
- [ ] Swiss→QF: end-Swiss-early action + Swiss-standings playoff seeding (in progress)

## Uitsig picks overwrite (done in preview)
- [x] Restore six additions + ladies' dual entries in saved picks (77 players / 82 entries).
- [x] Edit setup now loads the tournament's saved picks first; a device's older copy can no longer overwrite them (preview only, not published).

- [x] Draw notices: when fee outstanding, include amount + payment choices (pay by card / add to account / I have paid) for every club
- [ ] Draw notices: "Preview full email" rendered by the real send pipeline (server dry-run, no tokens), recipient modes, desktop/mobile, safe "Send test email" with test token
- [x] Draw notices: Save message (server-side, per tournament/round) + optional personal activation link
- [x] Draw emails: activation link automatic for unlinked players (no tick box), on own club page

## Open (2026-10-11)
- [ ] Willem: reverse the R34 Riverside tournament account charge and restore unpaid status for payment testing; preserve ledger audit.
- [ ] Opponent contact sharing — built in preview; awaiting sender deploy + publish approval; league fixtures not yet covered
- [x] Builder: merge Expected entries into Structure guide (18 steps, conflict flags) — preview
- [x] Public QR tournament page: once-per-browser info toast + compact "Open in SquashHub" panel replacing Exit/Log into App — preview
- [x] Read-only: explain 'Who may enter' auto vs choose options (no changes)
