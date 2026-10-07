# Roadmap
- [x] Add admin Paid action for registered fee-due players, preserving online and member-account display. 33 focused tests pass; intercepted browser sample updates status and Paid total. Build OK; live authenticated payment writes intentionally not exercised, no real payments changed, preview only.
- [x] Show bracketed entered/selected/combined totals beside guide estimates and per subcategory; 19 focused tests and isolated browser display check pass, build OK. Live club flow not exercised; no live data changes or publishing.
- [x] Replace member mobile Club Controls with a single compact tactile strip and immediate actions without dialogs. 37 focused tests pass; authenticated browser-only device samples show four 48px controls in one row at 390px in both themes, wrapping at 320px; door/toggle requests intercepted, no modal/runtime errors. No live hardware/config/data changes; preview only.
- [x] Compact member mobile device controls only; existing hooks/visibility preserved, manual confirmation added; 38 tests pass, 320/390px light/dark browser-only device samples checked without hardware commands. Preview only.
- [x] Member home first pass: mobile duplicate tiles removed only where shortcuts exist; coloured bottom icons, earlier stats and dynamic controls preserved. Riverside 320/390/768/1280px both themes checked; existing localhost club-context reset requires ?club=riverside on Bar destination. Preview only; no live data/device changes.
- [x] Member help entry: compact 44px header help icon replaces the main tile on mobile/desktop; existing /help verified. Club Admin permission checks unchanged.
- [x] Club Admin contrast: scoped light/dark text/surfaces and locked fields; 13 regressions pass; signed-in Riverside Features, navigation, Banking and Settings checked in both themes on desktop/mobile. Photo/icons/order/behaviour preserved; no live data changes or publishing.
- [x] Club Admin refinements: operations-first collapsible navigation, wide workspace and connected banking steps; four regression tests, preview build and read-only Riverside checks at 390/768/1024/1280/1920px. No publishing/data changes.
- [x] Diamond fixtures: chronological match-day headings, no round grouping; preserve players, positions and schedules. Preview only. Verified signed-in Durbanville: all ten day headings ordered, 270 games, no runtime errors; three regression tests pass.

- [x] Make invitation event lists factual rather than implying every recipient qualifies; retain existing links and entry eligibility. Preview only.

- [x] Restore one read-only all-category Tournament Summary above detailed Standings, using formal playoff fixtures/results in configured category order; verified NSP Knock out on desktop and mobile without changing data.

- [x] Keep exactly three tournament creation choices; Diamond League lives under Pre-built templates and hands off to the existing setup. Preview only.
- [x] Remove orphaned Step-by-Step Continue managing cards by checking club tournaments; add confirmed local-only build removal and immediate refresh, preserving live tournament data.
- [ ] Beta category type (Men's/Ladies/Open/Mixed) required at parent, inherited by subcategories; eligibility across admin/player entry, invites, grouping, doubles, and Diamond slots; server validation; historical data untouched.
- [ ] Protect existing Diamond League standings/reporting from generic Beta management and generation paths.
- [x] Correct Diamond League invitation preview and shared outbound wording using the real Diamond event identity; retain all other details and normal formats; test preview. Do not publish.

- [x] Step by Step path v1 in Tournament Beta (type, entries, categories, dates, courts, summary)
- [x] Club court picker in Step by Step
- [x] Add "What will be played?" (Singles / Doubles / Both) before Categories in Step by Step
- [x] Add match scoring after discipline, with inherited category/subcategory overrides and resolved overview/summary
- [ ] Club Champs guided branch (later)
- [ ] Capacity / format suggestion step (later)
- [x] Beta pool preview: reuse existing builder pool allocation (no competing logic)

## Done 2026-10-02
- [x] Messaging step: solid colour-block section headings (Entry notification, WhatsApp group, Draw notifications, After-match notifications) + Summary wording for all-rounds booking dates.
- [x] Generate-draw Round 1 checkbox explains all-rounds booking-date schedule; server notice includes "Your rounds and booking dates: ..." when every round is drawn upfront (migration applied).
- [x] Visual check via Riverside preview: Entry notification step renders the blue block heading; sections listed; no publish.

## Mobile fixture deadline (done)
- [x] Repeat round play/book-by deadline on every fixture card (Tournaments list + ClubChampsView renderMatchRow); "Book by" when viewer can book, read-only "Play by" otherwise; removed view-toggle gate that hid it in By round view; Mark Game unchanged; verified mobile 390px, 103 badges on Riverside fixtures
- [x] Diamond re-save refreshes each game's court after team changes (Durbanville R1 Court 2 fixed)
- [x] Access device age restriction (Nelspruit Bar door = 18) — server function not yet deployed

## Activation links (in progress)
- [ ] Fix activation linking step (was failing)
- [ ] Add two paragraphs (old email addresses; what happens next) to standard all-clubs onboarding template
- [ ] Tests D–F and J; then publish
- [x] Fix activation linking step (guard trigger now trusts claim function)
- [x] Two new paragraphs in standard all-clubs onboarding template
- [x] Tests D (claim links+consumes, reuse safe), F (set-password path), J (other campaigns unchanged); E (live Google) verified by code path only
- [x] Published
- [x] Campaign audience "Members not yet registered" (active + no login, re-checked at send) with counts summary; onboarding default
- [x] Members page activation panel: send/resend/bulk, sent date/status, missing-email prompt

## Playoff gating + labels (in progress)
- [x] Weekend playoffs start only after ALL qualifying games end (+gap / fixed later); conflict warning; Schedule Maths same rule
- [x] Provisional playoff rows show event/category name; one semifinal scheme per event
- [x] Per-event entry fee + partner pays per event

## Tournament invite payments (2026-10-04)
- [x] Optional "pay for partner" when picking a doubles partner
- [x] Fix partner share missing from total (R250)
- [x] Invite page offers the tournament's payment methods (card / EFT / member account / cash) the club accepts
- [x] Fees step already lists every method the club allows (Club Admin → Banking)
## Invite payment: POP upload + change method
- [x] EFT option on invite: bank details + required POP upload (invite-upload-proof fn, payment-proofs)
- [x] Change payment method until money moved (invite_change_payment_method RPC)
## Theo Engelbrecht activation email (Durbanville)
- [x] Sent manually from main domain (managed fallback added to send-comms-campaign for clubs without SMTP); campaign ab442f3b sent 2026-10-05, 1 sent
- [x] Recurring: one combined debit (membership + outstanding component), components tracked separately; drops back when outstanding plan ends
- [x] Tournament Match Day links open the real Tournaments/standings/marker/live screens (interim page retired). Preview only.

- [x] Forensic trace of Sue.kraffor+NSC@gmail.com failed Nelspruit application (evidence only, no changes) and add to regression tests
- [x] E2E test of new-member application fix (safe test data, cleanup)
- [x] Separate preloaded-member activation from genuine new application; check Durbanville category-lock regression; 5 regression tests
- [x] Hide Courts tile/tab for pending applicants who can't book
- [preview] Step-by-Step Pick players: add any member (outside leagues flagged); Who may enter: leagues + Players I pick together; Next shows blockers
- [x] League Rounds tab: a season round spanning future weeks shows as "Past rounds"

- [ ] IoT offline alerts: on hold pending Willem's architecture approval (plan written)
- [ ] Member dashboard My Stats: compact win/loss donuts per category
