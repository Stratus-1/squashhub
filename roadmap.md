# Roadmap

## Member credit allowances
- [x] Clarification: blank override inherits, explicit R0 allowed, Use club default action; My Account credit-limit notice beside balance.
- [x] Inspect/reuse shared financial eligibility, recurring coverage and scoped finance permissions.
- [x] Add R0 club default, nullable member overrides and audited server-only edits; no ledger adjustments.
- [x] Add Member Billing Settings, Edit Member financial section, member statements and read-only My Account controls.
- [x] 64 focused tests and 29 isolated PostgreSQL checks passed; authenticated Riverside R0 no-op save/reload verified, build OK; no publication or live allowance/ledger changes.
- [ ] Real selected-member Edit Member/My Account browser verification blocked: preview Riverside member picker has no matching members and active account resolves as Unknown member; no alternate account selected or synthetic live data created.

## Bar collection-ready alerts (preview only)
- [x] Strengthen existing member ready popup, retain ping and add supported vibration; preserve partial fulfilment, dedupe and payments.
- [x] Seven focused tests, synthetic browser popup/View order/X checks and background-worker simulation passed; preview build OK, no real orders, live writes or publication.
- [ ] Physical-phone/background alert delivery needs an approved device test after publication.

## Riverside replacement Tournament Structure pilot (live planning tests approved)
- [x] Require positive whole-number expected players/pairs on local Save Structure and add the finalised-entry tooltip; no live entry mutations.
- [x] Add editable recommended Monrad round count; 15 tests and authenticated preview confirmed 12 entrants recommend 4, saved 5 survives reload; no fixture generation.
- [x] Separate local Planned playoffs from Follow-up stages; save/reload verified, no executable stages changed.
- [x] Add per-category seeding and same-category follow-up stage settings, including Use previous stage rankings; saved independent choices verified in Riverside preview.
- [x] Preserve existing When this stage runs controls and results-based seeding; no duplicate ordering mechanism or Stage 1 selector on an existing follower.
- [x] Reuse the actual original alternate-builder structure subtree in Riverside, square coloured choices/blank rows/Monrad, local save/review/reopen verified; no publication or live data writes.
- [x] Enable Riverside-only new drafts on published hosts for approved publication; 28 focused tests and preview build passed, creation block preserved.
- [x] Retire old Riverside row/canvas and stage-planner entry points even if old flags are cached; preserve saved answers and other clubs.
- [x] Build approved Riverside preview card-based replacement: merge seven structure steps, separate subdivisions/pools, include Monrad, preserve scheduling.
- [x] Add separate row-by-row Structure review for the saved basic structure, with draft edits and extra divisions/groups/pools; same answers, no draw application.
- [x] Verify synthetic save/reload, structure/review navigation, tenant isolation and desktop/mobile layout; no publication or live-data writes.
- [ ] Full downstream scheduling submission and live creation require later pilot review; Monrad generation remains unavailable.
- [x] Restore Riverside's standard tournament setup by disabling only the consolidated structure and stage-planner switches; retain saved data.
- [x] Simplify row-based structure step: main categories + subcategories only — next-stage and playoff columns removed (15 Oct).
- [x] Swiss rounds field now defaults to the recommendation (number pre-filled, recommendation still shown beside it); 31 focused tests and Riverside preview save check passed; no fixture generation, nothing published.
- [x] Remove the separate Seeding step from the card-structure flow; per-category seeding on the structure page stays the draw plan's source; 17 tests and Riverside preview verified; nothing published.
- [x] Reduce text size / vertical density in the structure editor.
- [x] Implement and verify the actual Visual Builder: toolbox, placement, connections, inspector, validation and canonical save/reload (Riverside synthetic preview only).
- [x] Add an X to dismiss format-help toast messages.
- [x] Keep subdivisions and pools editable after draft save/reload; default to Group 1/2 and Pool A/B.
- [x] Progressive reveal in structure cards (each row opens after the previous choice), auto-collapse after the last choice, labelled Collapse/Expand control; Riverside preview desktop and 390px verified.
- [x] Who may enter: "Both" preselects Everyone + Players I pick, league placement buttons removed for specific-league members, Stage 2 followers inherit Stage 1 instead of being listed.
- [x] Pick players: follower Stage 2 columns hidden from board columns and move/add menus; filled from Stage 1 results.
- [x] Scheduling: court time per match prefilled from the structure page's planned match time, GoBook block-booking name shown only for GoBook clubs, back-to-back avoidance tick box added (on by default) and saved with the tournament.
- [x] Published to squashhub.lovable.app (16 Oct) after a clean security scan — no new open findings.

## Pending (standing)
- [ ] Structure-builder rollout paused — owner requested a new direction; shared tournament views remain enabled.
- [ ] Cross-group mapped draw application blocked pending engine/standings review.
- [ ] Active-tournament future-stage editing/application.
- [ ] Ladies fixed-date schedule issue — awaiting correct screenshot.
- [ ] Bar-orders activation (Uitsig) needs separate approval.


## Swiss next-round fixtures (Uitsig)
- [x] Upcoming Fixtures list shows results-decided next-round Swiss games in the normal row format and date order (display only).
- [x] Auto-create each next-round Swiss game as a real fixture + court booking once both players are decided (all clubs; runs on result save). Uitsig Men's C R2: 3 games created and booked.
## Messaging channels (Uitsig)
- [x] Turn SMS on for Uitsig (explicit request, 16 Oct); verified sms_enabled=true with WhatsApp still on. WhatsApp/SMS channel-selection switches built in the Member messaging card (preview only, not published).

## Two-stage tournaments (Swiss → round robin), Riverside preview
- [x] Stage 2 is saved as a real later stage of Stage 1 (same players, seeded from final Swiss table, organiser presses Start once all Swiss rounds are played); defaults to play-by tournament end date when no Stage 2 dates are set.
- [ ] Browser check of Generate draw + Start Stage 2 on "assasasa" by Willem.
- [x] Edit setup of a created Riverside tournament opens the new card-structure screens (not the old 21-step flow).
- [x] Final Swiss standings table shown on Run stages once the last Swiss round is complete (wins, Buchholz, seed); verified on "assasasa".
- [x] Stage 2 (round robin) gets its own progression log below the Swiss log; Swiss log shows only its own rounds + locked Final standing column (verified on 'assasasa' 16 Oct)
- [x] Swiss grid: Final standing card on the right after the last round (Projected until the last round completes, then Locked); Stage 2 round robin renders in the Uitsig pool-matrix format per pool, seeded from Swiss standings (16 Oct)
