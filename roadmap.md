# Roadmap

## Open
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
