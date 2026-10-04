# Roadmap

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
- [ ] Per-event entry fee + partner pays per event (plan awaiting approval)
