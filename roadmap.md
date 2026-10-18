# Roadmap

## Automatic counter and customer updates
 - [x] Refresh counter tabs/orders and customer payment status automatically, including return-to-page and reconnect.
- [ ] Show confirmed payment receipt without manual refresh; verify using isolated orders, no live payment changes.

## Pending counter payment actions
- [x] Migration 0177 restores payment method in the counter board response without changing personal PIN authority or settlement logic.
- [x] Twelve focused tests passed; synthetic named-PIN cash/terminal and online-replacement dispatch verified. Read-only hosted Riverside board returns the field; no pending Riverside tabs existed for real UI settlement, and no payments were changed.

## Tournament booking self-conflict
- [x] Correct rescheduling upsert identity and restore old reserved slots only after the linked booking moves; preserve permissions and real-clash checks.
- [x] Seven disposable PostgreSQL checks passed; migration 0176 applied to the shared backend without moving live fixtures. Actual member UI mutation not performed to avoid changing live games; no frontend publication required.

## Counter mode lockout regression
- [x] Make signed-in and QR counter entry require an allocated personal PIN session, with a serving name; revoked sessions return to PIN entry without exposing cached tabs.
- [x] Five focused regression tests passed (entry, named PIN response, End shift, revoked cache); authenticated Riverside Open counter mode → PIN screen → reload verified with no board fetch. Preview build OK; no live lockouts, sales, PIN changes or publication. Real staff PIN/revocation cycle remains untested to avoid changing live sessions.

## Sales statistics and drill-through
- [x] Replace Closed tabs with summary-first Sales statistics including open and closed sales, preserving Shop / Bar / Both and date filters.
- [x] Add Last day / Last seven days and drill-through from total to status totals, tabs and item details; 17 focused tests and authenticated Riverside read-only summary → open tab → item checks passed, 384px no-overflow verified, preview build OK. No writes or publication.

## Bar closed-tab history
- [x] Include Shop, Bar and Both filters, with matching item totals; mixed/legacy cases tested.
- [x] Add Closed tabs with custom dates and all six preset periods; read-only, club-scoped history with totals and serving names.
- [x] Twelve focused tests passed; authenticated Riverside history, all six presets, custom calendar selection, expanded item amounts and 390px layout verified; build OK. No publication or live-data changes.

## Tournament organiser and SportyHQ provision
- [x] Add optional organiser choice to Type and Basics, suggesting an unambiguous dedicated tournament role or explicit champs-permitted member; all active non-visitor club members can be chosen without gaining permissions.
- [x] Store choice in canonical setup answers, save synchronously at handover, strip from templates. Kaylee Hunt assigned only to Uitsig Club Champs 2026 organiser metadata after plan approval; readback confirmed.
- [x] Research official SportyHQ API and connector availability; public docs require requested API access and do not confirm password authentication or draw/result write endpoints.
- [x] Signed-in Riverside draft selector, selection/reload and clearing/reload verified with tournament writes blocked; 19 organiser/persistence/landing tests passed, preview build OK. Existing handover suite has stale scheduling expectations under consolidated structure and remains failing before submission, unrelated to organiser selection.
- [ ] SportyHQ private account connection/import/export: blocked on official API documentation, authentication contract and permitted tournament operations. No passwords collected or publication.

## Family court-booking regression
- [x] Confirm current eligibility RPC and booking trigger reject email-linked family profiles; hosted definitions match QA evidence.
- [x] Approved and applied server-side verified shared-login booking authority, preserving fee-only delegation scope, child financial eligibility and authenticated booker ownership; prevent adjacent sibling booking merges.
- [x] 39 focused tests passed, including 12 disposable PostgreSQL authorization/insert checks and 3 actual booking-hook attribution/merge checks; preview build OK. No live data, hardware or publication.
- [ ] Authenticated family UI path: UNVERIFIED. Needs owner-selected ordinary parent account and explicit permission for one Riverside test booking; monitoring finding remains unresolved until this check passes. Guest booking unchanged; signed-out eligibility rejection tested locally, hosted guest mutation not exercised.

## Format information examples
- [x] Fix round robin information opening and add simplified round robin grid / Swiss round visuals with fictional names and games, no courts.
- [x] Eight focused tests and authenticated preview checks passed for both information buttons, round selection and closing; no tournament writes or publication.

## Category setup safety locks
- [x] Keep Expand / Collapse usable while category settings remain locked; authenticated both-pool preview check passed with writes blocked.
- [x] Double-click category/pool headings to open and close locked settings without unlocking; both pools verified, 17 regression tests passed, preview build OK.
- [x] Add persistent Done & lock / Edit unlock controls for category settings and both pools under a grouped category.
- [x] 32 focused tests passed; authenticated preview verified saved edits, both-pool lock, disabled controls and explicit unlock. Reload tested against an isolated saved-answer response with writes blocked; hosted persistence not exercised. No publication.

## Category league allocation override (preview only)
- [x] Add and persist “Admin can override” beside category league choices, preserving automatic placement and entry eligibility.
- [x] Align manual allocation and the one-page structure advisory; preserve generated games and existing admin authorization.
- [x] 38 focused tests passed; override toggle persisted in a Riverside preview draft. Outside-league permission/gender limits tested; full outsider menu interaction remains unverified.

## Uitsig Men’s A category persistence
- [x] Show one Men’s A category with two pools, preserving all eight live draw identities and other category names/settings.
- [x] Actual Uitsig saved answers reopened in authenticated preview: Men’s A, 2 pools, 8 players, two 4-player rows; round-trip regression passed without merging IDs. No setup saved or publication performed.

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

- [x] Swiss Positional Preview: show saved/decided games in rounds 2+ as real (players, results, scores), not projected
- [ ] Editing a later stage after the draw must save (assasasa Stage 2 Pools->Knockout change was lost)
- [x] "Regenerate Stage 2" button: remove unplayed later-stage games and rebuild from current structure + final standings
- [x] Play-offs seeded from final Swiss standings with tie-breaks (server auto-start fixed); bracket boxes no longer overlap; seed labels follow the draw (16 Oct)
- [x] Weekend tournaments: play-offs start automatically after the last round and are booked into the weekend's remaining days/courts/times, each knockout round after the previous (16 Oct)
- [ ] Weekly tournaments: organiser sets fixed times for quarterfinals/semis/final (later, per user)
- [x] Play-off next round: created automatically WITH time and court after previous round finishes (result save path)
