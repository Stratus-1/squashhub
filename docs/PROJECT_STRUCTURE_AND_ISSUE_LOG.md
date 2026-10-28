## 2026-10-28 — Final tournament standings to club ladder
- Added organiser preview/apply for final singles standings, with an explicit per-tournament final-standings timing choice. Existing tournaments retain their settings until explicitly selected; viewing and deployment never reorder members.
- Club-scoped ladder permission, completed games/configured Swiss rounds/all saved stages, singles-only validation and stale-preview checks are enforced server-side. Participants reuse their exact occupied slots; outsiders, unranked/external players and separate gender ladders are preserved. Existing ladder history records changes; unchanged reapply writes nothing.
- Final actions are available for single-order Swiss/round-robin/knockout categories and complete placement playoffs; independent pools without final placement order are not merged speculatively. No live fixtures or ladder positions changed.

## 2026-10-28 — Uitsig special recipe and cost verification
- Recipe calculator sums every component using option consumption and stock-parent yield. Two active Coke specials had quantity 1 of the double option despite their two-double names; corrected to quantity 2 (four tots), preserving Coke quantities, prices and history.
- Saved spirit stock-container costs are Buffelsfontein R6, Klipdrift Premium R12 and Whiskey R12 per 28-tot bottle; no verified replacement purchase prices supplied. Do not invent costs or rewrite historic movement snapshots.
- Income-statement Cost of sales sums all component movement values; sale income is the special selling total, not individual component selling prices. Hosted report currently falls back to current stock costs for missing historical snapshots, so those older costs are not fully historical valuations.
- Added focused arithmetic regressions for four tots plus Buddy and four tots plus both Coke servings.

## 2026-10-27 — GoBook Court Manager balance display
- Added an authenticated read-only member balance action using the saved club API connection and server-verified member/client link. Account and Court bookings share a compact balance and last-refresh display, gated by uses_gobook and gobook_api_enabled. Missing links/amounts and provider failures never display a false zero; no credits, member links, bookings or payments are changed.
- Live CSIR response contains separate Lights and Subscription accounts; preserve account names and amounts separately, filter both clientId and the club's providerId. Signed-in own-account display and refresh verified on both pages; 21 focused tests pass and preview build OK. Shared web/PWA/native UI, no native integration changes; backend deployed, frontend not published.

## 2026-10-27 — Secret AGM run-off ballots
- Closed tied seats now offer an explicit admin-opened run-off deadline; only server-computed candidates tied across the remaining seat cut-off are copied. Already elected candidates and original anonymous receipts remain intact. Each child uses separate voter/receipt records and preserves the self-vote setting; existing personal links resolve to child rounds, with fresh one-vote and deadline enforcement. Repeated opening is idempotent; repeated ties can have another child round.
- Admin can separately send run-off emails through Communications; opening alone sends nothing. Original and run-off results/PDFs remain separately accessible after closing. Shared web/PWA/native pages, no native integration changes.
- 21 focused helper tests passed. Signed-in Riverside-only temporary test verified opening in UI, original-link voting, duplicate rejection, deadline rejection, result recount and unchanged parent totals; temporary ballots removed. Uitsig untouched; no messages sent; frontend not published.

## 2026-10-27 — AGM attached document downloads
- Attached Uitsig's agenda/voting rules and constitution through the existing admin upload, retaining the poster and live voting/attendance settings. Corrected only the agenda's voting-date line to 26 Oct 15:00–28 Oct 22:00 as approved.
- Anonymous signed URL checks originally returned Object not found because attachment storage SELECT queried ballot rows under their RLS. Replaced only that predicate with a boolean exact-path definer check; the bucket remains private and unattached paths remain denied. Both saved PDF downloads verified anonymously (2/4 pages).

## 2026-10-27 — Cash-up restricted to final working barman
- Personal End shift and exit already only close attendance and revoke the selected PIN; no attendance/session trigger creates cash-ups. Deon's existing zero-sales record is a saved cash-up, not an attendance-only summary; history remains untouched.
- Both cash-up writers and shared-hour closure now reject other ongoing staff attendance across the entire club under the existing shared lock. Cash-up displays the blocking state; opening/viewing and personal exits create no reconciliation. Explicit final-worker submission stays required.
- Focused tests cover individual/all exits without cash-up calls and a disabled submission while another barman is working.

## 2026-10-27 — Manual cash expense omitted from bar cash-up
- Uitsig's R230 Cleaning Material expense correctly reduced the cash ledger on 26 October, but the 27 October cash-up expected R250 instead of the R20 counted: opening R230 + cash sales R20 omitted the R230 expense. No write-off was posted.
- Shared cash summary now includes net in-period cash journal movements, subtracting already counted sales/tips/payouts and excluding cash-up reconciliation journals. Saved-edit reconciliation retains the movement snapshot; current cash-up, running totals and report show other cash received/paid out separately. All club cash remains the approved source; no separate petty cash account.

## 2026-10-26 — Single-barman end-shift dialog misleadingly selects All barmen
- Symptom: Deon selecting his own name also checked All barmen, causing concern that Wynand's attendance would end.
- Finding: the aggregate checkbox reflected only this device's retained PIN sessions; with one session it duplicated the individual checkbox. It did not represent staff on other counters.
- Fix: show the aggregate choice only when multiple barmen are retained and label it explicitly as on this counter. Individual end-shift requests remain unchanged.
- Guard: focused counter-session tests check single-person requests and clearing the aggregate before ending just one shared-counter participant. No live attendance, cash-up, payroll or club data changed; shared web/PWA/native presentation only.

## 2026-10-26 — Uitsig specials hidden by expired dates
- All seven specials remained active, sellable and unarchived with intact recipes and available component stock; saved expiry dates (23 October, 5 October or 30 September) hid them from member/counter menus.
- At Willem's request, removed only their expiry dates. Prices, stock, recipes, start dates and day/time restrictions retained; other clubs unchanged. Readback confirms seven null expiry dates. Added a focused menu-availability regression for the three former expiry dates.

## 2026-10-25 — Category Bells standings incorrectly ranked by wins
- Standings ignored saved category scoring and fell through to structured wins-first ranking. Category Bells now uses the existing accumulated-points strategy; clean RR tables show Total points / Points against instead of W/L/Games/GD. Completed drawn Bells scores count in read-only totals. No results, fixtures, setup or deferred progression configuration changed.

## 2026-10-25 — RR placement preview labels and ordering
- Saved placement play now previews A1 v B1, A2 v B2 etc. using the saved per-pool qualifier count rather than a stale seeded championship timeline. Play-offs stay below active round robins and move above them only when pools finish/play-offs start. Display only; no fixture, setup or scheduling writes.

## 2026-10-25 — Delete draw action for organisers
- Added a "Delete draw" button on Generate draw (unplayed draws only) backed by the new authenticated `delete_tournament_draw` RPC: manage-permission check, tournament row lock, refusal when any game is played/started or court-booked, removal of fixtures/rounds/divisions plus linked result notifications, disputes and correction requests, entries and builder_spec retained, one audit event per deletion.
- Redraw path unchanged (step_prepare_draw still replaces in one step); no hosted fixtures deleted during implementation.

## 2026-10-25 — Six-pool initial draw refused by stage protection
- Initial generation wrote date-hydrated stages back when adding prospective Swiss metadata, including to non-Swiss events. The append-only guard correctly refused those changed stages. Non-Swiss draws now leave the saved spec untouched; new Swiss metadata is added to the raw saved spec, preserving every stage. Guard unchanged; no hosted fixtures or scheduling changed.

## 2026-10-25 — Saved category name unnecessarily locked
- Saved builder categories now retain established unit keys while storing admin-editable display names separately in the existing answers snapshot. Category safety locks remain; name-only saves skip playoff/fixture work. No hosted tournament records changed during implementation.

## 2026-10-25 — Play-off pairing step hidden by merged structure
- Restored the timed tournament Playoffs step and direct navigation, with per-category existing qualification/pairing controls including single-category events. Courts now breaks out semifinal/final slots and minutes. Uneven six-pool qualification is explicitly unresolved; no inferred qualifiers or new pairing engine.
- No hosted tournament, booking, fixture, provider or native changes; preview only.

## 2026-10-25 — Day-based Courts page missing reservation action
- Courts rendered day availability but the existing reservation action only consumed the separate stage timeline. Added the shared Book courts now control for day-based court windows, unioning overlaps per date/court and retaining gaps with stable IDs in a separate `:days` namespace. Existing clash checks and explicit booking/release actions reused; GoBook-managed clubs retain their provider booking path.
- Viewing remains read-only; no game generation, scheduling, permission, provider or native changes. Verification uses intercepted booking writes; no live reservations or publication.

## 2026-10-25 — Bells doubles serving selector missing
- Moved the existing per-category serving choices outside the Standard-only scoring branch so Bells doubles also expose Even / Odd, By position, Second server and Not set / Manual. Existing category locks and marker rules retained; adapter now clears stale methods when Manual is chosen. No live tournament writes or publication.
- 43 serving/adapter checks pass, preview build OK. Signed-in read-only browser navigation did not expose the category card, so on-screen selector and real saved readback remain unverified.

## 2026-10-25 — Specific leagues could not be unticked
- The active league audience handler reselected its own mode. Deselecting now retains Everyone and/or Players I pick, with saved league IDs kept for later reselection; no fixture, booking, permission or hosted-data changes.
- Nine focused tests pass; signed-in GW Double Open toggle changes true → false → true, Everyone retained and league list hides/reappears. Hosted writes intercepted; preview build OK, not published.

## 2026-10-25 — Missing whole-tournament capacity on Courts
- Added a read-only capacity band above court inputs: available court-hours/whole slots, per-category stage and playoff game counts, slot minutes and required court-time. Reuses canonical stage capacity and deduplicates overlapping date/court windows; doubles count pairs, not individual players.
- Unresolved formats/qualification remain provisional, with no implied feasible timetable. No saved tournament, fixture, booking, notification, native or provider changes; preview only.

## 2026-10-25 — Treasurer removal of zero-outstanding open tabs
- Added Remove tab with confirmation in Bar / POS → Reports → Open tabs. Rachel's existing NSC bar/finance authorizations verified true; no unrelated admin grants.
- Authenticated club-scoped RPC locks the tab, rejects non-open/nonzero totals including tips, closes instead of cascading deletion, retains sales/reversals and appends one actor-stamped audit event. Retries are safe; item additions now lock the same parent. Open-tab totals include tips and finance readers use existing scoped permissions.
- Disposable SQL checks pass for finance access, zero/reversed sales, retained history, retry, R0.01, R10 tip, wrong club and signed-out/anonymous denial; three existing cart tests pass. Signed-in NSC fictional intercepted confirmation/removal/readback verified. Build OK. No real tabs removed, no publication; shared web/PWA/native UI, no native/hardware changes.

## 2026-10-23 — Compact mobile round-robin pools
- Phone pool frames reduced from 520px to 150px; phone-only single-row zoom/fit/expand controls and standings icon replace the separate standings button. Desktop and expanded views retain their sizing, saved fixtures/results and ranking logic unchanged. Verification recorded in the roadmap.

## 2026-10-22 — Riverside Ladies B R5 singleton pending rows
- Root cause: the read-only hybrid projection emitted one GridBlock per unresolved Swiss position, each with a null opponent position. The generator and saved fixtures were not responsible: database audit retains nine scored games per R1–R3, nine unscored R4 games, no R5 fixtures.
- Added pure paired-slot display helper, enabled for Riverside hybrid previews and prospective Swiss previews without changing existing Uitsig chart routes. R5 bottom ten now displays exactly 9–10, 11–12, 13–14, 15–16, 17–18 in five two-player blocks, with null identities and no scores; four fixed RR blocks remain unchanged. Odd fields show one clearly undecided bye slot. Riverside AABB Ladies B's final display alone uses current-rank non-repeat optimizer after R4 completes, reporting adjacency exceptions, without changing saved policy or participants.
- Eight focused regressions plus 70 existing checks pass (78 total): paired counts/positions, two/three RR boundaries, completed R3/R4 scores, resolved non-repeat final names, odd/full Swiss, partial saved R5 and no input mutation. Authenticated browser R5 shows nine total blocks including five correct Swiss slots; R1–R3 each retain nine scores, R4 nine factual unplayed games, Log retains results, zero page errors/write attempts. All Riverside R1–R4 row fingerprints unchanged. Screenshot Fit confirms all five slots. No hosted writes, fixture regeneration, engine deployment, messages, hardware/native changes or publication.

## 2026-10-22 — Riverside Ladies B five hidden Round 2 results
- Read-only audit: R1/R2/R3 each retain nine completed scored games (27 total), R4 has nine unscored scheduled games, R5 has no saved games. All five reported PROJECTED opponents have no actual saved fixture/result. Browser reproduced only four factual R2 results with ten projected rows: the AABB eighteen-player exact-chart selector was reused for opening rounds and accepted scores only when its theoretical opponents matched actual games.
- Riverside hybrid display now uses factual saved opening-round blocks regardless of that chart. R2 restores Amelia–Kerry (Amelia 3–2), Hannelie–Annerie Erasmus (Annerie 3–2), Donique–Annerie Pillay (Annerie 3–0), Sune–Abigail (Abigail 3–1), Megan–Anika (Anika 3–1). No result copied onto a different opponent or later round. Uitsig exact-chart rendering untouched.
- Three added tests cover all nine saved R2 identities/results, partial rounds and no cross-round score leakage. Signed-in screenshot/DOM checks show nine factual completed blocks in every R1–R3 round, no PROJECTED badges in them; R4 genuinely unplayed, R5 still projected. Fixture fingerprints unchanged; zero write attempts/page errors. No regeneration, data mutation, notices or publication.

## 2026-10-22 — Prospective Swiss final-round sequencing and Uitsig freeze
- Added a shared weighted non-repeat matching objective: configured final-round adjacent current ranks, closest legal alternatives and explicit exception reporting; earlier rounds preserve adjacency after minimizing score gaps. Exact small-even-cohort lookahead checks edge-disjoint continuation without simulating future results. RR groups remain locked and independent from Swiss remainder standings.
- Activation is tournament-scoped and prospective at fresh first-draw generation only. Existing tournaments without the saved policy retain legacy algorithms/projections; no view/save/rebuild adoption. Read-only audit found one existing Uitsig tournament, now ID-frozen across common structured write/save/progression paths; its exact displays and saved records remain unchanged. No migrations, hosted writes, fixture remediation, notices, deployment or publication.
- Verification: 410 tests passed, one existing skipped; new pairing modules lint clean. Synthetic browser R3/R4-to-R5 flow produced 13–14/15–16/17–18 with three unchanged RR groups on desktop/mobile; browser strict-mode solver error detected and corrected with edmonds-blossom-fixed. Shared/server R3–R5 parity and frozen automatic no-write path pass; local bundle refreshed only. Signed-in Riverside saved views preserve Men's A2 colored bracket and exclude Division 3 playoffs. Existing Uitsig tournament and all 89 fixture fingerprints match before/after preview; no page errors/write attempts. Hosted post-deployment checks remain deferred because deployment is unauthorized. Shared web/PWA/native code only, no hardware changes.

## 2026-10-22 — Full saved cash-up editing
- Symptom: settled cash/card amounts were disabled and Edit omitted normal payout/no-payout and reconciliation choices; older cash-up tips were locked.
- Finding: the older update RPC deliberately rejected settled amount changes and did not update the next shift after a counted-cash correction.
- Fix: full signed-in, reason-required correction RPC accepts cash/card, named staff payouts (zero = no payout), reconciliation choice and note. Expected snapshots reject stale edits. Append balanced corrections under original references at the shift's effective cutoff; preserve dates, sales and later counted cash. Recalculate/audit the immediate next opening if prior counted cash changes. Historical additions respect shift-earned and current available staff tips.
- Guard: focused UI tests and disposable PostgreSQL checks cover positive R56, negative rejection, settled cash/card, zero/re-add, reconciliation toggles, balanced journals, effective dates, reason/permission/stale/retry checks, historical tips and next-shift continuity. Signed-in fictional preview saved/read back R240 cash, R580 card and R56 tips with writes intercepted. No real financial data edits or publication; web/PWA/native use the shared report.

## 2026-10-22 — Personal-PIN counter club-sponsored stock
- Added Club sponsored directly to the unlocked counter header, opening a separate stock-only quantity basket and required reason without a customer tab. Server derives club and serving name from an active unexpired/unrevoked personal-PIN session; signed-in admin authority cannot replace it.
- Shared private stock-use posting helper preserves signed-in/admin workflows. Atomic basket posting uses private service-only request audit/replay records, appends serving name to stock history, and posts cost only to Stock club expense versus Bar/Shop purchase expense. No sales, tips, cash, tab or hardware writes.
- Eighteen focused UI/session checks and disposable PostgreSQL PIN/tenant/stock-only/rollback/cost/accounting/retry/signed-in-regression tests passed. Fictional browser PIN unlock, basket and recorded confirmation checked with all RPC writes intercepted. Build OK; real hosted stock use unverified by design. No publication; web/PWA/native share the counter UI.

## 2026-10-22 — Remove cash-up Undo
- Owner clarified that Undo was the wrong action: remove the cash-up Undo control, handler and explanatory text, retain View / edit and Save changes, and rename the till history management button. No financial records or backend permissions changed; existing correction safeguards remain.
- Six focused edit/payout tests passed and signed-in fictional cash-up Edit saved/read back R56 and R230 without Undo. Build OK; frontend unpublished.

## 2026-10-22 — Cash-up Edit omitted paid tips
- Added named positive-only existing payout fields to cash-up Edit. Save requires a reason and updates the payout, expected cash and staff balance atomically; only the latest cash-up allows paid-tip corrections.
- Preserve counted cash and shift dates, keep original journals and append balanced payout/write-off corrections using their existing references so latest-only Undo reverses the full corrected net amount. Before/after payout and cash-up values are audited; stale edits, over-balance amounts and guest access fail closed.
- No live payout correction or publication; Uitsig's restored R56 and counted R230 remain untouched. Web/PWA/native share this report; no platform-specific or hardware change.
- Verification: eight focused frontend checks passed; disposable PostgreSQL tests verified positive R56, negative/zero/precision rejection, required reason, authorization, over-balance/stale/retry protection, R230 counted cash, balanced adjustments, audit and Undo. Signed-in Riverside fictional report saved/read back R56/R230 with correction requests intercepted. Build OK; real hosted correction intentionally unverified.

## 2026-10-22 — Positive tip payouts and reachable cash-up undo
- Uitsig's actual saved tip payout is already positive R56, with owner-confirmed closing/next-opening cash R230. No duplicate tip payment.
- Expose the existing cash-up management report from till cash-up history for signed-in platform admins. Keep latest-only, required reason and server authorization; never undo a live shift during verification.
- Paid-tip inputs reject minus signs and share amount validation. Cash-up server must reject negative values rather than silently skipping them; zero remains no payout.

## 2026-10-22 — Combined cash-up evening date
- Owner requested a 21 October label only for the combined Uitsig cash-up. Store an optional cash_up_date in existing totals and display it separately from the factual shift interval; leave cutoffs, sales, tips and cash unchanged. No publication.

## 2026-10-21 — RR panels ignored configured three-round stages
- The standalone view grouped directly by legacy saved round numbers, ignoring the structured stage's three round dates; Ladies B showed R1/3/5 and a fragmented Pool B with misleading inferred byes.
- Pass the stage round count into a pure display projection. Compact balanced complete RR rounds; for complete four-player pools use the existing circle engine's unique complementary-pair partition, ordered by earliest saved round. Preserve IDs, opponents, scores, slots and deadlines; do not rewrite saved rounds or regenerate games. Ambiguous/incomplete schedules remain factual.
- Verification: 25 focused tests pass. Signed-in read-only browser confirms both Ladies B pools have R1–3, two games per round, no inferred byes, and retained scores/slots; Men's A both pools also R1–3. Both Ladies B tracks drag 170px; no page errors. No hosted data changes, publication, service deployment or booking operations. Saved dates/deadlines remain unchanged; this corrects round presentation, not underlying historical round assignments.

## 2026-10-21 — Missing standard standings totals
- Screenshot showed completed Ladies B three-game wins with GF/GA/GD/Pts all zero. Standard standings counted only string JSON sets, ignoring saved score text and object JSON.
- Reused the shared saved-set parser, normalizing JSON first, with score-text fallback. Games-only summaries never fabricate rally points. No stored score/result or fixture changes.
- 34 focused tests pass; signed-in Classic Log verified Liezel and Lisa Rahman GF3 GA0 GD+3 Pts3, with Jenny/Austyn GA3; preview build OK. Not published.

## 2026-10-21 — Authorised Ladies B three-round setup
- Owner approved three RR rounds for both four-player pools, similar to Men's A, with play-offs later. Updated only Ladies B saved setup round counts and structured schedule/stage mirror to three dates.
- Read-back confirmed three rounds; all tournament fixtures/results retained the exact same fingerprint. Existing fixture round assignments remain unchanged and require separate safe alignment; no regeneration, booking writes, notices or publication.

## 2026-10-21 — App-wide clean round-robin presentation
- Removed club/category and beta-switch restrictions from the standalone RR view; the shared component defaults to draggable fixtures/results and standings for standalone and existing follow-up RR callers. Doubles partner IDs resolve to the existing team row for display only.
- Kept Swiss/matchup format boundaries, calendar, management permissions, pairing and all hosted data unchanged. No publication or service deployment.
- Regression checks cover saved-input immutability, result refresh, drag navigation, matrix fallback and viewing safety. Signed-in saved Uitsig pools drag 170px on desktop/mobile with unchanged content and no page errors.

## 2026-10-21 — Ladies B clean round-robin view
- Symptom: Uitsig Ladies B still used the old matrix/order-of-play view while Men's A used clean draggable pool panels.
- Fix: include current Ladies B category 6 in the same existing Uitsig clean-view predicate; pool calculations, fixtures, results, settings and calendars unchanged. No publication or backend changes.

## 2026-10-21 — Ladies A approved screenshot preview restored
- Symptom: current Ladies A category 5 showed generic pairings and scheduled positions 6–9 in R5, unlike the approved nine-position chart.
- Fix: update the display-only selector from former category 6 to current category 5; approved Ladies A matrix takes precedence over RR display settings and bye substitutions. R5 remains 1–2, 3–4, bye 5 only; saved R2 discrepancy remains untouched in Log/Calendar.
- Guard: exact five-round numeric regression, conflicting RR settings and model-immutability checks; authenticated preview inspected with write requests blocked. No saved fixtures/results/settings, generation or publication changes.

## 2026-10-21 — Clean round-robin fixture/result track dragging
- Symptom: Men's A Pool A/B clean round panels offered only scrollbar navigation, unlike the draggable progression views.
- Fix: pointer-captured mouse drag scroll on the existing horizontal track; native touch swiping retained, standings buttons excluded. Display-only; no scheduling, result, identity, backend or publication changes.
- Guard: focused round-track drag/input-immutability regression and authenticated read-only desktop/mobile checks.

## 2026-10-21 — Riverside RR standings phase and fixed-group identity
- Symptom: the separate RR standings appeared as soon as Round 2 completed, before Round 3 started; the generic view-pilot helper was all-club, not Riverside-only.
- Finding: no independent round-start timestamp is used by this view. Saved match status is in_progress/paused/completed, with side_a_points/side_b_points and game_scores; marker entry explicitly does not start a match. Scheduled fixtures, a marker visit, administrative byes/forfeits and 0–0 state are not proof of play.
- Fix: Riverside-only swissRrDisplay locks memberships from final R2 positions, exposes projected/locked group information and requires persisted R3–R5 real-match score activity before showing the separate RR table. Historical completed results also reveal it after reload. Group colours follow frozen identity, residual Swiss rows are separately labelled/dashed; overall rankings remain separate. Existing RR result calculation/tiebreak hierarchy unchanged.
- Guard: 38 focused tests pass, including 16/four groups, 18/three groups, R1/R2 and scheduled-R3 invisibility, first point, completed results, game reset/pause, byes/forfeits, normal Swiss and non-Riverside isolation. Authenticated existing Riverside AABB Division 3 opens read-only with no RR standings; browser-only fictional states verify both sizes through R3/R4/R5 and mobile. No duplicated site, saved results/fixtures/settings, Uitsig writes or deployment; preview build OK.

## 2026-10-21 — Legacy membership payment warning
- Removed the unpaid-fees warning and its unused query from Enter Transaction at the owner's request; legacy payments have their own place. Retained a neutral explanation of the receivable posting without claiming every brought-forward balance was income raised in this system.
- Presentation-only: posting, fee status, permissions and live records unchanged; no publication.

## 2026-10-21 — Owner-approved stale Uitsig timed allocation cleanup
- Cleared the previously reported restoration batch only: nine old club_event bookings on 27 Oct/3 Nov cancelled through Willem's authenticated session, retaining cancellation history; linked undecided fixtures automatically released their booking/court/date/time. AJ/Ulrich on 22 Oct unscheduled through the protected RPC, preserving the underlying GoBook Club Championships capacity hold. Johann/Bernard's old booking was already cancelled and its fixture unscheduled before this request, so no replacement member booking was touched.
- Verification: all ten old individual booking records (nine newly cancelled plus Johann's existing cancellation) are cancelled; all nine surviving fixtures are unscheduled with play-by deadlines retained. Before/after digests match for 38 scored fixtures, all 86 fixture deadlines and 96 active personal GoBook bookings. Signed-in Uitsig 27 Oct court grid no longer shows the old Lisa van Reeuwyk/Liezel slot or other cancelled allocations; Andre/Wynand's later member-arranged booking remains visible.
- No GoBook booking/cancellation, hardware operation, schema change or publication. All four Uitsig courts have no relay, so the existing lighting callback exits without a hardware call.

## 2026-10-21 — PIN-only counter member top-up permission
- Confirmed QA finding: the counter supplies its personal PIN session token, but the deployed top-up RPC lacked anon execution permission, preventing signed-out tablets from reaching its authorization checks.
- Fix: additive execute grant for anon on this RPC only; existing PIN-session, club/member, card-only, amount and retry checks unchanged. No table permissions, frontend changes, member balances, payments or hardware operations.
- Regression: disposable PostgreSQL suite reproduces the old permission gap and runs the real top-up/context functions as anon with fictional sessions; checks R100 card receipt, journal balance, retry and missing/invalid/expired/revoked session, cash and foreign-club rejection. No real top-up exercised.

## 2026-10-20 — Voided tonight's mistaken Nelspruit bar captures (Johann van Coller, Rachel Gates)
- Owner requested deleting Johann van Coller's bar items from tonight and clearing Rachel Gates' sparkling waters; owner confirmed items were returned, so stock was restored.
- Johann: removed his settled member-account tab (b2812bbe) with 6 tab entries (3× Castle Lite, 3× Creme Soda, R114), 2 completed orders + 4 lines + 8 order events, 1 payment event, 6 member credit rows and 12 ledger lines (debtors/bar_income). Stock restored Castle Lite 39→42, Creme Soda 21→24 with correction movements. His older 6/13 Oct entries retained.
- Rachel: removed 2 on-tab Sparkling Water visitor sales (R20) from her open tab; tab stays open and empty, no charge ever posted. Stock restored 7→9 with a correction movement.
- Guard: post-delete reads show zero remaining tonight records for both members, no orphaned order lines, correct stock counts. No publication.

## 2026-10-20 — Nelspruit self-service bar blocked by order-process OFF
- Symptom: member purchases fail with “Bar not open for orders” at Nelspruit.
- Finding: Nelspruit's honesty bar and online/member payments are enabled, staffed order process disabled; HonestyBar always called the staffed guest-order writer, which correctly rejects OFF/closed orders.
- Fix: recheck active club order mode before handoff; OFF carries the uncharged basket to existing self-service QR/tab checkout, ON retains the staffed order submission. Unknown/error mode blocks writes. Member screen reflects the selected workflow; no club settings, sales, payments or stock changed.
- Guard: 28 mode OFF/ON/error, draft, QR settlement and counter PIN checks pass. Read-only Nelspruit menu and Riverside basket inspected; signed-in account has no usable member/venue handoff, so full checkout is unverified. Counter read-only assertion includes its existing shift-overview read. During investigation Nelspruit settings changed externally to order process ON/open until 21 Oct 05:07 UTC; this task did not change them. Preview only, not published.

## 2026-10-20 — Outstanding member balance in Bill member
- Symptom: Enter Transaction only records income/expenses; existing Bill member only raises income-linked fees.
- Finding: brought-forward debt needs a member-linked receivable with a balance-sheet counterpart, not a fee assessment or payment.
- Fix: added Outstanding balance under Bill member, with member, amount, date and reason; an atomic club-authorised RPC posts Dr debtors / Cr opening balance equity and audits a retry-safe request ID. No real member balances changed and no publication.
- Guard: focused input and synthetic accounting/authority tests; existing fee billing and transaction/payment writers retained.

## 2026-10-20 — Exact Swiss charts hid Round 1 results
- Symptom: Ladies A and Men's C Round 1 scores disappeared from the positional preview.
- Finding: scores remained saved (Men's C nine; Ladies A three plus a bye), but exact charts suppressed every saved block to avoid incompatible Round 2 overlays.
- Fix: attach factual scores, winner/loser flags and byes only to chart blocks with matching round/participants, retaining the supplied positions. Unplayed and incompatible games receive no invented results.
- Guard: focused tests cover nine Men's C results, three Ladies A results plus bye/unplayed game, exact later-round positions and source immutability. Preview only; no live-data changes or publication.

## 2026-10-20 — Owner-approved actual Round 2 chart alignment
- Symptom: saved Men's C/Ladies A Round 2 games still used the older draw while exact charts displayed different opponents.
- Finding: Men's C has one R1 upset (seed 11 occupies position 8, seed 8 occupies position 11); Ladies A R1 3v6 is unfinished. Seven existing unscored R2 rows needed correction, and Ladies A 7v8 was missing.
- Fix: explicitly approved, row-locked/audited changes align five Men's C and two Ladies A fixtures and add decided Ladies A 7v8, all due 29 Oct. Changed Andre/Leon fixture detached from its personal booking without cancelling/transferring it; unaffected bookings retained. Unresolved Ladies A feeders remain undecided. No emails or publication; this repair does not activate future exact-chart generation.
- Guard: twelve R1 scores remain saved, no duplicate R2 participants, personal booking remains active; authenticated screen verifies restored scores and saved Justin Naude v Riaan van Wyk.

## 2026-10-20 — Men's C exact chart overridden by saved Round 2
- Symptom: owner-supplied R2 1v9 appeared as 1v10 in Positional Preview.
- Finding: the exact template was correct, but the saved-round overlay replaced it whenever real games existed; earlier tests covered empty rounds only.
- Fix: exact-chart previews retain every supplied position pair and project names only from compatible completed results. Factual games remain in Log/Calendar without changes; default grids and live generation retain saved-game authority.
- Guard: full saved R1/R2 regression checks all five supplied rounds, R2 1v9 versus factual 1v10, unchanged source model and unchanged default view. No data changes or publication.

## 2026-10-20 — Shared category tournament calendar
- Existing Swiss/round-robin Calendar Views now show all saved tournament fixtures, including later stages, while progression remains category/pool-specific. Selected-category games are green in timed blocks, deadlines and month counts; other categories retain labels, scores and states. Undated fixtures remain listed without invented allocations. Embedded Swiss Calendar View is available. Presentation-only; no fixture, permission, notification, backend or publication changes.

## 2026-10-20 — NSC doubles test-score reset
- Owner requested clearing tonight's Nelspruit Doubles League scoring tests. Two scored rubbers reset with timestamp guards and before/after audit; two pending ranking awards rejected and one stale marker lock removed. All 15 rubbers across tonight's three real fixtures read back unscored; fixture summary rows were absent and fixture score fields blank. Players, pairs, bookings, earlier games and bye fixture retained. Both affected authenticated scorecards show blank games and Enter result. No code deployment; scoring devices should reload before starting real play.

## 2026-10-20 — Uitsig Men's C exact 18-player chart
- Owner-supplied five-round chart selected only for the existing Uitsig championship Men's C group with 18 entrants/five rounds. Owner explicitly approved the repeated 9v10 and 15v16 pairs; the display bypasses repeat repair for this chart only. Saved games remain factual; default/writer projections, other groups, data and deployment are unchanged.

## 2026-10-20 — Proposed 24-player Swiss finals revision
- Opt-in display only: R4 top-four crossover, R5 adjacent finals. R4 5v8/6v7 switch to 5v7/6v8 (already used in R2); provisional R3 3v4/9v10 switch to 3v9/4v10. Repeated +12 in lower half; saved fixtures, default/live projections and server bundle unchanged. No data writes or publication.

## 2026-10-20 — GoBook refresh duplicate provider identity
- Symptom: fixture booking window withheld free slots because refresh returned 23505 on an already-recorded provider ID.
- Finding: overlap triggers execute before upsert conflict resolution; the slot-conflict fallback overwrote another mirror's external ID even when a cancelled row already owned it.
- Fix: both refresh paths resolve stable club/source/external identity, retain its UUID and player ownership, leave fixture-linked allocations unchanged, and never rename another occupying booking. Missing unused holds still reconcile; provider booking/cancellation actions, noon policy, prices and hardware unchanged.
- Guard: 35 synthetic checks pass, including active self-conflict, cancelled-ID collision, repeat refresh and retained player/fixture allocation. Targeted API/sync correction deployed; two authenticated live refreshes return 200 (second: zero further cancellations). Authenticated Uitsig Book court visibly offers 19:30 · Court 4 under free Club Champs slots after refresh. No player booking submitted, provider booking/cancellation or hardware action.

## 2026-10-20 — Closed tabs report by payment method
- Replaced separate Member sales/Card sales report choices with Closed tabs: Card (online), Cash, Swipe (terminal), Member account and All. Summary-only order/tab totals retain date/division filters and pagination; Sales statistics retains item quantities. Read-only report queries; no payment, stock or ledger writes. Manual add-charge action retained under Items & prices.

## 2026-10-20 — Clarified GoBook free championship capacity authority
- Owner clarified that any current Club Championships hold on GoBook is free capacity, including after noon; absence means no free fixture choices. Removed time-based import suppression in both sync paths; absent unused holds still cancel while player/fixture-linked bookings stay protected.
- API-mode fixture picker refreshes GoBook before reading each date and again on confirmation, fails closed on read errors, and never falls back to unrestricted free booking when holds disappear. Date input allows additional dates outside existing cached reservation lists. Cancelled holds no longer generate free starts. Source-only, no deployment/publication/live writes/external calls.

## 2026-10-20 — Gerhard-cancelled championship holds must disappear on refresh
- Both sync paths cancel missing unused championship mirrors after successful provider reads regardless of noon, preserving player-owned championship rows and fixture links; failed ownership reads abort reconciliation. Noon anti-resurrection remains unchanged.
- Booking-page reload no longer skips a GoBook read using the three-minute session cache; successful sync immediately refreshes championship-hold restrictions. Source-only: no deployment, publication, live bookings, external calls or hardware operations.
- Fifteen synthetic tests pass across both reconciliation paths, repeat refreshes, failed provider reads and noon timing; preview build OK. Live member UI not exercised to avoid invoking real provider sync. Newly added same-day after-noon holds must remain free (owner confirmed), but that exception is not implemented: the current provider mapping has no verified creation-time/new-booking marker to distinguish new holds from old released capacity safely.

## 2026-10-20 — Noon-released championship holds reactivated by GoBook sync
- Hosted read-only evidence: noon cron succeeded at 10:00 UTC; seven unused Uitsig holds have noon release audit notes but are active again. Official sync unconditionally upserts provider rows as active and protects stale generic holds.
- Source-only repair: shared existing Uitsig cutoff (same-day noon Johannesburg; Saturday Friday 17:00), skip expired generic holds, reconcile expired unowned mirrors while preserving fixture links/member ownership. No live bookings, external calls, hardware, deployment or publication.
- Court grid restriction now checks the selected day's active holds, refreshed every 30 seconds, rather than blocking every day whenever future holds exist. Eleven synthetic regression tests passed; live member booking remains unverified and sync activation awaits deployment approval.

## 2026-10-20 — Optional tips and staff cash payouts
- Added default-off tips/cash-up switches, QR/member/counter tip choices, named staff balances, cash-only partial payouts and separate Bar income/cost reporting. Counter staff is derived from a personal PIN session. Unpaid account tips cannot be paid out; retry payouts are idempotent and paid-tip tabs cannot be reopened.
- Migration 0208 is additive with explicit grants/RLS; no historical sales changed. Hosted switch readback: all three switches off everywhere. Online tips remain blocked until a separately approved payment release; no payment function deployment or publication occurred.
- 59 focused tests passed, including 14 disposable PostgreSQL authority/settlement tests. Synthetic Riverside QR flow displayed R900 + R100 = R1,000 awaiting cash confirmation, with zero page errors; no real sales, payments or hardware used.

## 2026-10-20 — Tournament fee refresh re-raised a partial top-up
- Audited all 78 Uitsig entry-fee accounts and reflected top-ups. Gerhard Fourie's R100 fee reduced to R40 after his R60 payment, then registration refresh posted R60 again on 16 October. Only his account had this mismatch; Kaylee's R100 adjustment was a genuine second-event change.
- Migration 0206 compares requested fees to assessed tournament-income journals, retaining partial payments and paid/invoiced guards. Provider callbacks and recurring payments unchanged. Gerhard's duplicate debit corrected with a balanced audited reversal; R100 fee wallet-paid without another bank receipt; R152 opening balance retained. No publication or hardware actions.
- Disposable PostgreSQL regressions cover R100/R60 partial payment, full R100 top-up, extra event, reduction, invoice and club isolation.

## 2026-10-19 — Visitor counter tab opening selects ambiguous RPC overload
- Photo shows PostgREST cannot choose between the five- and six-argument `bar_counter_open_tab` functions. Visitor requests omitted `_club_member_id`, allowing both defaulted overloads to match.
- Visitor requests now explicitly pass a null member ID; member requests explicitly pass a null guest phone, so both use the six-argument member-aware function. Existing personal-PIN authority, club isolation, visitor phone requirement and serving identity remain unchanged.
- Synthetic counter regression exercises visitor submission and refreshed active-tab readback. No backend, real tabs, sales, stock, payments or hardware modified; not published.

## 2026-10-18 — Championship names hidden by overlapping grid rows
- Confirmed that first-overlap selection could hide a later 35-minute game on a 45-minute row. The grid now renders every overlapping booking as a separately selectable entry, sorted by start time; names appear once and continuation entries retain occupancy.
- Verification: four regression tests passed; signed-in Riverside preview with reversed fictional 18:00/18:35/19:10 games displayed each name once and opened the middle game at 18:35–19:10, without page errors. Preview build OK.
- Presentation only: no booking, payment, fixture or permission changes; publication awaits explicit approval.

## 2026-10-18 — Grouped income statement
- Primary income, Bar and Shop now have separate two-column sections above general expenses. Each division deducts selected trading costs and description-labelled allocated direct costs before gross profit; those accounts are excluded from general expenses. CSV and print follow the same projection; existing Cost of sales — Bar / Shop GL choices remain unchanged.
- Focused grouping and division suites: 16 checks passed; no ledger, stock, permission or historical sale changes.

## 2026-10-18 — All-club costing option availability
- Confirmed item cost fields and the income-statement Purchases / Cost of sales selector use shared components without Nelspruit-only or pilot gates. Recent frontend changes remain unpublished; no historical accounting corrections applied to other clubs.
- Authenticated Riverside statement basis switching verified read-only; direct Uitsig preview navigation returned to the current CSIR home and did not verify Uitsig's statement.

## 2026-10-18 — Item latest and average cost visibility
- Item add/edit now shows saved average cost read-only beside current cost in the same purchase units; unknown averages remain blank rather than showing an invented zero. The item list shows known averages too.
- Purchase receipt now maintains current cost from the new invoice while retaining existing opt-in weighted-average stock application and immutable historical sale snapshots. No historical costs, stock, or invoices backfilled.

## 2026-10-18 — Capitalised stock purchases missing from income statement
- Nelspruit's R2,705.76 purchase expense was correctly reclassified into stock, but Purchases-basis reporting only read expense balances and consequently showed zero.
- Report-only reconciliation now includes invoice-linked stock debits and explicit expense-to-stock transfers, excluding stocktakes. Bar/Shop trading rows remain visible at zero and Cost of sales switches to historical sold-item snapshots; bank, stock and journals are unchanged.

### 2026-10-18 — Order first, member-account settlement later
- Replaced immediate HonestyBar member-account checkout with Place order. The selected items go to a reused/automatically opened shared member tab via the existing unpaid order RPC, then ScanPay provides separate settlement. Retry keys remain stable for an unchanged basket; failed ordering retains items. Existing order-process permission/settings are unchanged. 18 focused checks passed; real member UI submission remains unavailable in the selected Riverside identity; no live sales or publication.

### 2026-10-18 — Direct member-account purchases missing from counter
- HonestyBar inserted account sale entries without fulfilment orders. Added an authenticated club/member-scoped atomic, retry-safe checkout that creates linked order lines through existing sale triggers. Counter Orders shows account-charged purchases independently of guest-order opt-in; fulfilment/ready notifications do not settle or charge them again. No historical sales converted or real test sales submitted.

### 2026-10-18 — Income statement Bar/Shop cost basis
- Added Purchases / Cost of sales report basis and two division direct-cost expense accounts, including custom-account roll-up choices for allocated salaries. COGS reads historical sale cost snapshots under club finance authority; report substitution excludes purchases on COGS basis and counts allocated costs once. Missing costs are flagged; historical journals remain unchanged.

### 2026-10-18 — Counter serving identity missing on sale entries
- Counter writes trusted a client name and later additions stamped device identity onto older sales. Now new counter sales derive the allocated named PIN identity from the validated session, preserve each entry through handovers and member-account conversion, and expose the serving name in open tabs and sales drill-through. No historical name guessing or payment changes.

### 2026-10-18 — Separate shop trading accounts
- Added Shop Sales / Shop Purchases standard accounts and prospective club-scoped member/visitor routing, preserving payment gates and receipt references. New purchase invoices post balanced division expense/payment or payable journals alongside unchanged stock costing.
- Income statement/CSV show independent purchase-based Bar/Shop margins; paginated journal reads avoid partial totals. No historical reclassification or reposting because bank/manual entries may already cover them.

### 2026-10-18 — Member self-opened tabs missing from counter
- HonestyBar's Open tab was a device-local basket, not a shared tab, so no counter refresh could discover it.
- Added authenticated own-member open/reuse RPC with club/member validation and a member-row lock; in-app origin appears as In-app · Self-opened on the counter. Open my tab at the bar opens a shared tab immediately and continues in the existing ScanPay tab flow; draft quantities are carried without sales, ledger or stock writes until submitted. Existing staff PINs and payment/account approval are unchanged.
- Verification recorded in roadmap; no real sales/payments or publication.

### 2026-10-18 — Pending counter tabs lost payment actions
- Symptom: closing tabs lacked cash/card confirmation and pending-online approval/cancellation actions.
- Finding: deployed bar_counter_board dropped settled_method when adding operator_name; frontend conditions require that field and have no alternate source.
- Fix: additive migration 0177 restores the field in the existing board definition only; personal-PIN authority, club scope, operator identity and settlement functions remain unchanged.
- Guard: synthetic named-PIN tests exercise cash/terminal confirmation and online replacement dispatch with the exact payment method and session. No real payments, tabs, stock or hardware modified; shared backend correction needs no frontend publication.

### 2026-10-18 — Marnus Kamfer tournament rescheduling self-conflict
- Symptom: Uitsig rescheduling reported "This court is already booked on 2026-10-20 from 20:20 to 21:00"; ticket screenshot and linked match confirmed this was his own booking.
- Finding: the RPC inserted a fresh UUID before ON CONFLICT resolved the stable booking, so the BEFORE INSERT overlap trigger rejected retries. Restoring old holds before moving the booking could also clash with it.
- Fix: forward migration 0176 retains deployed authentication, authorization, courts and real clash checks; locks the fixture, resolves the stable UUID before upsert, and restores reservations after moving the booking. No overlap-trigger bypass or permission changes.
- Guard: seven disposable PostgreSQL tests reproduce the failure and verify retry, move/readback, retained deadline, old-hold restoration, real court/player clashes and unauthorized/signed-out denial. Tests execute the applied migration. No live fixtures, bookings, results, ledger, notifications or hardware changed; no frontend publication required. Actual member UI mutation not performed to avoid moving live games.

### 2026-10-18 — Signed-in counter bypassed personal PIN after lockout
- The admin Open counter mode button entered `/bar/counter`, where a club-only authorized board request bypassed personal-PIN sessions and showed no serving name. The signed-in entry now resolves the active club menu code and enters the same personal-PIN flow as the QR link; counter board requests never fall back to club-only authority.
- Missing serving names require PIN entry; revoked-session errors hide cached tabs immediately and discard their board cache. Existing backend PIN/session verification and admin permissions are unchanged. No live lockouts, PIN changes, sales, hardware actions or publication.
- Five focused tests passed, including named PIN response, End shift and revoked cached board removal; authenticated Riverside Open counter mode and reload both stayed PIN-locked without a board request. Preview build OK. Actual staff PIN/revoke cycle was not performed against live sessions; web/PWA/native use the shared entry flow.

### 2026-10-18 — Sales statistics replaces Closed tabs
- Replaced the default detailed closed-tab list with Total sales, expandable status totals and customer/tab → item drill-through. Uses paginated club-scoped visitor and member sale lines by recorded sale date; open/closing and settled/closed guest tabs are included once, plus member and direct sales. Failed/unconfirmed direct payments excluded; pending tab payment attempts retain existing tab sales. Member-account transfers remove visitor originals, avoiding duplicate totals; their original pre-transfer timestamp is not retained by the existing backend.
- Preserved Shop / Bar / Both and custom/prior presets, added Johannesburg Last day and renamed rolling week Last seven days. Seventeen focused tests passed; authenticated Riverside total → open tab → item list, Shop filtering, Last day and 384px no-overflow checks passed; preview build OK. No financial writes, hardware operation, migration or publication; shared web/PWA/native display only.

### 2026-10-17 — Bar closed-tab history
- Added a separate Closed tabs view with six presets and custom calendar dates using Johannesburg closure dates and an exclusive end boundary. Paginated settled/closed tabs show saved serving names, payment methods, totals and expandable items; open-tab/payment flows unchanged. No migration, live-data writes or publication.
- Shop / Bar / Both filters select matching items and amounts, with Both retaining zero-charge closures. Twelve focused tests passed; authenticated Riverside checks verified history, every preset, custom calendar selection, expanded items and a 390px layout without horizontal overflow. Preview build OK; shared web/PWA/native presentation only.

### 2026-10-16 — Required expected players in Riverside structure
- Local Save Structure now rejects missing, zero and fractional category estimates; required player/pair inputs include a short tooltip explaining adjustment when entries are finalised. No registration, generation, live records or publication changed.

### 2026-10-16 — Riverside explicit Monrad round count
- Added an editable Monrad rounds field prefilled from the entrant-based recommendation. Save retains the chosen count in the original snapshot and category stage plan; missing counts block save. Swiss settings, later stages, dates and live fixture generation remain unchanged. Creation stays blocked; no publication or live-data writes.

### 2026-10-16 — Riverside category playoffs, follow-up and seeding plans
- Replaced the old playoff toggle only in the Riverside original-structure pilot with independent Quarterfinal/Semifinal/Final choices and a follow-up format. Category Stage 1 seeding reuses the existing seeding choices; a same-category Stage 2 summary additionally offers previous-stage rankings. These future-stage choices persist locally and do not generate fixtures, duplicate entries or alter scheduling/results. Other clubs retain the original controls. No publication or live-data writes.
- Playoff/follow-up save and reload verified in an authenticated synthetic Riverside draft; focused adapter tests cover independent settings and unchanged later executable stages.

### 2026-10-16 — Riverside reuses original alternate-builder structure screen
- Embedded the actual existing ClubChampsTab structure subtree in the new builder rather than recreating its cards. The original conditional format/scoring/pool/partner/forfeit/stage-order questions remain; scoped square coloured selections have one blank row after each choice row. Monrad is available only in the isolated Riverside structure screen and estimates use the existing Monrad helper.
- structureOnly mode stops hosted saveDraft/autosave and renders no tournament list, generation or full-wizard actions. Explicit Save Structure delegates to a pure StepAnswers adapter; full original answers remain local, supported scoring/format/entry answers mirror to review, and saved scheduling/later stages remain unchanged. Original settings not supported by downstream creation remain planning-only; creation stays blocked. No publication, migrations or live tournament writes.
- Verified 20 focused tests and type checks; authenticated Riverside synthetic draft Round Robin/2 pools/PAR 15 saved, appeared in row review, reopened after reload, and switched/saved Monrad. Original screen screenshot reviewed. Wider rollout and live application remain pending.

### 2026-10-15 — Riverside preview independent division eligibility
- Split the row builder into Division name, Match type and Eligibility columns. Explicit Open/Men only/Ladies only/Mixed choices remain independent of presets and names; presets prefill only missing eligibility. Name mismatches show a non-blocking advisory. Subdivision rows display inherited eligibility; mixed pair composition is stated separately. Hybrid remains disabled because this StepAnswers/handover path supports singles/doubles only; existing league-based criteria stay in Who may enter.
- Preserved categoryTypes/disc answers, stages, entrant references and draft compatibility. Riverside-only selection now honours inherited subgroup league criteria and prevents the legacy women-in-men's-leagues automatic-placement fallback from bypassing explicit Men only. Existing clubs/tournaments keep their previous behaviour. No schema, live records, invitations, fixtures, bookings, financials or publication changed.
- Verification: 68 focused editor/category/placement/invitation regression tests passed. Signed-in synthetic Riverside draft saved and reloaded Men's Singles + Open and Men's Doubles + Men only with unchanged discipline/name; desktop and 390px mobile reviewed, no document overflow, preview build OK. Actual invitation dispatch is intentionally untested/blocked by the preview creation gate; no notifications sent.

### 2026-10-15 — Riverside preview round-robin matchup topology
- Added per-stage Within / selected Between / Custom group matrix to the gated new-draft row builder, optional unequal expected group allocations, explicit match examples/counts and canonical unordered-edge capacity maths. Missing group coverage, invalid totals and stale matrix references block Save rather than silently changing saved choices.
- Saved choices remain in local stage plans. No generator, bookings, pool boundaries, standings, results, qualification rules or live records are changed. Cross-group application remains blocked by the existing new-draft pilot creation gate until mapped-engine/standings/qualification review and separate approval; no publication or Uitsig changes.
- Verification: 36 focused tests passed across five files (odd/unequal fields, within/between/custom, reciprocal dedupe, no self-matches, coverage/size/stale-edge validation, capacity and selected singles/doubles). Signed-in synthetic Riverside preview confirmed explicit Save Structure and reload readback of Custom (all cross meetings plus within A), 102 RR matches / 198 total / 148.5 court-hours; desktop and 390px mobile checked with no document overflow. Expected allocation and selected-entry estimates stay distinctly labelled. Preview build OK.

### 2026-10-15 — Riverside preview row-based structure first pass
- Replaced separate category/structure pages for flagged Riverside preview new drafts with direct-first rows, preset/custom names, independent type/discipline, expected entries, expandable subdivisions/pools and ordered future-stage plans. Optional guidance applies only explicitly; one local Save Structure, dirty-navigation guard, reload persistence and no creation/apply path in this pilot.
- Backward-compatible pure adapters preserve existing answers; duplication excludes entrants/pairs and gives stages fresh IDs. Existing tournaments, published hosts and other clubs retain prior flow. No backend/data changes or publishing in this refinement.
- 34 focused tests passed (five files; existing React act warnings in landing tests). Signed-in synthetic Riverside setup verified Men’s Singles 24/Swiss 5, Mens B 18/Swiss 4, Ladies Singles 16/four RR pools, undecided stage, playoff choice, explicit save and reload readback; mobile document has no overflow. Initial-stage estimate 120 matches/90 court-hours at 45 minutes; playoff matches explicitly excluded until qualification is configured.
- Remaining: custom/shared playoff mapping controls, complete capacity including playoffs/available courts, and active-tournament future-stage editing/application. These are not enabled by this new-draft visual pilot; no completed results, draws, bookings or notifications touched.

### 2026-10-14 — Riverside prominent progression category selector
- Embedded Riverside Progression & Log category buttons now use solid blue/teal/purple semantic accents, saturated selected backgrounds, readable inactive labels, rectangular borders and explicit focus. Desktop distributes generously sized buttons across the available width; mobile retains unclipped horizontal scrolling with 56px targets.
- Presentation only: category selection callbacks, navigation/data scope, scoring and schedules unchanged; other clubs retain existing appearance. No publishing or live-data changes; outstanding Android marker initialization investigation remains the priority blocker.

### 2026-10-14 — Riverside read-only allocation preview Phase 1
- Added server-permission-gated Riverside drag handles, accessible selection, free-capacity targets, swap review and cancellation; no commit or mutation path exists. Exact server-saved plan/stage/range/provenance verifies newer blocks; display labels alone never qualify. Block rows remain untouched and personal linked bookings excluded.
- Read-only paginated inventory spans club tournament categories and active bookings, checks duration, player overlap/rest, saved stage windows/deadlines, scoring state and marker locks. Ambiguous/legacy reservations fail closed. This verifier does not claim ownership of other reservation formats.
- 51 focused tests passed; signed-in desktop/mobile observed no verified blocks in selected Club Champs, hence zero enabled real targets, no page errors or mobile overflow. Successful live-inventory drag/swap remains unverified; no data was fabricated or written.
- Priority marker audit found the 20-second recovery depends on club context/query parameter; sibling marker entry paths omit it. Exact Android hang remains unproven, no scoring changes made here; Phase 2 remains blocked.

### 2026-10-14 — Riverside RR matrix missing rally-point totals
- Root cause: pilot totals parsed only a single numeric score and skipped comma-separated games and saved JSON sets, leaving 0/0 despite completed results. The official Standard format already sums saved set points separately from games-won ranking credit.
- Pilot now uses the shared saved-set parser, sums confirmed completed pool rally points for both sides, skips live/void/bye/synthetic walkover points, and displays missing point detail as unknown rather than games counts. Label clarified to Pts F/A; official standings/ranking and stored results unchanged.
- Read-only audit found four Ladies A finals: one 3–1 with 33/11 and three 3–2 with 33/22; saved JSON and score text agree. A live match has only current 3/5 and contributes no completed totals. Zero-point losing games are recorded facts, not corrected.
- Verified all three pools in signed-in desktop/mobile preview, mirrored totals and no page errors/overflow; 16 tests passed including reactive rerender. Existing tournament realtime invalidation and 10-second polling retained. PAR 15 category label differs from these recorded 11-point game scores; no rule or result was changed.

### 2026-10-14 — Riverside RR matrix overflowing point-score breakdown
- Matrix now renders separate games-won summary from saved sets/score, mirrored from each row player's perspective, with light-green completed cells and dark contrasting text. Pending round references and in-progress state remain distinct.
- Raw scores, totals, standings, detailed order-of-play and Past Fixtures/details remain unchanged. Riverside-only existing gate; no writes or publishing.

### 2026-10-14 — Riverside pool rank and progression colour refinement
- Classic Log uses independent dark-green through lighter-green/pink to dark-red semantic rank bands within each pool, following existing standings order. Before results the same bands are softened and labelled provisional draw order.
- RR round headers/borders and matrix round references use restrained coordinated accents; Swiss proposed preview headers gain the same scoped accents. Existing results alone drive winner highlights; no fabricated live state.
- Riverside pilot only; no ranking/scoring/scheduling/data changes or publishing. Desktop/mobile signed-in screenshots verified all three Ladies pools, RR and Swiss; no page errors or mobile page overflow. Android initial-load investigation remains higher priority and exact owner route remains unverified.

### 2026-10-14 — Riverside fixture calendar missing live/final scores
- Symptom: LIVE cards/details had no scores and completed matches looked like active games.
- Finding: the adapter accepted only arrays although the marker saves JSON strings with sets/current plus dedicated side-point columns; the calendar retained a stale event object in its dialog.
- Fix: read-only adapter reuses the saved result reader, separates games won from current rally points, shares card/detail score presentation, and resolves open details by ID on each update. Existing realtime invalidation and 10-second refetch remain; every scheduled selected-tournament match stays in the calendar, including finals. Upcoming list and Past remain separate.
- Guard: score mapping and open-dialog transition regression tests; no scoring, scheduling, permission, backend or publication changes.

### 2026-10-14 — Riverside Mark Game initial saved-score loading can remain indefinitely
- Proven failure category: sequential initial reads had no overall deadline or outer rejection handler, so an unresolved request/rejected name/rules read could leave `tournamentLoadState=loading`. Normal real-match initial loads worked in the test browser; the owner's specific failing network request is not captured in telemetry.
- Fix: Riverside initial load has a 20-second deadline, aborts core reads, ignores late data, and offers a route-preserving Retry without starting 0–0. Load rejections reach an error state. Riverside Upcoming marker navigation retains club context. Uitsig has no deadline enabled; no permissions or scoring rules changed.
- Safety: synchronous duplicate-submit guard complements existing idempotent result ID; no real results submitted during testing. Real desktop/mobile hydration plus deliberately stalled-read timeout/Retry verified; exact grid entry button unavailable in the current read-only positional grid, which has no marking action.

### 2026-10-14 — Riverside proposed Swiss slots and primary grid
- Symptom: undrawn rounds had blank positions; the colored table dominated the pilot.
- Finding: live Riverside Swiss remains score-based; assigning template slots to its live future fixtures would misrepresent the draw.
- Fix: Riverside-only proposed base-template columns use actual entry counts and saved category round limits; factual first-round fixtures and current live standings/results are explicitly labelled. Classic standings are optional, with empty/unsupported/render-error fallback.
- Guard: pure slot tests, no input mutation, legacy results excluded from future proposed names, optional/fallback presentation tests; no engine, database, registration, result or publication changes.

### 2026-10-13 — Free Club Champs court paragraph missing from player preview
- Saved `all:r1` wording already contains free reserved slots via SquashHub and other slots via GoBook. Structured category notices add a stage suffix; the resolver searched only `all:r1:s…` and missed the saved round template.
- Fix: inherit same-round unscoped wording when no exact stage wording exists; preserve explicit wording and never borrow another round/stage. Added regression tests. Preview only; no saved messages, bookings, fixtures, backend changes or sends.

### 2026-10-12 — Blocked Invite / Inform actions lacked a visible explanation
- **Symptom:** Invite players was disabled with only a tooltip; blocked Inform mode showed no controls or explanation.
- **Finding:** Removing the global deferred-decisions callout also removed the only actionable explanation on the Invite stage. Later-stage decisions are not invitation blockers.
- **Fix:** Restore a visible alert listing each invitation blocker and its reason, with "Decide now in setup" using the existing guarded edit action, only when the displayed stage is Invite / Inform. Keep the callout absent on Generate and running views, as requested on 10 October; finalise validation is unchanged.
- **Guard:** All five new component regressions pass: blocked and unblocked Invite/Inform modes, later-stage-only decisions, Generate without the callout, and revisiting Invite with the existing downstream edit confirmation. Preview build OK. The older full handover test stops before management at its missing `stage-court-bookings` selector; its payment-semantics test passes. No authenticated browser check performed. Presentation only; no messages, data changes, or publication.

### 2026-10-11 — Tournament administration light-mode hierarchy
- **Finding:** Shared light surfaces and borders did not distinguish workflow navigation, primary content and notification wording from preview.
- **Presentation fix:** Explicit tournament-admin roots, light-only semantic canvas/panel/inset/contrast tokens, blue current and green validated steps, highlighted existing next action, and separate notification editor/preview regions (desktop columns, mobile stack). Both notification portal entry points retain the bounded single-scroll layout. Dark surfaces, lifecycle/action derivation and all data operations remain unchanged.
- **Verification:** 15 focused tests pass; authenticated Riverside running view, saved Stages & Scheduling and actual selected-player preview inspected at desktop/mobile in light/dark. Keyboard focus reaches the player selector; no horizontal overflow. Backend writes and sending were intercepted, including pre-existing reconciliation/autosave attempts. No live data changes or publishing. Native devices and actual OS zoom not independently checked.

### 2026-10-11 — Expanded draw notification preview hid actions / overstated paid fees
- **Symptom:** Personalized preview overflowed short viewports and displayed "Your fee has been paid" for account-charged entries.
- **Finding:** The entire dialog scrolled, including actions; its hidden footer did not anchor them. The composer equated draw-readiness settlement (paid/waived/on_account) with verified receipt. Read-only Riverside check: Willem has on_account, zero fee_paid_cents and no paid timestamp. The earlier tournament ID is not present in this backend; current Riverside saved tournament was used without mutation.
- **Fix:** Shared DrawNoticeDialog uses a viewport/safe-area bounded flex layout, fixed header/actions and one overscroll-contained body; preview and recipient list have no nested scrolling. Retained Radix focus trapping, Escape and page scroll lock. All preview/test/send channels omit any paid claim because the loaded context does not prove a verified receipt; outstanding amounts/actions remain conditional, and not_required never prompts payment. No accounting rules or records changed.
- **Guard:** 26 focused tests pass. Authenticated real-fixture isolated dialog verified at 1280×720, equivalent 125%/200% CSS viewports, 390×640 dark and 320×480 light: footer in bounds, no horizontal overflow, page locked, wheel and keyboard/Escape work, no runtime errors. Actual browser zoom and native-device safe-area behavior not independently exercised. No sends, saves, fixture changes or publishing.

### 2026-10-11 — GoBook cached register could cancel valid calendar bookings
- Confirmed monitoring finding 98aedacd-5ce4-5621-867f-8100c082c1e0: sync_core_day used a three-minute module cache keyed only by provider service, not date, before marking missing active GoBook API mirrors cancelled. Booking/cancel paths did not invalidate it.
- Small fix in supabase/functions/gobook-api/index.ts: remove register cache and restore a fresh Booking/List read for every sync with the requested provider service and booking date. No cached or shared in-flight snapshot can drive destructive reconciliation. Existing tenant/source/date scoping and malformed-response protection remain unchanged; no schema, UI or native changes.
- src/test/gobook-register-freshness.test.ts executes the real edge handler in an isolated VM with fake provider/database boundaries: newly inserted booking after preceding sync remains active; day B reads independently from A; real absence still cancels; malformed and failed reads preserve mirrors. Five tests pass; preview build OK. No real GoBook calls, booking/data writes or deployment performed. Concurrent provider-read/local-write races and valid-but-incomplete provider lists are pre-existing limitations, not addressed by this bounded cache fix.

### 2026-10-10 — Inline tournament view hid Fixtures & Results
- **Cause:** The existing category tab strip was explicitly hidden by `!inlineStandings`, leaving no way to select the already-renderable fixtures panel.
- **Fix:** Show the existing tab strip in inline mode and restore its associated tabpanel semantics. Shared category selection, round/result rendering, expansion defaults, queries and scoring remain unchanged.
- **Guard:** Source regression coverage checks the tab strip is not suppressed in inline mode; browser verification checks both panels and category retention without permitting tournament writes.

### 2026-10-10 — Single current tournament standings required another navigation
- **Symptom:** Member Tournaments Standings showed only a compact View Standings card for Riverside.
- **Finding:** The tab never used the category standings renderer.
- **Fix:** Exactly one current tournament with standings renders inline, with category switching and a manual collapse control; multiple tournaments retain compact selections. Parent-owned entries, matches, rounds and architecture are passed into the existing renderer. Inline mode disables duplicate primary reads and legacy auto-progression; loading waits for standings inputs.
- **Guard:** Component tests cover default expansion and collapse/reopen; authenticated Riverside desktop/mobile checks preserve results and verify category switching. No stored results, draws, ranking calculations or leagues changed.

### 2026-10-09 — Stock purchase lines lacked item search
- Purchase invoice lines now use a searchable item picker: type part of an item or category name, filter by Bar or Shop, and choose from items grouped under the same category headings the menu and stock take use, with a per-item measure hint and an X of Y count. Archived items, specials and option rows stay excluded, and selection still reports the same value with unit cost auto-filled as before.
- Verified in Riverside Bar / POS: the picker opens, searching "beer" narrows 237 items to 6, and choosing "Coke Bulk" fills the line (qty 1, cost R10, total R10) with no errors. The invoice was not recorded, so no stock, ledger or supplier data changed. Preview only, nothing published.

### 2026-10-09 — Special availability time selection
- Replaced native minute pickers in the bar special form with 24-hour quarter-hour dropdowns, retaining Any time and existing off-grid saved times without rounding. No stock, validity rules or stored records changed; preview only.

### 2026-10-09 — Player locks were unclear
- Added persistent separate Lock all and Unlock all actions with locked-player count, visible coloured Locked row badges and accessible individual toggle states. Bulk controls also appear in the expanded board. Existing saved lockedIds and ladder refresh behaviour retained; no allocation or scoring changes.
- Seven focused tests pass. Authenticated saved Riverside setup exercised with backend writes intercepted: individual lock, bulk lock, individual unlock and bulk unlock, including full-screen and mobile; no runtime errors or horizontal overflow. Preview only, no live records changed or publishing.

### 2026-10-09 — Tournament Builder visual-only refresh
- Scoped step-by-step presentation: ordered navigator with current/validated/neutral states and position count, selected choice checkmarks, consistent panel headings and Back/Next layout, readable tournament summary and mobile wrapping/stacked save controls. All conditional steps, labels, saved answers, validations and tournament logic retained.
- Verified the saved Riverside Club Champs configuration contains 19 steps; exercised all 19 in an isolated authenticated render, with backend write requests intercepted. Desktop light/dark, tablet and mobile checks show no runtime errors or horizontal overflow, including Summary. No tournament records changed and nothing published. Existing pairing suite still has the same four failures documented on 2026-10-07; no domain changes made to address its outdated fixtures/selectors.

### 2026-10-09 — Draw email and WhatsApp destination mismatch
- Draw emails greet each recipient by name. Tournament-view campaigns resolve the existing overall QR URL before rendering instead of appending a second Match Day button after a signed-in link. In-app navigation and scoring rights remain unchanged. Outstanding-fee WhatsApp/SMS draw notices include the existing personal entry payment link; the approved WhatsApp template receives the tournament URL only in its separate link variable. No live messages, payments or deployment during verification.

### 2026-10-09 — Editable draw notice
- Generate draw shows editable notice wording and the tournament button; the same edited wording appears in the post-draw send confirmation. Explicit sends reuse the Communications engine with deduplicated Round 1 players/partners and only checked channels; no implicit sends, notification RPC/schema changes or real messages sent during testing.

### 2026-10-09 — Generate draw repeated setup information
- Removed repeated schedule summaries and preview dates, seeding selector and non-pool seed display. Retained format confirmation, read-only scoring and real pool allocation. Generation logic and club data unchanged; preview only.

### 2026-10-07 — Admin registrations lacked Paid action on organiser-selected players
- The existing EFT paid action was limited to pending_payment/pending_eft, hiding it on registered organiser entries with fee_status=due. Added one-click Paid for unsettled active fee entries, retaining existing linked-fee settlement and RLS. Manual references use ADMIN rather than claiming EFT; paid/on-account display uses authoritative fee_status, with account charges counted separately from money received. Actions wrap on narrow screens; no payment-provider, mandate, fixture or permission changes.
- Verification: 33 focused registration/status/handover tests pass; isolated browser sample with intercepted reads/writes confirms the button disappears after payment and Paid total updates to 1. Preview build OK. Live authenticated payment writes intentionally not exercised to avoid altering club payments; no real payment data changed, no publishing.

### 2026-10-07 — Structure guide estimates lacked current entry counts
- Added bracketed entered, selected and deduplicated total player-entry counts per category/subcategory, also beside Expected entries. Registration reads verify club ownership and paginate; unavailable/loading counts are explicit. Display only: no estimates, formats, registrations or fixtures changed.
- Verification: 19 focused tests passed, preview build OK, isolated browser panel shows unchanged estimate and deduplicated category/subcategory totals. Existing pairing suite has four failures because its seeded category types are missing and later steps are disabled; no unrelated production behaviour changed. Authenticated saved-tournament flow not exercised; preview only.

### 2026-10-07 — Member mobile controls still split into oversized category blocks
- Compact controls now share one wrapping strip across access/gadget categories, with 48px raised push buttons and names beneath. Removed mobile confirmations and redundant action lines; taps use existing command/access hooks immediately. Desktop and booking-light information unchanged; toggle colour follows relay readings, unavailable stays neutral, and registry pulse success feedback requires a successful command. No hardware/configuration/data changes; preview only.

### 2026-10-06 — Club ladder member visibility control was outside ladder settings
- The existing member-facing ladder visibility switch was available under Features, while admins naturally looked for it under Club Ladder settings. The same switch now appears at the top of Ladder & Challenge Rules and saves immediately; switching it off hides member access while club admins retain the ladder and all arrangement tools. The Features control stays in sync, and no ladder positions, challenge rules or history are changed. Preview only.

### 2026-10-04 — Saved club championship template appeared empty on opening
- CSIR's saved template contains three categories, league eligibility, a pools format and seven ordered stages. The builder opened on Basics, where the intentionally blank new-event name/start date obscured that saved structure. My templates now opens the copied plan on Summary and displays the template review checklist; it never changes the master or creates a tournament. New templates also clear entry-window dates for review. Tested structural round-trip in the landing suite; no club data changed.

### 2026-10-04 — Tournament invitation implied all listed events were eligible
- The Step-by-Step invitation's default "You can enter" listed every tournament event, including categories the recipient could not enter. New invitations describe them as tournament categories; older saved invitations get the same neutral wording at personalisation time. Links, audience, eligibility and tournament data are unchanged. Focused wording tests cover saved messages and email rendering. Preview only.

### 2026-10-03 — Player-booked knockout court slots mistaken for fixed organiser sessions
- Cause: a saved date and time alone classified a fixture as centrally scheduled, hiding participant Reschedule and its round deadline even when the players made the booking.
- Fix: structured fixed-stage rules remain authoritative; legacy organiser slots require club scheduling mode and no linked player booking. Player-booked slots continue to resolve the fixture's own round/play-off deadline and retain participant rescheduling. No existing bookings or match data changed; focused schedule and permission tests cover both paths.

### 2026-10-03 — Beta Continue managing orphaned cards
- Cause: Continue managing rendered device-local handover records without checking whether their real tournaments still existed. The normal tournament delete path did not clear this device-local cache.
- Fix: verify saved IDs against club-scoped tournament rows before showing cards; confirmed missing rows prune only their local handover and setup plan. A failed lookup leaves stored data intact and offers retry. Separate confirmed Remove actions delete an unfinished local draft or a local management card/plan; neither action deletes a real tournament, its fixtures, results or history. Cards refresh immediately after removal. Covered by landing tests; no live data changed.

### 2026-10-03 — Play-off stages leaked the pool's 6 Oct deadline; one progression panel
- Cause: Tournament Games matched a fixture's round row by round number + draw only, so Final (round 1) read pool "Round 1" (play by 6 Oct). Fix: `src/lib/tournaments/stage-schedule.ts` (`fixtureRoundRow` by round_id → stage_key, `resolveFixtureSchedule` from the target stage's spec schedule); header, badge, banner and Book court use it; fixed-session stages show "Scheduled <date>" and no player booking. Test: `src/test/target-stage-schedule.test.ts`.
- Removed the lower "Tournament progress — what's next" card and the raw per-stage status list; StructuredEnginePanel keeps only manual-pairing / qualifier-preview / next-knockout-round actions when actually needed.

### 2026-10-03 — Played knockout history and one organiser next-action area
- River 2 Clubs inspection: five independent groups each have four completed, scored QFs and two scheduled SFs; no Final yet. Bracket cards on the tournament page now render saved QF/SF set scores and a green winner side, while fixed feeder paths project pending stages from the stored winning member IDs; no tournament records were written.
- Step-by-Step organiser overview no longer repeats the stage progress panel with a second “What happens next” list. The panel keeps its stage-specific generation/tie controls; the planned timeline remains separate.
## 2026-09-28 — Counter mode catalogue navigation
- Counter tabs listed every product in plain text, with no fallback visual when a club had no uploaded product photo. The active tab now uses the same per-product visual fallback as the regular bar, plus a Bar/Shop choice, top category choices (specials separated), and a product search. Category switches preserve the basket and the existing tab, scan and settlement actions remain unchanged. Checked Uitsig's desktop and mobile counter against a real open tab; selecting Restaurant isolates prepared food and adding one item updates only the local basket, without posting a sale. No prices, stock, permissions or club data changed. Preview-only.

## 2026-09-28 — Uitsig Club Champs test selections cleared
- The four checked names on Uitsig Club Champs had been saved as organiser-created registrations and entry rows by Save Progress, despite having no invitations, responses, payments, fixtures or games. With guarded club/tournament-specific checks, removed those four test entry/registration rows and cleared the four draft player IDs and saved seed order. An audit event retains the former row IDs and reason. They were **not** marked withdrawn or declined, and can be invited afresh. Verified the reopened Players list shows 0 of 242 selected; no other tournaments or clubs changed.

## 2026-09-28 — Uitsig prepared food stock label
- Riverside and Uitsig's 12 restaurant products are correctly `made_to_order` with zero physical stock, but the QR page treated any zero quantity as "Out of stock" and disabled purchase. The QR page now exempts made-to-order food (and recipe specials) from the physical stock lock. Admin item rows show a club-scoped sales tally from existing member charges and visitor sales; pending/failed visitor payments do not count. Do not decrement food inventory or invent a negative balance: food is made to order, while sale rows retain quantities and history. No club data or stock was changed. Preview-only.

## 2026-09-28 — Uitsig catalogue icon follow-up
- Uitsig still appeared repetitive after the category map was filled: all products within a category reused the same symbol, and the QR menu used a box for every imageless product. Added product-name-aware fallback symbols throughout the catalogue and QR menu, with category symbols on QR filters and in the category manager. Verified Uitsig's catalogue displays different symbols for beer, mixers, cider, specials and spirits. This is display-only; no item photos, prices, stock, or club data changed. Preview-only.

## 2026-09-28 — Uitsig catalogue icons
- Riverside and Uitsig share the same category-icon map, but eleven copied custom category keys had no icon and therefore displayed generic boxes in both category choices and product tiles. Added matching icons for those keys; no product photos exist on either club's copied inventory (`image_url` is empty for all 293 items), so no images or stock records were changed. Uitsig's self-service menu remains disabled under its existing club setting. Preview-only.

## 2026-09-27 — Tournament standings tied rows use regional average order

- In singles tournaments with league-average handicap, tied standings rows (including before games) now use the same regional league index as Allocate players, with missing results last. Played results retain their standings priority; other tournament modes keep their existing ladder fallback. No draw, scores, or saved player order changed.

## 2026-09-26 — Ladder refinement repeatedly proposed already-reviewed changes

- **Cause:** Refine prepares both separate ladders, but saving the first ladder refreshed the shared member query and cleared the other ladder's unsaved proposal. The next Refine therefore proposed the unsaved ladder again. The displayed evidence also used combined men's and ladies' history while each ladder was sorted from its own category, making valid ordering decisions look contradictory.
- **Fix:** Pending proposals now survive a refresh of the other ladder, the guidance explicitly says each ladder must be saved, and ladies' rows display the same ladies-only evidence used to rank them (men's rows already did this).
- **Guard:** A ladder's visible evidence and sort input must use the same competition category; refreshing one saved ladder must never discard another ladder's pending proposal.

## 2026-09-24 — Tournament engine contract and integrity guards

- **Weakness:** Structure was partly inferred at runtime (stage type from rows, playoff mapping from settings, round count from roster), so a settings change or rebuild could reshape a live draw (Nelspruit Family Doubles).
- **Fix:** Added `src/lib/tournaments/contract.ts` (contract checks, stage plan, snake seeding, deterministic cross-pool mapping, Swiss pairing without repeats, rebuild planner, stage/knockout/re-entry/seed/schedule guards) and `docs/TOURNAMENT_ENGINE_INTEGRITY.md`. The Smart Builder now blocks playoff stages without an explicit qualifier mapping and defaults playoffs to owner approval. 13 regression tests added. No tournament data changed.
- **Open:** Legacy generator/rebuild paths in `ClubChampsView.tsx` are not yet routed through `planRebuild`/`canGenerateStage`.

## 2026-09-24 — Family Doubles standings still showed one table

- **Cause:** The detail page recognized only `round_robin` as a per-division round-robin format, while the saved Family Doubles division uses `single_round_robin`. Its pool count therefore fell back to one even though two pools and pool-numbered fixtures were saved.
- **Fix:** Recognize `single_round_robin` and `double_round_robin` alongside the legacy name when choosing pool-scoped standings. Existing entries, scores, fixtures and playoff rules are unchanged.

## 2026-09-22 — NSA tournament venue picker showed no Federation clubs

- **Cause:** The association tenant has many league-association rows. The venue planner used only the first returned row to find its Federation organisation; that row was not linked to the organisation, leaving the tree owner empty.
- **Fix:** Look up the linked association organisation across all the tenant's league rows before deriving clubs from its Federation descendants. The tree remains authoritative, so unrelated legacy affiliations still do not become venues. Added a regression test for an unrelated first row.

## 2026-09-22 — Tournament result emails understand the stage

- **Symptom:** A winner of a completed championship final received the generic "next round is coming" email because the result-email trigger only distinguished wins from losses.
- **Fix:** Result emails now classify pool play, early knockout rounds, quarter-finals, semi-finals, title finals, third-place play-offs and other placement finals before choosing the subject and message. True final winners are congratulated as champions, final losers as runners-up, and doubles partners receive the same team-aware outcome.
- **Guard:** A final label awards a title only when it agrees with the tournament's champion scope and bracket structure. Section finals feeding a league-wide final remain semi-finals; Position 2 and lower finals remain placement matches; pool and Bells results never promise a next round.
- **History:** Previously sent email remains unchanged and no historical result was resent.

## 2026-09-21 — Visitor passes have no calendar due date

- **Issue:** Day, 3-day and monthly visitor-pass rows inherited the normal membership fee date controls, even though each pass is charged only when a visitor buys it.
- **Fix:** Fee Structure now labels these rows **On purchase** and their editor shows only the pass amount. Due-day/month, pro-rate and recurring-payment controls remain available for ordinary fees but are omitted for visitor passes.
- **Scope:** Presentation and fee setup only. Pass activation windows, prices, transactions and historical dates are unchanged.

## 2026-09-19 — Rounds headings only when the admin set up rounds

- **Symptom:** Generated round numbers surfaced on pre-planned timed events and could appear out of time order (e.g. a "Round 5" game earlier than a "Round 3" game after manual moves).
- **Rule:** Round/stage headings show only when the admin created rounds (round rows with play-by dates or real labels) or the event is self-scheduled (players book own courts). Any event whose games carry pre-planned times shows one flat chronological schedule.
- **Fix:** renderMatchList in Tournaments.tsx now picks flat chronological display for pre-planned timed events without admin rounds; Bells behaviour unchanged.
- **Scope:** Presentation only.

## 2026-09-19 — Bells games display as one chronological schedule

- **Symptom:** Gordon's Bay's singles Bells games were split under generated Round 1, Round 2, etc. headings, although Bells is played as one continuous timed programme.
- **Fix:** Active Bells tournaments now show one list ordered by scheduled date, time and court. The round/list grouping control is hidden for Bells; standard tournaments retain their existing grouping choices.
- **Scope:** Presentation only. No fixtures, results, draw generation or tournament rules changed.

## 2026-09-18 — Browser push notification setup no longer hangs

- Confirmed the web notification hook waited indefinitely for a service worker after app-shell/offline worker registration was removed.
- Added a dedicated notification-only worker and bounded registration. It receives notification payloads and opens the supplied app destination, but does not cache pages or restore offline app-shell behaviour.
- Existing browser subscriptions can receive alerts after launch; new subscriptions now fail promptly rather than leaving the settings switch spinning forever when registration is unavailable.

## 2026-09-18 — Tournament invitation opening is editable

- The automatic “You have been invited to …” sentence now lives inside the invitation message editor and preview instead of being prepended only during sending.
- Organisers may edit or remove it when resending a reminder. New and legacy tournaments keep the familiar opening by default, without duplicating it.
- In-app, email, WhatsApp and SMS previews use the same edited wording. Tournament WhatsApp sends use the approved generic utility notice so no separate template can reinsert a fixed invitation sentence.

# ***** PERMANENT STITCH STANDARD — DO NOT CHANGE WITHOUT VALIDATION *****

## 2026-09-17 — Existing Android installation kept showing valid invitations as unavailable

Vian's current Nelspruit Family Doubles short invitation still resolved to an active, paid registration and had not been revoked. His phone nevertheless showed "Invitation unavailable" while the same URL worked elsewhere. Two phone-only paths could produce this false result: an already-installed Workbox worker could keep an older app shell active, and Android messaging link handling could include trailing sentence punctuation in the tapped short code. The exact short-code lookup then returned no token and the page labelled it invalid without reaching the real invitation validation.

For one release, `/sw.js` and the previously used `/service-worker.js` path are same-path cleanup workers. They activate immediately, remove only SquashHub's Workbox/app-shell caches, refresh open pages at their existing URL, and unregister themselves. Manifest, icon and home-screen installation support remain; app-shell offline caching is temporarily removed. Messaging workers are untouched. Short-code resolution also strips trailing punctuation only, in both the page and its public database resolver. Existing invite codes/tokens, registrations, pairs and payments are unchanged, and the server still rejects genuinely invalid, revoked or expired invitations.

The remaining real-phone failure was an older cached invitation bundle that called `get_tournament_invite` with the friendly short code itself. That RPC previously rejected every value shorter than a full 256-bit token before consulting `invite_short_codes`, so it returned `found=false` and the old page rendered the misleading invalid/expired state. Fresh and stale-session production simulations already used the newer two-step resolver and succeeded, which is why desktop/preview checks did not reproduce the phone.

`get_tournament_invite` now provides a server-side backward-compatibility boundary: when it receives a short value, it normalises only trailing messaging punctuation and resolves that existing code to its existing full token before running the unchanged invitation lookup and state checks. This fixes already-cached phone pages immediately without requiring a new browser bundle, cache clearing, logout, a replacement invitation, or token regeneration. Unknown codes still return `found=false`; revoked and closed invitations still return their authoritative state.

**Guard:** A route deny-list added only to a replacement service worker cannot repair clients still controlled by the old worker. When stale app-shell caching causes production invitation failures, ship a same-path cleanup worker before rebuilding offline support; preserve the current URL during cleanup and never clear unrelated messaging caches. Keep short codes on their restricted alphabet and tolerate only trailing punctuation added by messaging apps—never weaken full token, revoked, expiry or recipient checks. The public invitation RPC must continue accepting existing short codes as well as full tokens so already-cached clients remain forward-compatible.

**Status: CONFIRMED WORKING. Nelspruit (nsc) once-off Stitch Express TEST payment tested successfully by Willem on 15 Sep 2026 — payer was returned to the club app.** This is the reference implementation for EVERY club, test and live.

## 2026-09-17 — Guest tournament payments restored to the standard Stitch return

A fresh Nelspruit Family Doubles test payment incorrectly used the public invitation path (`/i/<short-code>`) as its Express `redirect_url`, and Stitch returned 404 before payment. Guest tournament payment creation now always uses the permanent club-specific return destination `https://<club-subdomain>.squashhub.co.za/my-account`. This is generic for Nelspruit, Gordon's Bay, and all future clubs, in TEST and LIVE. Public invitation paths must never be passed to Stitch Express as return destinations.

## 2026-09-17 — Tournament entrant lists hidden by recursive roster permissions

Family Doubles and Nelspruit Club Champs 2026 still contained their paid registrations and draw entries, but normal member pages displayed zero registered players or a blank draw. The registration policy first queried `tournaments`, whose entrant policy checked registrations again. Under row-level security this circular path prevented the real roster from loading. Registration and draw-entry read policies now call the existing protected `can_view_tournament(user, tournament)` predicate directly, so its internal tenant, organiser, open-format and entrant checks run without re-entering either table's row policies. This preserves host-club and legitimate cross-club entrant access without exposing roster data anonymously or changing registrations, pairings, invitations, or payments.

**Guard:** Tournament roster policies must never query `tournaments` directly when tournament visibility itself depends on registrations or entries. Use the protected tournament-access predicate directly and preserve tenant/entrant scope.

## 2026-09-17 — Family Doubles partner lookup remained blocked after verification

The public invitation page started its doubles pairing queries before a guest, or a person signed into a different account, had completed the token-bound surname/phone check. That failed query was cached without the verification value in its key, so entering the correct detail did not restart it and the partner area could remain loading or empty. Partner queries now wait for required verification, include that value in their cache keys, do not repeatedly retry verification failures, and show a retryable error. Eligibility remains restricted to registrations for the same tournament and doubles division.

## 2026-09-17 — Invited players can pay their entry fee without a login

Invitees who answered by WhatsApp link were bounced to the club login when they
tapped "Pay entry fee", because `stitch-create-payment` only accepted a signed-in
session. Added a guest path: the invite token (plus the same surname / last-4-digits
check used to accept or withdraw) authorises the payment.

- New SECURITY DEFINER RPC `tournament_invite_payment_context(p_token, p_verify)`
  (EXECUTE: service_role only) — validates the token, runs `invite_verification_ok`
  for people without a login, and returns club, member, registration, amount and
  description. The client can never dictate the amount or the payer.
- `stitch-create-payment` accepts `invite_token` / `invite_verify` in place of a
  session; all charge fields are taken from the RPC, never the request body.
- `stitch_payment_sessions.user_id` is now nullable (invitees may have no login).
  The webhook never used it; `stitch-verify-payment` still requires a session and
  is unaffected.
- The invitation may start the payment, but the Stitch return URL remains the
  registered club-specific `/my-account` destination. Never use an `/i/<code>`
  invitation path or `/pay/return` as the Express return destination.

## 2026-09-17 — Cross-club tournament WhatsApps were silently skipped


Symptom: after the client-side batch fixes were published, the Bells send made
46 successful calls to `send-whatsapp`, but only the nine CSIR members had log
rows and no new messages reached players from the other clubs.

Cause: `send-whatsapp` resolved a supplied `member_id` only when that member
belonged to the sending club. Cross-club tournament registrations are valid,
but their phone numbers were therefore unresolved and every one was returned as
`skipped: no valid phone` before the provider call or delivery-log insert.

Fix: for a `champ_entry` interaction only, the function verifies that the
tournament belongs to the sending club and resolves only recipient member ids
that have registration rows for that exact tournament. Phone numbers remain
server-side and member opt-outs remain enforced. All other WhatsApp sends keep
their existing club-local behaviour.

RULE: cross-club tournament contact details must never be exposed to the
organiser's browser. Resolve them server-side only after checking both tournament
ownership and the recipient's registration.

## 2026-09-17 — Phone-only members were dropped from tournament invites

Symptom: members at other clubs received no WhatsApp invitation even though they
have a cell number on file.

Cause: `reachableMemberIds` in `ClubChampsTab.tsx` treated a member as reachable
only when they had a linked login or an email address. Phone-only members were
therefore filtered out of the invitee picker / audience before any channel was
considered, so WhatsApp and SMS never even attempted them. The server-side
directory RPCs (`tournament_invite_member_directory`,
`tournament_invite_league_tree`, `tournament_invite_league_member_ids`) already
use the correct rule: contactable = email OR phone.

Fix: client-side reachability now matches the server — a member is reachable if
they have a linked login, an email address OR a phone number.

RULE: contact-channel eligibility is per channel. Email needs an email address;
WhatsApp/SMS need only a phone number. Never gate a phone channel on email.

## 2026-09-17 — Re-sent tournament invite still showed "not entered"

**Symptom:** Willem replied positively to a re-sent Bells invitation, but the same personal link said he was not entered.

**Cause:** the earlier withdrawal left `declined_at` and `confirmation_source = 'withdrawn'` on the registration. The organiser's re-invite changed only `status` back to `invited`; the invitation page correctly treated the remaining decline date as authoritative.

**Fix:** organiser re-invites now clear the old decline/withdrawal and confirmation markers while reopening the row. Database trigger `trg_normalize_reopened_tournament_invite` enforces the same invariant for older published clients: a deliberate `cancelled` → `invited`/`pending_payment` transition cannot retain stale decline state. Existing paid/confirmed entries are untouched. Willem's existing Bells registration was repaired in place so its current short link remains valid.

## 2026-09-17 — Tournament WhatsApp invites stopped after 9 of 49

**Symptom:** 49 players were invited to the CSIR "6th vs 7th League Players Bells Get Together"; only the first 9 received a WhatsApp.

**Cause:** the WhatsApp loop in `ClubChampsTab.tsx` had `break` inside its catch — the first recipient that threw (e.g. a member with no phone number on file, such as Nico Van Niekerk) aborted the whole batch silently, leaving 40 players unsent.

**Fix:** the loop now continues past a failure, counts sends and failures, and reports `X sent, Y failed` with the first few names. Never re-add a `break` there.

## The standard (non-negotiable)

1. **Club-specific return URL, derived from the club's subdomain.** Once-off Stitch Express payments must return to
   `https://<club-subdomain>.squashhub.co.za/my-account`, built generically from the `clubs.subdomain` column.
   There must be NO per-club code branches (no Nelspruit exception, no Gordon's Bay exception). nsc → `https://nsc.squashhub.co.za/my-account`; gb → `https://gb.squashhub.co.za/my-account`.
2. **Never substitute the shared callback.** A valid club-subdomain return URL must never be replaced by
   `https://www.squashhub.co.za/pay/return`, by the apex, or by a club-hosted `/pay/return` path, and the
   `redirect_url` query parameter must never be silently stripped from the Express hosted link. The shared
   apex callback survives only as a last resort when a club has no usable subdomain.
3. **`/my-account` is the proven path.** `/pay/return` on a club host is normalised to `/my-account`. A deliberately
   supplied, valid club-specific destination other than `/pay/return` is preserved as supplied.
4. **Test and live behave identically.** Credential type (`test-` Express client vs live/client-portal) has NO effect on
   the redirect rule. Express token/payment calls succeed on test credentials; an `invalid_client` on
   `secure.stitch.money/connect/token` merely means that club has no payment-request credentials — expected, harmless,
   and unrelated to redirects.
5. **Webhooks and redirects are separate responsibilities.** Webhooks (`stitch-webhook`, direct function URL) process
   payment status events and are the authority for settlement. Redirects only decide where the browser lands. Never
   change the working webhook implementation in order to fix a browser redirect, and never rely on the redirect to
   confirm a payment.
6. **Onboarding requirement for every new club.** In the club's own Stitch Express dashboard
   (Settings → Redirect URLs, max five URLs, PER CLUB — not platform-wide) register
   `https://<sub>.squashhub.co.za/my-account` and, where Stitch permits it, `https://<sub>.squashhub.co.za/*`.
   The Banking tab shows the club's exact URLs. The application then generates the matching club-specific redirect.

## Why (the regression this replaces)

On 17 Aug 2026 `sanitizeReturnUrl()` was changed to ignore its argument and always return the shared
`https://www.squashhub.co.za/pay/return`. No club has that host in its own Stitch redirect list, so Stitch Express
404'd the hosted link ("Page Not Found"), the reachability probe then dropped `redirect_url` entirely, and every payer
— Nelspruit AND Gordon's Bay — was parked on Stitch's own payment-success page. A later partial fix rewrote only the
host and kept the `/pay/return` path, which still 404'd. Restoring the 09 Aug shape (club subdomain + `/my-account`)
fixed it, as confirmed by the 15 Sep 2026 Nelspruit test.

## DO NOT CHANGE

Do not alter `sanitizeReturnUrl()`, `appendExpressRedirectUrl()` or `appendRedirectIfReachable()` in
`supabase/functions/stitch-create-payment/index.ts` without first validating the change end-to-end against the
known-working Nelspruit (nsc) and Gordon's Bay (gb) flows. Expected fresh link shape:
`https://express.stitch.money/pay/<id>?redirect_url=https%3A%2F%2F<sub>.squashhub.co.za%2Fmy-account`.
Recurring/mandate, bar/POS and other gateway flows are separate and out of scope of this standard.

# 2026-09-16 — Booking reminder showed court ID instead of court name

**Reported:** the "Court booking tomorrow" reminder email said "Court 9" — the numeric `bookings.court_id`, not the court's name.
**Fix:** `supabase/functions/reminders/index.ts` booking + challenge-schedule sections now batch-fetch `courts.name` for the day's court IDs (`courtNameMemo` / `courtLabel`) and use the real court name, falling back to `Court <id>` only when the court row is missing. Deployed.

# 2026-09-16 — Tournament self-withdrawal on the invitation link (organiser-controlled)

Willem: the "You're entered" invitation card must carry a withdraw option, allowed up to a configurable number of days
before the tournament (his example: 2), and only when the tournament allows it. Fees already paid are forfeited.

- Schema: `tournament_governance.withdrawals_allowed` (default true) and `withdrawal_cutoff_days` (default 2), exposed
  through the `club_champs` view (appended columns) and written by the `zz_club_champs_compat_extra_*` INSTEAD OF
  triggers. `tournament_withdrawal_deadline(start_date, cutoff_days)` is the single source of the cut-off.
- New RPC `withdraw_tournament_entry_public(p_token, p_verify)` — same token + verification contract as
  `respond_tournament_invite_public`. It cancels the registration (`confirmation_source = 'withdrawn'`), deletes the
  player's `club_champs_entries` rows and cancels any `champ_doubles_pairs` they are in. It refuses when the organiser
  disabled self-withdrawal or the cut-off has passed. NO refund is issued — that stays an organiser decision.
- `get_tournament_invite` now returns `withdrawals_allowed`, `withdrawal_cutoff_days`, `withdrawal_deadline`.
- UI: `withdrawalInfo()` in `src/lib/tournaments/invite-link.ts` (covered by `src/test/tournament-withdrawal.test.ts`)
  decides whether the control is shown; `TournamentInvite.tsx` renders it on both the entered and
  entry-fee-outstanding states, behind a confirm step. The organiser toggle + cut-off live in the tournament setup's
  Registration window section.

Rule: withdrawal stays self-service with no approval step, and the cut-off is per tournament — never hard-coded.

# 2026-09-16 — Event/tournament withdrawal: members told they can change their answer

Willem asked how a member who confirmed attendance can later withdraw. Investigation showed the capability already existed
end-to-end but was never communicated:

- `EventDetail` (`/events/:id`) always allowed confirmed → declined toggling; button now reads **Withdraw** once confirmed.
- `whatsapp-inbound` upserts `club_event_rsvps` on every reply, so a later free-text "NO" after a "YES" already flipped
  the member to declined (7-day interaction window). Tournament (`champ_entry`) NO replies already cancel the registration.
- Gap was discoverability: invites never mentioned withdrawal.

Changes (messaging + labels only, no flow changes):
- Event invite + updated-invite notifications and WhatsApp `rsvp_question` details now say members can withdraw any time
  ("Plans change? You can withdraw any time on the event page" / "Changed your mind later? Just reply NO any time before
  the event to withdraw"). Reminder texts in `reminders/index.ts` carry the same note.
- Invite notification `url` now deep-links to `/events/<id>` instead of `/events` so the member lands directly on the
  page with the Confirm/Withdraw buttons.

Rule: withdrawal stays self-service via these two channels (event page toggle, WhatsApp NO reply). Do not add a separate
withdrawal request/approval flow for club social events without explicit instruction.

# 2026-09-16 — Family package: existing members were billed before accepting

`family_add_member()` set the invited person's fee category to "Additional Family Member" and
created/rewrote their unpaid club fee even when the family row was created as `invited`, despite the
UI promising "They'll be asked to accept before they're linked".

Fix: for `_existing_member_id` the function now only creates the pending row and notifies that
member — no category or fee mutation. New RPC `family_respond_invite(_family_member_id, _accept)`
(caller must be that member or a club admin) applies the category + fee line with the payer recorded
on accept, and cancels the request on decline. New `FamilyInviteCard` on My Account gives the
invited member the accept/decline choice. Brand-new people added by name still activate immediately.

DO NOT reintroduce account mutations inside `family_add_member` for existing members.

# 2026-09-16 — Event reminder system wired up and smoke-tested end-to-end

- **What was implemented:** The `reminders` edge function's event section now sends each occurrence's reminder through the event's notify flags — in-app always, WhatsApp when `notify_whatsapp` (club opt-in + member opt-out enforced by `send-whatsapp`), email when `notify_email` (queued through `email_outbox`). The invite list falls back to event-level `club_event_rsvps` when an instance carries none (older events). A daily cron job `event-reminders-daily` (0 4 * * * UTC = 06:00 SA) invokes the function with the `reminders_internal_secret` from `app_settings`. `CreateClubEvent` gained a 36-hour reminder option.
- **Smoke test (real sends):** Manually invoked the function with the internal secret. Found and fixed a crash: 168 active bookings have a NULL `user_id`, and `String(null)` produced the literal `"null"` which failed UUID parsing (`22P02`) — booking recipients are now validated as UUID-shaped before any send. After the fix the full run returned 200: 8 in-app notifications + 8 WhatsApp event reminders were delivered for the Thursday Social (17 Sep) to members with linked logins/phones, keyed on event-level RSVPs.
- **Dedup guard — DO NOT CHANGE:** Event reminder log rows are keyed `scheduled_for = occurrence date` (not the run date), so a member gets at most ONE reminder per occurrence even if the instance stays inside the reminder window across multiple daily runs. Note: changing this key on 16 Sep caused one duplicate reminder round (the first sends were keyed on the run date); duplicates will not recur.
- **Backfill:** `club_event_instance_rsvps` were backfilled for all scheduled future occurrences of older events that predate the instance-RSVP sync trigger (12 rows per instance for Thursday Social).



- **Symptom:** Willem reported two thumbs-up/down-style buttons under every confirmation-asking WhatsApp message; members didn't know whether tapping them accepted the invite.
- **Cause:** The approved `rsvp_question` template (`squashhub_rsvp_question_v3`) was registered on Twilio as a `twilio/quick-reply` with actions `Yes` / `No` (from `whatsapp_templates.quick_replies`). WhatsApp rendered those as two tappable buttons below the message body.
- **Fix:** New template version `squashhub_rsvp_question_v4` — same body/variables, buttons sentence replaced with "Please reply Yes or No to this message", `quick_replies` cleared, submitted to Meta for approval (pending). Until approved, send-whatsapp falls back to the button-free `club_notice` template, so no message carries buttons in the meantime. Inbound classification (`reply-intent`) already treats free-text "yes/ja/no" replies as authoritative, so RSVP/entry confirmations keep working. Do NOT re-add `quick_replies` to this template.

# 2026-09-15b — Express hosted link 404: club subdomain was right, path `/pay/return` was wrong

- **Symptom:** After the club-subdomain fix, the generated Nelspruit TEST link `https://express.stitch.money/pay/<id>?redirect_url=https%3A%2F%2Fnsc.squashhub.co.za%2Fpay%2Freturn` returned Stitch "Page Not Found".
- **Finding:** `sanitizeReturnUrl()` rewrote only the HOST onto the club subdomain and kept the caller's shared path `/pay/return`. Nelspruit's Stitch portal registers `https://nsc.squashhub.co.za/my-account` and `https://nsc.squashhub.co.za/*`, but the proven-working Express links (GB, 09/17 Aug) always ended in `/my-account`. Stitch Express 404s the hosted link when the redirect target does not match a registered URL.
- **Fix (once-off Express payment only):** when the host is rewritten onto a club subdomain, or the resolved host is any club subdomain, a `/pay/return` path is normalised to `/my-account`. Explicit club-specific destinations other than `/pay/return` are preserved as supplied.
- **Guard — DO NOT CHANGE:** `/my-account` is the proven Express return destination pattern. A club-specific return URL must never default to `/pay/return`. Expected new link shape: `https://express.stitch.money/pay/<id>?redirect_url=https%3A%2F%2F<sub>.squashhub.co.za%2Fmy-account`.

# 2026-09-15 — Once-off Stitch payments stopped returning to the club (regression of the 09 Aug flow)

- **Symptom:** Test and live once-off card payments (Nelspruit, Gordons Bay) completed successfully but parked the payer on Stitch's "payment successful" page instead of returning to the club app.
- **Finding:** On 17 Aug `sanitizeReturnUrl()` in `stitch-create-payment` was changed to ignore its argument and always return the shared `https://www.squashhub.co.za/pay/return`. No club has that host registered in its own Stitch redirect list, so the hosted link probe returned 404 and `appendRedirectIfReachable()` then dropped the `redirect_url` parameter entirely, leaving a bare hosted link. Evidence: the last link carrying a working return address is GB on 17 Aug (`?redirect_url=https://gb.squashhub.co.za/my-account`); every link since (GB 5–12 Sep, NSC 15 Sep) is bare. Nelspruit's `test-` Express credentials are NOT the cause — the Express token/payment calls succeed and payments complete; the `invalid_client` on `secure.stitch.money/connect/token` only means that club has no payment-request (client-portal) credentials, which is expected and harmless.
- **Fix:** Restored the 09 Aug shape. `sanitizeReturnUrl(raw, clubSubdomain)` again folds `www` → apex and rewrites apex/preview hosts to the club's own tenant subdomain, and the club's `subdomain` is passed in from the already-loaded `clubs` row. The club-specific `redirect_url` is appended to the Express hosted link and is also sent as `redirectUrl` on the payment-request route. The reachability probe is kept for logging, but a valid club-subdomain return URL is never stripped.
- **Guard:** The Stitch redirect allow-list is PER CLUB (five URLs each), not platform-wide. Each club registers `https://<subdomain>.squashhub.co.za/*` in its own Stitch portal. Never force the shared apex callback in place of a club subdomain, and never silently strip `redirect_url` when the host is a club subdomain. Recurring/mandate, bar, and other gateway flows are separate and were not touched.

# 2026-09-03 — Counter mode dropped back to the tabs list after charging a member account

- **Symptom:** When a bar counter staff member settled a tab by charging it to a member account, the active tab immediately disappeared and the screen returned to the open-tabs list, which felt like leaving counter mode.
- **Finding:** `chargeMemberAccount` cleared `activeTabId` right after the backend call, so the UI re-rendered the board before the staff had a chance to confirm the receipt or continue serving.
- **Fix:** Counter settlements (member account, cash, and card machine) now keep the counter context open and display a receipt card with the total, method, item lines, and member name. The staff taps **Next customer** only when ready to return to the open-tabs list.
- **Guard:** A settled tab must never silently vanish from the counter UI; always show a confirmation step and require an explicit action to leave the serving context.

# 2026-09-03 — Counter mode was configured but absent from the QR menu

- **Symptom:** Riverside had an active counter PIN, but the person scanning the club menu QR could not see any way to open Counter mode.
- **Finding:** The counter route and unlock screen existed, but the public QR menu never rendered a link to that route.
- **Fix:** Added a persistent **Counter mode** action to the QR menu status strip; it opens the club-code-scoped PIN screen without requiring a login.
- **Guard:** Every club menu QR must expose the counter entry point. The backend PIN remains the authorization boundary, so merely seeing the action grants no counter access.


# 2026-09-03 — Open bar tabs could not be charged to a member account

- **Symptom:** After a QR customer opened a tab, its settlement card only offered online card or counter swipe, so a member could no longer choose the member-account option.
- **Finding:** Member-number/PIN checkout was implemented only for the current basket; the restored open-tab panel had no equivalent action or secure conversion path.
- **Fix:** The open-tab panel now offers **Charge tab to my member account**, identifies only an active member of that QR code's club, requires that member's six-digit Bar PIN, and atomically converts the tab into member-account entries without changing stock twice.
- **Guard:** Opening a visitor-style tab must not remove the member-account payment option; settlement still requires club-scoped member identification and personal PIN verification before any debtor entry is posted.

# 2026-09-03 — GoBook accepted bookings without returning a booking ID

- **Symptom:** A member could receive “GoBook accepted the request but returned no booking ID,” while the court was actually reserved in GoBook and no native calendar row appeared until a later refresh.
- **Cause:** The official API sometimes returns a successful `Booking/Book` response without the new reference in the response shape expected by SquashHub.
- **Fix:** `gobook-api` now checks for an existing exact booking before submission, recursively reads supported response envelopes, and after provider acceptance recovers the one newly-created booking from the member's GoBook booking register. It never repeats a provider-accepted booking. The native booking request now also passes its end time so multi-slot matches are exact.
- **Recovery:** Confirmed the reported booking as GoBook `3598558` for Court 3, 12:00–13:00 on 4 Sep 2026; a core-day sync restores it to the SquashHub calendar.

# 2026-08-30 — Bar checkout controls remained at the bottom on mobile

- **Symptom:** After selecting bar products, the account/card payment controls still rendered at the bottom of the product list instead of remaining visible.
- **Finding:** The checkout used bottom-sticky positioning below the desktop breakpoint and remained inside the animated tab content, where ancestor layout behavior could keep it in normal flow.
- **Fix:** The selected-cart checkout now renders through a document-level portal, stays fixed below the header on phones, and uses a fixed right rail from tablet widths upward.
- **Guard:** Transaction controls for a non-empty bar cart must remain viewport-fixed and outside scroll/transform containers; never require scrolling to the end of the product catalogue.

# 2026-08-29 — Mixed ladder rendered as separate men's and ladies' ladders

- **Symptom:** Nelspruit's combined club ladder still appeared as separate men's and ladies' lists and pyramids for some users.
- **Finding:** Ladder numbering read `mixed_ladder_enabled` directly from the database, but the page layout read it from a club-context object that can omit restricted/non-public club fields, particularly during fallback or cross-tenant admin access.
- **Fix:** The ladder page now loads `mixed_ladder_enabled` with its own club-scoped display-settings query and waits for that query before choosing the combined or split layout.
- **Guard:** Ladder numbering, challenge grouping, and list/pyramid layout must all use the same authoritative mixed-ladder setting; never infer it from gender or a partial public club object.

# 2026-08-29 — Reschedule / court-booking buttons were hard to see in dark mode

- **Symptom:** On the member Tournaments list and My Championships dashboard cards, the "Reschedule" / "Make your court booking" button used a navy outline that blended into the dark card background.
- **Fix:** Introduced a semantic `--reschedule` colour token (light green) and applied a solid green pill style to all court-booking/reschedule actions in `src/pages/Tournaments.tsx` and `src/components/MyChampionships.tsx`.
- **Guard:** Use the `reschedule` Tailwind token for any new scheduling action so it stays consistent across light and dark themes.

# 2026-08-27 — Mobile Chrome PWA install prompt event was lost during auth loading

- **Symptom:** Eligible Android Chrome users, including Vian at Nelspruit, did not receive the SquashHub install prompt even though the manifest and service worker were valid.
- **Cause:** `beforeinstallprompt` is a one-shot browser event, but both listeners lived in authenticated React UI. Chrome could emit it before authentication and club context finished loading, so the event was permanently missed.
- **Fix:** Added an app-start install-event broker that captures and retains the event before React/auth initialization. `InstallPrompt` and the Settings install card now subscribe to the retained event and consume it only after the browser prompt is used.
- **Scope:** Install flow only; service-worker update behavior and preview/native guards are unchanged.

# 2026-08-27 — Club Admin spinner and recursive membership-policy failures

- **Symptom:** A platform administrator opening Club Admin for a tenant without a local membership row was redirected, left on a spinner, or saw partial admin data fail with backend 500 responses.
- **Finding:** The page conflated unresolved authorization with denied authorization, while a redundant `club_members` delegate-visibility policy re-entered membership access checks and caused `42P17` policy recursion.
- **Fix:** Club Admin now waits for explicit platform-role resolution without waiting for a tenant membership row. The membership helper runs under its fixed owner context, and the redundant recursive delegate policy was removed; the normal same-club, own-row, and platform-admin visibility policies remain authoritative.
- **Guard:** Platform administrators must be able to administer any resolved tenant without a local `club_members` row. Keep membership helper functions security-definer with a fixed search path, and do not add `club_members` policies that query `clubs` policies which query `club_members` again.

# 2026-08-27 — Existing Riverside member was shown new-member onboarding after login

- **Symptom:** An existing, active Riverside member signing in with Google was shown the six-step new-membership wizard.
- **Finding:** The member row and auth link were correct, but a transient membership-query failure caused the dashboard to treat missing query data as a confirmed missing membership.
- **Fix:** The dashboard now suppresses all onboarding decisions while the membership query is in an error state; the repaired membership policy allows the existing Riverside row to resolve normally.
- **Guard:** A new-member workflow may open only after a successful membership lookup confirms there is no tenant membership. Loading or failed queries must never be interpreted as absence.

# SquashHub — Project Structure, Issue & Fix Log

> **Purpose.** This is the canonical reference for *how the system is wired* and *what has already
> gone wrong and how it was fixed*. Before debugging anything in this project, search this file
> first. If a fix is recorded here, re-apply the recorded approach — do not re-invent it, and do
> not undo it.
>
> **Maintenance rule.** Every time a production issue is diagnosed and fixed, append an entry to
> §4 using the `Symptom → Finding → Fix → Guard` format. Never delete old entries; mark them
> `SUPERSEDED` if a later fix replaces them.

Last updated: **26 August 2026**

---

## 1. System overview

| Layer | Tech | Notes |
| --- | --- | --- |
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind | SPA, `BrowserRouter`, hosting has built-in SPA fallback |
| Mobile | Capacitor wrapper + PWA | Service worker everywhere except iframes/preview/native |
| Backend | Lovable Cloud (Supabase) | Postgres + RLS, Edge Functions (Deno), Storage, Realtime |
| Payments | Stitch (cards + recurring mandates) | Two **separate** flows — see §3 |
| Messaging | Resend/SMTP email, Twilio WhatsApp, Web Push | `email_send_log`, `whatsapp_send_log` |
| Hardware | Shelly relays (court lights, door access) | GPS geofence gate for door open |

### Core domain rules (never violate)

1. **Single tenancy** — a user belongs to one club. Every query filters by active `club_id`.
2. **Decoupled identity** — `club_members` is the truth for profile data; `profiles` is auth only.
3. **Ladder immutability** — `ladder_position` in `club_members` is the single source of truth;
   migrations/imports never reshuffle it; bulk changes >5 are blocked unless explicitly flagged.
4. **Captain ≠ admin** — captain is league-scoped only; only `role='admin'` grants club admin.
5. **Secrets isolation** — credentials live in the restricted `club_secrets` table, never in
   `clubs` or client code.
6. **League = Association** — interchangeable terms, same entity (`association_id`).
7. **Permanent affiliations** — league numbers in `member_association_affiliations` are never
   deleted, only deactivated.

### Key directories

```
src/pages/            route-level screens (Tournaments, ClubChampsView, LeagueGameDetail, …)
src/components/       feature components; club-admin/ holds admin panels
src/lib/              pure logic: fee-proration, tournament-playoffs, scheduler, stitch-checkout
src/hooks/            use-saas-pricing, use-door-proximity, …
supabase/functions/   Edge Functions (payments, NSA posting, billing, messaging)
docs/                 this file + Android/mobile references
```

---

## 2. Money & billing model (high blast-radius area)

- **Member fees** — categories in `member_fee_categories`; pro-rata joiners handled centrally in
  `src/lib/fee-proration.ts` (rule: joining within one month of renewal rolls into the next season).
- **Ledger** — cash-basis double-entry in `club_journal_entries`; every credit must have legs.
- **Platform SaaS pricing** — graduated sliding scale R6.00 → R2.50 per **active, non-visitor**
  member, R250/month minimum, billed **monthly in advance**. Single source of truth:
  `src/hooks/use-saas-pricing.ts` + `computeTieredCharge`. First platform invoicing date:
  **1 September 2026**. Annual upfront requires a club request + super-admin approval.
- **Trial → invoice** — `run-subscription-billing` issues the first invoice the day after trial end.

---

## 3. ⚠️ Payments: two separate flows — do not mix

This has caused repeated regressions. They share a provider (Stitch) and *nothing else*.

| | **Once-off / top-up** | **Recurring (mandate)** |
| --- | --- | --- |
| Edge functions | `stitch-create-payment`, `stitch-verify-payment` | `stitch-create-mandate`, `stitch-refresh-mandate`, `stitch-reconcile-mandates` |
| Frontend | `src/lib/club-payments.ts` (`startClubCheckout`) | `src/components/PaymentMethodsCard.tsx`, `src/lib/stitch-checkout.ts` |
| Tables | `stitch_payment_sessions`, `stitch_collections` | `stitch_mandates`, `stitch_collections` |
| Return handling | redirect back to `/pay/return` | app tab stays open and **polls** every 4s |

**Standing instruction from the product owner (9 Aug 2026):** when fixing one flow, change only
that flow's files. Do not "harmonise" the other one, and do not refactor a flow that is confirmed
working.

**Hard constraint:** Stitch Express allows only a small redirect allow-list. Every club must use the
single shared callback `https://squashhub.co.za/pay/return`; it forwards to the correct tenant/page
using validated callback parameters. Never create or require one whitelist entry per club.

---

## 4. Issue log

Format: **Symptom → Finding → Fix → Guard.** Newest first.

### 2026-10-28 · Treasurer tournament Paid updates silently filtered
- **Symptom:** After removing the JSON coercion error, Paid still returned “Payment was not confirmed”.
- **Finding:** Hosted requests identify the Uitsig Treasurer account, whose saved finance/fees permission is valid but champs permission is false. Direct fee and registration writes are filtered by separate admin/champs policies, returning empty success responses without settlement. Earlier Super Admin preview checks did not exercise that actor.
- **Fix:** Migration 0287 adds `champ_admin_confirm_paid`, validating exact club/tournament/registration and existing champs/fees/finance authority. One transaction settles only an existing linked fee and marks the registration, using the canonical fee calculator and an audit event; retries do not re-charge. No full-admin or tournament management grant. Paid UI calls that single action.
- **Guard:** 18 tests pass including isolated Treasurer-only R100 settlement, ordinary-member/cross-club denial, no duplicate fee or audit, and rollback if the registration fails. Deployed authenticated already-paid check returns success without writes. Real unpaid member statuses untouched; frontend preview only; unpaid Treasurer UI submission not performed. Shared web/PWA/native action, no native integration changes.

### 2026-10-28 · Tournament Paid action singular JSON response (SUPERSEDED by atomic payment action above)
- **Symptom:** Admin reported a JSON error selecting Paid for Club Champs.
- **Finding:** The registration update demanded exactly one JSON object with `.single()`; an empty returned update produces a JSON coercion error. User screenshots confirm that exact message; hosted logs show registration PATCH 406 responses at 11:32 and 11:35 UTC. Linked fee settlement runs first and can already have marked the registration paid.
- **Fix:** Request an array response and, if no row returns, read back the exact tournament/registration and require saved paid status before reporting success. No permission changes or new fees; unconfirmed writes produce a clear payment/permissions message rather than false success.
- **Guard:** 11 focused tests pass, covering array responses, an already-settled readback, permission errors and empty updates with an unpaid readback; preview build OK. Signed-in Riverside administration opens, but no live payment was submitted. No real member payment statuses changed during testing; preview only.

### 2026-10-20 · Rachel Gates NSC full bar and finance domain access
- **Symptom:** NSC treasurer could not access all bar administration and club-finance information/actions.
- **Finding:** Rachel already holds the Treasurer role with fees/banking/members/bar/finance, but GL accounts, banking writes, fee billing, ledger audit and some bar operations still required full club administration. NSC uses legacy permissions.
- **Fix:** Migration 0219 adds an active-member, exact-NSC, exact-Rachel domain helper requiring her existing protected bar/finance grant; 13 additive policies and preserved-body billing/sales/settlement guard patches. No full-admin or role changes, financial records/balances untouched; audit_events records the access repair.
- **Guard:** Isolated PostgreSQL tests against the applied migration cover bar/finance reads and writes, billing/sales, other-member and cross-club denial, unrelated authority denial and grant revocation. Authenticated Rachel preview opens NSC Club Finance and Bar/POS, reads GL accounts, guest tabs and ledger audit without errors; no payments/settings/counter/hardware actions submitted. Counter personal PIN remains required. Build OK; no publication. Native-specific testing not performed.

### 2026-10-20 · NSC pyramid and verified-result follow-up
- **Symptom:** Same-row NSC challenge was blocked and the reported result had no challenge link, so confirmation would never move the ladder.
- **Finding:** Same-row pyramid challenges were not configurable. Legacy confirmed-match processing ran twice, excluded mixed-gender movement and ignored the newer automatic approval setting.
- **Fix:** Added opt-in same-row setting, enabled for NSC only; retain directly-above row, higher-ranked opponents, open limits and insert movement. NSC confirmed challenge/explicit ladder results now use member-first tenant checks and the existing mixed ladder engine once, with a match stamp and stable award ID. Aligned NSC automatic points with its existing automatic ladder switch. Classified the reported 3–1 as ladder, still pending Leone verification; positions remain 70/68.
- **Guard:** 22 focused Vitest checks and isolated synthetic PostgreSQL tests cover pending vs confirmed, mixed 70→68 insert, one award, repeated confirmation and friendly exclusion. Authenticated Riverside ladder still renders unchanged. No live confirmation submitted, hardware operation or publication; member confirmation UI not exercised. Other clubs retain legacy processing. Web/PWA/native share this server result path; native-specific testing not performed.

### 2026-10-20 · NSC reported challenge result and profile shortcut
- **Symptom:** Stiaan Swanepoel could not start a challenge against Leone Human; reported winning 3–1 today.
- **Finding:** Video shows Profile → Challenge returning to the ladder without selecting an opponent. No challenge or match existed between these NSC members. Saved NSC configuration is pyramid: positions 70 and 68 are both row 12, so this pairing is ineligible; Stiaan also has an older pending outgoing challenge. The profile shortcut previously used a positional gap and hid the actual rule explanation. Hosted match notification triggers are absent even though their function exists.
- **Fix:** Profile passes the selected member to the existing ladder dialog, preserving club query parameters, member-first identity and eligibility explanations. Owner-reported 3–1 stored with null game scores, no fabricated challenge/court, pending Leone verification; one in-app notice and verification email queued explicitly with an audit. No ranking/ladder update, rules change, deployment or publication.
- **Guard:** Focused tests preserve member selection, club-target exclusion and the NSC same-row block. Result/notice/email/unchanged positions read back. Browser checks use Riverside only; current Super Admin membership may show the account-link explanation rather than a sendable challenge. Existing missing statistics RPCs are outside this fix.

### 2026-10-18 · Marnus follow-up: rescheduling ownership mismatch
- **Symptom:** after the self-conflict correction, moving Marnus's match failed with Booking member ownership mismatch.
- **Finding:** the real ownership trigger rejects reactivating the old ownerless Club Championships hold; it also rejects player B moving the player-A-owned fixture. Previous isolated tests did not install that trigger.
- **Fix:** migration 0178 adds exact club/fixture/participant-validated tournament authority while preserving player A ownership and financial checks. Restoring an unchanged, ownerless hold requires proof it was released for that now-moved fixture. No client flags, broad club_event exemptions or overlap bypasses.
- **Guard:** tests install actual ownership and overlap triggers, reproduce the error, and cover restored holds, opposing participants, distinct auth/member identities, balance denial, forged owners, club mismatch and real clashes. Hosted readback confirms application; Marnus's fixture remains unchanged. No frontend publication or hardware operation; actual member UI mutation remains unverified to avoid moving live games.

### 2026-10-15 · Bar/shop scan-to-pay PDF poster
- **Symptom:** Admin needed a visible poster action in QR setup and printed instructions reflecting cash/swipe and other enabled methods.
- **Finding:** A PDF was hidden inside Menu QR; its verbose layout could extend into the footer, and online wording did not check supported gateway availability.
- **Fix:** Added Poster (PDF) alongside QR controls; Bar / Shop / Bar & Shop heading choices; single-page large QR, three purchase steps, and explicit enabled-method list. PDF is prepared before the download click. Member-account wording specifies membership number/Bar PIN; online appears only for enabled supported gateways.
- **Guard:** 21 tests pass, including all 16 payment-switch combinations. Signed-in Riverside admin downloaded both combined and shop posters; both pages visually checked with no overlaps or clipping, no page errors. Payment processing, settings, stock and live data unchanged; preview only, native downloads not device-tested.

### 2026-10-13 · Standalone mixers on the spirits menu
- **Follow-up:** The first bulk tile was an inventory container, not the bottled Buddy. Mixer selection now includes the real Buddy/Buddies product and excludes parent containers when a serving option exists. Uitsig's existing Buddies renamed Buddy with the requested bottle image, preserving its R22 price and stock. Both bulk records have R0 saved; no selling price inferred from specials. Four focused tests plus 13 inventory tests pass; browser shows separate Buddy and bulk-serving basket lines. Menu code remains preview-only; Buddy name/image saved live as requested.
- **Symptom:** Buddy controls beside every spirit option were unwanted; Buddy and Coke Bulk should be separate items on the spirits page.
- **Finding:** Both QR and member menus used a per-option picker, while bulk mixers are omitted from the normal sellable QR menu.
- **Fix:** Removed the per-option controls and included existing mixer rows as independent tiles in Spirits, reusing the QR buddies payload and club-scoped inventory. Mixer tiles bypass spirit variant grouping.
- **Guard:** Three focused tests cover inclusion, ID deduplication and category isolation; browser checks selected both Coke Bulk rows independently. No stock, price, payment, schema or live-data changes; preview only.

### 2026-10-11 · Swiss playoff definition versus fixture generation
- **Finding:** Legacy Create stage invokes setupDeferredStage, which appends a runnable definition via set_spec then persists the stage and its fixtures. Riverside currently has only four Swiss stage rows; QF/SF planning targets and the timeline Final are not equivalent to runnable stage definitions.
- **Fix:** Riverside opt-in Swiss dialog is titled Generate Quarterfinal Draw; removed its deferred-stage creation path. Missing runnable definitions explicitly require Return to Tournament Setup. Existing definitions require a unique persisted stage identity, real dry-run match count, and explicit confirmation before the existing confirmNextStage path.
- **Guard:** Existing division/spec-key and division/stage-order unique constraints and stage-round duplicate trigger remain unchanged. No schema/engine changes or live writes. Saved QF/SF/Final plans and winner mappings remain untouched; this change does not enable the blocked Swiss winner chain.

### 2026-10-11 · Riverside Swiss Quarterfinal showed generic pool qualification
- **Symptom:** A completed Swiss category offered knockout-from-pools, two qualifiers per pool and Create stage instead of the configured Quarterfinal draw.
- **Finding:** SetupDialog exposed both generic mapped/pool branches regardless of Swiss source. The live QF is deferred with pairing later; saved timeline has seeded QF/SF/Final, but the saved playoff qualification/style are later and rounds=2 (four places), not confirmed Top 8. Shared contract still rejects stage_standings from Swiss, despite rankSourcePools having a Swiss ranking path.
- **Fix:** Riverside + tournament_beta opt-in gets a dedicated source-kind-keyed Swiss dialog, inherited discipline/scoring, saved qualification/bracket checks, actual-name seeded preview only when consistent, Check Draw/Generate Quarterfinal Draw labels, existing stage-key targeting and setup correction link. No engine/DB/function changes; RR and non-pilot dialogs remain unchanged.
- **Guard:** Missing/inconsistent qualification blocks; Check uses the existing real-engine dry run, so unsupported Swiss mapping still blocks rather than bypassing contract. No live fixtures/results/stages/notices changed. Regression tests cover the pilot boundary, Top 8 versus unset/four-place config, names, pair preservation and existing-stage identity.

### 2026-09-17 · Tournament invite classed as marketing by Meta
- **Symptom:** Meta re-classified the reworded `tournament_invite_tap` WhatsApp template as marketing, and repeated test invites to one number were silently not delivered (Twilio 63049).
- **Finding:** The CSIR Bells tournament's own description carried a recruitment line ("Players you want to invite – let them follow …register-club") that travelled inside every invite's details block — advertising content turns the message into marketing in Meta's eyes.
- **Fix:** Recruitment line removed from the tournament description; `whatsapp_templates` row `tournament_invite_tap` reset to `draft` with `category = 'utility'` so the hourly `whatsapp-templates-sync` resubmits it as a service message. The send path already falls back to the approved `tournament_invite` template until Meta approves.
- **Guard:** Tournament invite wording must stay service-only (the player's own entry, date, confirm/decline) — never add recruitment, advertising or "invite your friends" lines to invite details or the template body, or Meta will re-classify it as marketing with higher cost and silent non-delivery.

### 2026-09-17 · Booking confirmations, per-booking reminders and visitor fees
- **Symptom:** Booking reminders were hard-coded to "tomorrow", in-app/push/email only, with no club or member control; the club's `visitor_booking_fee` was stored but never charged, and a visitor opponent could be left unnamed.
- **Finding:** The reminders job queried only `date = tomorrow` and ignored any per-booking preference; no code path ever read `clubs.visitor_booking_fee`.
- **Fix:** New club defaults (`booking_confirm_enabled/channels`, `booking_reminder_enabled/channels/hours`) edited in Club Admin → Courts → Booking rules ("Booking messages" card); per-booking `notify_channels` / `reminder_hours` chosen in the booking dialog and remembered per member in localStorage; confirmation sent at booking time to booker and member opponent; reminders now fire from each booking's own lead time across today/tomorrow/day-after, honouring the chosen channels (in-app always, email via notification trigger, SMS/WhatsApp only when the club has them on); visitor name is compulsory with a fee tooltip, and the service-role RPC `charge_visitor_booking_fee` charges the booking member idempotently once the slot has passed.
- **Guard:** SMS/WhatsApp options must never appear for a club that has not enabled them, reminder dedup is keyed on the booking date (never the run date), and the visitor fee is charged once only — never before the slot has ended.

### 2026-08-27 · Club Admin spinner for platform admins outside the tenant roster
- **Symptom:** A platform super-admin opening Club Admin for a club where they had no membership row remained on the full-page spinner or was redirected before permissions resolved.
- **Finding:** The page treated secondary membership/full-club fetches as render blockers and permission hooks represented their initial pending state as an empty permission set.
- **Fix:** Tenant context is now sufficient to render, secondary club enrichment no longer blocks the page, and authorization waits explicitly for platform-role/member-permission resolution before allowing or denying access.
- **Guard:** Never infer denial from an unresolved permission query, and never require a tenant membership row for platform-admin access.

### 2026-08-25 · Recurring debit webhooks rejected by stale club signing secret
- **Symptom:** Stitch recurring debit notifications returned 401 with `No matching signature found`, so successful collections were not posted and failed collections were not counted or retried.
- **Finding:** The collection handler preferred a club-level webhook secret and did not read the shared endpoint secret already configured for the public Stitch webhook. It also incorrectly treated the API client secret as a possible webhook signing secret.
- **Fix:** Verify recurring events against the dedicated collection secret, then the shared endpoint secret, then the club-specific secret for rotation compatibility. Removed the client-secret fallback and reject unsigned or unverifiable requests.
- **Guard:** Webhook signatures may be checked against explicit endpoint signing secrets only; never substitute an API client secret, and keep verification fail-closed.

### 2026-08-23 · Doubles pair allocation could be duplicated or lose season scope
- **Symptom:** An admin could add the same two players repeatedly, while some saved pairs had no season and could appear inconsistently after reopening team management.
- **Finding:** The pair dialog trusted the association season prop rather than the selected team's season, the setup editor identified teams by mutable display names, and the database allowed reversed or repeated copies of the same pair.
- **Fix:** Editing now carries stable team IDs and renames those same rows, pair reads use active rows, writes inherit the selected team's season, duplicate selection is rejected in the dialog, and the database normalises club/season ownership while enforcing one unordered member pair per team.
- **Guard:** A doubles pair is uniquely owned by one stable team ID; never derive team identity from its display name, derive pair club/season from that team, and never accept duplicate member combinations.

### 2026-08-23 · Saved doubles pairs appeared unallocated
- **Symptom:** Doubles pairs were saved against teams, but Step 2 still showed an individual-player Allocate action and team cards appeared empty.
- **Finding:** The team cards and allocation dialog read only `member_league_registrations`; authoritative doubles assignments live in `league_team_pairs` and were only visible in the separate Step 1 Pairs dialog.
- **Fix:** Doubles groups now open Manage pairs instead of the individual allocator, and team cards show their saved pair count and pair names. Hybrid groups expose both player allocation and pair management.
- **Guard:** Never infer doubles-team allocation from individual registration rows; `league_team_pairs` is the authoritative team-pair source.

### 2026-08-23 · Billing-frequency selector reverted to Monthly
- **Symptom:** Selecting 6-monthly or annual appeared not to save, the radio reverted to Monthly, and summary labels disagreed.
- **Finding:** The UI performed two separate writes. The second baseline RPC called non-existent one-argument admin helpers and its error was swallowed, while separate cached club queries could continue rendering the old value. The invoice scheduler also omitted flat biannual rate settings and did not clamp month-end period dates.
- **Fix:** Added one authorised atomic RPC whose canonical field is `clubs.sla_billing_option`; it aligns the latest baseline cycle and writes an audit entry without touching issued invoices. The selector now surfaces errors, preserves immediate selection, and invalidates every billing display query. Billing periods and discounts now share tested cycle helpers.
- **Guard:** Billing frequency has one writer and one canonical field. Never swallow persistence errors or derive future invoice frequency from plan names/baseline history.

### 2026-08-21 · Shelly Bluetooth fallback could not discover its RPC service
- **Symptom:** BLE-only door tests reported no device found, or failed immediately after selecting the nearby
  Shelly 1 Mini Gen3, while the relay was powered and Bluetooth was enabled.
- **Finding:** The shared BLE client used a corrupted Shelly RPC service UUID. Native discovery filtered the
  real relay out entirely, while Web Bluetooth could show it by name but could not resolve the requested GATT
  service after connection.
- **Fix:** Replaced the service identifier with Shelly's documented Gen2/Gen3 RPC service UUID
  `5f6d4f53-5f52-5043-5f53-56435f49445f`; the existing data and control characteristic UUIDs remain valid.
- **Guard:** Keep Shelly GATT identifiers aligned with the official RPC-over-BLE specification and use the
  shared constants for both browser and native discovery/communication paths.

### 2026-08-21 · Shelly Cloud acknowledged door command without confirming relay output
- **Symptom:** A member tapped Open Door and the app reported success, but the physical relay did nothing.
- **Finding:** Shelly Cloud's switch endpoint returns HTTP 200 when it accepts a command; its response only
  identified the device and did not prove that the selected output switched. The frontend also limited BLE
  fallback to phone-network errors, so an online Cloud command that failed to actuate never tried Bluetooth.
- **Fix:** Read the Gen2/Gen3 switch state after the Cloud pulse and require `output=true` before recording
  success. Any Cloud path that cannot confirm actuation now proceeds to the configured BLE fallback.
- **Guard:** Never treat Cloud command acknowledgement as physical relay success; persist success only after
  output verification, and keep BLE as the fallback for all unconfirmed Cloud actuations.

### 2026-08-21 · Shelly Bluetooth fallback connected but did not actuate relay
- **Symptom:** BLE-only door/light tests could find or connect to a Shelly yet produce no physical relay action.
- **Finding:** Both browser and native clients used a malformed TX control characteristic UUID, silently skipped
  the required frame-length handshake, sent plaintext-password auth instead of Shelly's digest challenge flow,
  and never read the RPC response. A completed GATT write was therefore incorrectly treated as success.
- **Fix:** Corrected the Shelly TX/RX control UUIDs, made both clients perform the full framed request/response
  exchange, added SHA-256 challenge authentication, and now surface device RPC errors to the caller.
- **Guard:** BLE relay actions succeed only after a valid Shelly RPC response; missing framing characteristics,
  authentication failures, invalid channels, and incomplete responses must fail visibly rather than silently.

### 2026-08-20 · Tournament selected-member invite failed on registration status constraint
- **Symptom:** Opening “Send invite to selected members” showed zero invitees and raised
  `club_champs_registrations_status_check` while preparing the tournament roster.
- **Finding:** The Invite Actions workflow correctly materialised unaccepted recipients with status
  `invited`, but the live registration constraint still allowed only payment/final lifecycle states.
- **Fix:** Added `invited` to the allowed `club_champs_registrations.status` values so the roster can be
  materialised before a player accepts or pays.
- **Guard:** Registration constraints must include every state emitted by the invitation lifecycle;
  `invited` means selected/notified but not yet accepted and must remain distinct from payment states.

### 2026-08-20 · Legacy tournament draft invite picker remained empty
- **Symptom:** A saved tournament with league teams selected still showed “0 selected of 0 shown” when
  opening “Send invite to selected members”; some sessions also surfaced a missing one-argument
  `can_manage_tournament(uuid)` permission error.
- **Finding:** Older drafts stored their stable team ids in `source_league_ids`, while picker preparation
  passed only the newer per-division Structure ids into roster materialisation. When those newer ids were
  absent, the selected team set was silently empty. Eligibility enforcement also depended on a compatibility
  permission overload instead of the canonical two-argument function.
- **Fix:** Picker preparation now falls back to the saved `source_league_ids` and materialises those teams'
  member registrations before refetching. Backend eligibility and token functions call the canonical
  permission function with the signed-in user explicitly.
- **Guard:** Tournament team ids remain stable across both storage generations; invite materialisation must
  prefer per-division ids but never discard a non-empty legacy team selection.

### 2026-08-20 · Selected tournament invite picker showed zero members
- **Symptom:** Structure resolved a non-zero league audience, but “Send invite to selected members” opened an empty picker; a super admin without a club-member row also could not send a test.
- **Finding:** The picker queried only persisted registration rows and opened before the Structure roster was materialised. Test sends were addressed through a member notification, unnecessarily requiring the organiser to be a club member.
- **Fix:** Opening the picker now materialises the canonical Structure roster and refreshes the registration query. Test sends now accept and validate any email address and use the app-email function directly, without creating tournament or member-notification records.
- **Guard:** Selective sends require persisted registration ids, so picker opening must await roster materialisation. Test email recipients must never depend on a club-member identity.

### 2026-08-20 · Tournament Structure teams showed zero invited members
- **Symptom:** Selecting all teams in 1st League correctly showed the Structure hierarchy, but Invite Actions
  still displayed zero members even after saving progress.
- **Finding:** The canonical team ids were saved in each division's `league_sources`, while the older
  top-level `source_league_ids` remained empty. Reopening any existing tournament marked that empty invite
  selector as manually edited, permanently blocking the Structure-to-Invite hydration effect.
- **Fix:** Only treat a saved non-empty invite-team selection as manually authoritative. The visible count,
  Save Progress, and Send to all now derive their audience directly from the canonical division team ids and
  their `member_league_registrations`, so effect timing or legacy empty selector state cannot lose invitees.
- **Guard:** Division team ids are the authoritative tournament source. Invite persistence must fall back to
  those ids whenever the legacy top-level invite selector is empty.

### 2026-08-19 · Second tournament Resume could show a blank marker
- **Symptom:** Resume worked once, but after leaving the marker and returning through Tournaments, a second
  Resume could render a blank screen; refreshing the browser made the marker work again.
- **Finding:** Tournament hydration replaced its own linked URL (`source` + `matchId`) with the bare
  `/match-marker` route after loading. That discarded the route's authoritative match identity and could leave
  React Router's next in-app visit with stale marker state until a full page refresh rebuilt it.
- **Fix:** Keep the linked tournament marker URL stable for the whole scoring session. Every refresh,
  back/forward visit, and repeated Resume now retains the match ID and re-hydrates the database score.
- **Guard:** Never strip a linked marker's source ID from its active URL; local marker storage supplements the
  server score but must not become the only identity for a tournament scoring route.

### 2026-08-19 · Tournament marker could silently present a new 0-0 game
- **Symptom:** A tournament game visibly stored at 4-4 could open the toss prompt and a fresh 0-0 marker,
  while league games resumed correctly from their current rally.
- **Finding:** League marking hydrates directly from `league_match_results.game_scores + current_game` inside
  the fixture page. Tournament marking used a second route and depended on the security-invoker `club_champs`
  compatibility view for settings; any hidden joined rules/governance row made the loader return silently and
  exposed the generic new-match setup.
- **Fix:** Tournament marking now reads the match, parent tournament, and scoring rules directly, shows an
  explicit loading/error state, and refuses to expose a fresh 0-0 setup when a linked match cannot be hydrated.
- **Guard:** A linked tournament marker must either hydrate its server score or show Retry; read failures must
  never fall through to `MarkerSetup` or create a replacement 0-0 session.

### 2026-08-19 · Tournament Resume reopened at 0-0 and LIVE lacked safe takeover
- **Symptom:** A paused tournament game reopened behind the Start match prompt at 0-0, while the LIVE
  view did not offer the spectator the same consent-based marker hand-over flow.
- **Finding:** The marker and live screens relied on an ambiguous embedded `champ_id` relationship that the
  API resolved to the newer tournament table, whose schema lacks the scoring fields. Resume therefore failed
  before hydration. The live screen also linked directly to the marker instead of opening the lock flow.
- **Fix:** Match and club-champ settings are now loaded explicitly in separate reads. Resume rebuilds completed
  games plus the authoritative current rally separately and remounts the scoreboard per tournament match.
  LIVE remains read-only and offers **Take over marking**, which asks the active marker to approve; a paused
  game offers **Resume marking** from its stored score.
- **Guard:** Tournament LIVE routes never grant scoring directly while another fresh marker lock exists;
  every marker entry must hydrate from the stored tournament score before rendering.

### 2026-08-17 · Riverside card checkout returned 404 before payment
- **Symptom:** Tapping card payment opened a 404 before the hosted payment form; the failure was
  incorrectly attributed to a missing per-club redirect whitelist entry.
- **Finding:** SquashHub has one shared Stitch redirect because Express permits only five entries.
  The functions rewrote that callback to each club subdomain, then added callback query parameters;
  Stitch validates the complete registered redirect URL, so both variants were rejected.
- **Fix:** Both bar checkout and member once-off payments now append only the exact, parameter-free
  `https://squashhub.co.za/pay/return` callback. The browser stores the final tenant destination in
  the existing `.squashhub.co.za` return cookie and `PayReturn` forwards there. Removed per-club probing.
- **Guard:** Never require or infer per-club Stitch redirect whitelist entries; payment URLs use the
  one shared SquashHub callback. Validate the final hosted response; if Stitch rejects that callback,
  use the bare hosted link so the payer always reaches payment rather than a 404.

### 2026-08-17 · Bar checkout trapped the payer in a two-tab close loop
- **Symptom:** Stitch showed Payment complete; closing it exposed an app Close action that the browser
  refused to execute, leaving the payer cycling between two terminal screens.
- **Finding:** The bar flow intentionally stripped Stitch's return URL, opened checkout in a second tab,
  and relied on JavaScript to close browser tabs. Mobile browsers suspend the original tab during hosted
  checkout and prohibit scripts from closing a user-opened QR tab.
- **Fix:** Bar checkout now follows the proven once-off pattern: the current tab opens the hosted page,
  the exact tenant success URL is supplied as `redirect_url`, and completion lands directly on the plain
  thank-you page. The impossible Close action has been removed.
- **Guard:** Scan-to-Pay must remain a single-tab flow. Never use popup polling or `window.close()` for its
  completion experience; the terminal page contains only the payment message and no navigation.

### 2026-08-17 · Bar checkout showed two completion experiences (SUPERSEDED)
- **Symptom:** After payment, the customer saw Stitch's completion page and then a branded club/app
  confirmation whose Close button could not close the original QR-scanner tab.
- **Finding:** The payment provider owns its hosted tab, while browsers prohibit JavaScript from closing
  the original user-opened QR tab. The confirmation also contained unnecessary logos, purchase details,
  and navigation for a once-off visitor sale.
- **Fix:** The app tab now polls every two seconds, closes the script-opened payment tab immediately when
  payment is confirmed, and shows only “Thank you for your payment. Enjoy your squash. Bye.” with Close.
  If the browser blocks closing the original QR tab, Close finishes the page in place with no redirect.
- **Guard:** Scan-to-Pay completion must remain plain and terminal: no logos, return-to-bar navigation,
  amount breakdown, automatic redirect, or promise that a user-opened browser tab can be force-closed.

### 2026-08-17 · Bar Express return corrected to Stitch's supported parameter
- **Symptom:** Successful bar card payments still stopped on Stitch's **Payment complete** page even
  though normal Gordon's Bay top-ups returned correctly to SquashHub.
- **Finding:** A fresh bar link with `redirect_url` returned HTTP 404, while the same link with Stitch's
  documented `redirect_uri` returned HTTP 200. The bar helper was explicitly deleting the supported
  parameter and replacing it with the invalid spelling.
- **Fix:** Removed the body-level `returnUrl` and changed the hosted link to use only the validated tenant
  success URL as `redirect_uri`. A fresh Riverside checkout link was then confirmed reachable.
- **Guard:** Express once-off payments must have one return instruction only: the hosted link's
  `redirect_uri`. Do not use `redirect_url` or add body aliases such as `returnUrl`.

### 2026-08-17 · Bar checkout returned 404 before payment (SUPERSEDED)
- **Symptom:** A QR bar customer reached a **404 page not found** before the card-payment form opened.
- **Finding:** `bar-card-pay` appended the branded success URL as `redirect_url` to Stitch's hosted
  link. For this club's Express link, that query parameter invalidated the hosted checkout URL.
- **Fix:** Bar checkout now opens Stitch's returned hosted URL unchanged. The original Scan-to-Pay tab
  remains open, verifies the payment independently, and displays the branded thank-you screen.
- **Guard:** Superseded by live verification that the failure was the parameter spelling itself:
  `redirect_url` returned 404, while Stitch's supported `redirect_uri` opened the same fresh link.

### 2026-08-17 · Bar card payment stopped on Stitch's completion page (SUPERSEDED)
- **Symptom:** After a QR bar purchase, Stitch showed its own **Payment complete** page; the payer had
  to close it manually before seeing SquashHub's branded confirmation in the original bar tab.
- **Finding:** The Express fallback in `bar-card-pay` sent Stitch's hosted link unchanged and relied on
  the request-body `returnUrl`. The confirmed normal once-off flow documents that Express drops the
  body return field and requires `redirect_url` on the hosted link itself.
- **Fix:** `bar-card-pay` now appends the club-specific branded success URL as the hosted link's
  `redirect_url`, matching `stitch-create-payment`. The public bar header also has a **Close bar** action.
- **Guard:** Superseded for QR bar sales by the standalone, no-redirect checkout above. The member
  once-off/top-up flow remains separate and is unchanged.

### 2026-08-17 · Bar payment success “Close this tab” did nothing
- **Symptom:** After closing Stitch's completion screen, the branded bar payment confirmation appeared,
  but its **Close this tab** button did not close the original QR scanner tab.
- **Finding:** Browsers only allow JavaScript to close tabs that were opened by JavaScript. The branded
  confirmation is deliberately shown in the original scanner tab, so `window.close()` is blocked there.
- **Fix:** The confirmation now detects whether it is in a script-opened tab. Supported tabs retain the
  close action and countdown; normal QR tabs show a single **Done — back to bar** action instead.
- **Guard:** Never present `window.close()` as the primary action on a user-opened payment return page;
  provide an in-app destination when browser tab closure is unavailable.

### 2026-08-17 · League “Set up & mark” opened a blank screen
- **Symptom:** Nelspruit players opening an active internal-league fixture and choosing **Set up & mark**
  landed on a blank page with no way back.
- **Finding:** `LeagueGameDetail` returned its loading screen before the NSA lineup auto-open `useEffect`.
  The first render therefore used fewer hooks than the render after the fixture loaded, causing React's
  “Rendered more hooks than during the previous render” crash.
- **Fix:** Moved the fixture loading return below the lineup auto-open effect so hook order is stable on
  every render.
- **Guard:** All hooks in route pages must execute before loading, missing-data, and error early returns.

### 2026-08-17 · Bar product QR codes were not discoverable
- **Symptom:** Club admins could see imported bar products but no QR code action or visible QR beside each product.
- **Finding:** QR creation was exposed only through a bulk labels dialog, generated codes only for active items,
  and showed URLs rather than an on-screen QR preview.
- **Fix:** Added a per-product **QR code** action, preselects that product in the labels dialog, includes inactive
  setup products when generating labels, and renders each generated QR visibly in the dialog.
- **Guard:** Every bar product row must retain a direct QR action; QR setup must not depend on product activation.

### 2026-08-17 · Set up and edit stopped at the lineup summary
- **Symptom:** Opening a fixture to set up and score could stop on the intermediate scorecard with a
  “Select players (1 → 4)” button, while previously selected players were not clearly ordered on mobile.
- **Finding:** The wizard auto-open guard survived route changes between fixture IDs, and wizard inputs
  were seeded from the existing lineup even when the user was starting a new selection pass.
- **Fix:** Reset the auto-open guard whenever the fixture changes. Fresh setup and “Edit / Select Players”
  now open the guided picker directly at Home position 1 with both teams unselected.
- **Guard:** Setup/edit entry points must open the guided picker directly; never require the intermediate
  roster-summary button before selecting positions 1 through the configured team size.

### 2026-08-16 · League marker had to click "Complete Setup" after selecting players
- **Symptom:** When a marker opened a fixture that had not yet been set up, tapping "Select players"
  opened the wizard, but after picking the teams the app returned to the setup summary and still
  required a separate "Complete Setup" tap before scoring could start.
- **Finding:** The `SelectLineupWizard` only updated local React state (`positions`) via
  `handleWizardApply`; it did not persist the lineup to the fixture until the explicit
  `handleSaveSetup` path was triggered.
- **Fix:** Converted `handleSaveSetup` in `LeagueGameDetail.tsx` to a `useCallback` that accepts an
  optional `overridePositions` argument, and added an `autoOpenWizardRef` effect so the wizard opens
  automatically for unconfigured fixtures. The wizard's `onApply` now calls `handleSaveSetup` with the
  computed lineup immediately after `handleWizardApply` updates local state, taking the marker straight
  to the scoring screen.
- **Guard:** Any future change that delays persisting the wizard output must still provide a direct
  path to the scoring screen for unconfigured fixtures; do not rely on a separate manual save step.

### 2026-08-10 · iPhone install guidance did not reappear
- **Symptom:** iPhone users still saw no prompt to install the PWA.
- **Finding:** iOS never emits a native `beforeinstallprompt` event, and the custom guide was limited
  to Safari and could remain suppressed for 14 days by an earlier dismissal.
- **Fix:** the manual Share → Add to Home Screen guide now appears on every new iPhone browser
  session (including a Safari hand-off instruction for other browsers) until launched standalone.
- **Guard:** never wait for `beforeinstallprompt` on iOS; dismissals may suppress the guide only for
  the current browser session, not permanently.

### 2026-08-09 · ✅ CONFIRMED WORKING — canonical recurring / mandate payment flow (DO NOT CHANGE)

Verified end-to-end on 9 Aug 2026 (≈14:00 SAST): mandate authorised, first instalment collected
once, and the payer was redirected back into the club app. This is the known-good reference
implementation for recurring payments. It is a **separate flow** from once-off top-ups (§3) —
never edit one while fixing the other.

**Symptom that led here:** the mandate activated and the money collected, but the payer stayed on
Stitch's completion page and never came back to GB Squash.

**Finding:** `stitch-create-mandate` deliberately did **not** append `redirect_url` to the hosted
`express.stitch.money/subscribe/<id>` link (based on the since-disproved "Express 404s on query
strings" theory), and relied on body-level `merchantRedirectUrl`/`redirectUrl` aliases — which
Express silently drops. Its `sanitizeReturnUrl` also folded every squashhub host onto the **apex**
`/pay/return`, which is exactly the host Stitch rejects for this club's credentials.

**Fix (recurring flow only):**
- `sanitizeReturnUrl()` in `stitch-create-mandate` now mirrors the once-off version: `www.` → apex,
  then apex/preview hosts → the club's validated **tenant subdomain** (e.g. `gb.squashhub.co.za`),
  default path `/my-account`.
- Added `appendExpressRedirectUrl()` and applied it to the subscribe link, so the auth URL is
  `https://express.stitch.money/subscribe/<id>?redirect_url=https://gb.squashhub.co.za/my-account`.
- Body-level redirect aliases left in place (harmless), polling left in place as the backstop.

**The flow, step by step**

1. Member sets up a debit order in `PaymentMethodsCard.tsx` / `DebitOrdersPanel.tsx`.
2. `stitch-create-mandate` creates the subscription, collecting the **full first monthly
   instalment** (not a token R20), writes a `stitch_mandates` row as `pending`, and returns
   `auth_url` with the tenant `redirect_url` appended.
3. Client opens the auth URL via `openStitchMandateWindow()` in `src/lib/stitch-checkout.ts`
   (separate tab / Capacitor browser) — the app tab stays alive.
4. App polls `stitch-refresh-mandate` every 4s and on focus/visibility; on success it closes the
   Stitch window, toasts, and refreshes the card.
5. Stitch also redirects the payer back to the tenant `/my-account` (this is what was just fixed).
6. `record_mandate_initial_payment` links the first charge to the existing Stitch collection —
   idempotent, so webhook + poll cannot double-post (see the 9 Aug duplicate-R10 entry).
7. `stitch-reconcile-mandates` sweeps every 5 minutes as a final backstop
   (`pending → active` when Stitch reports `AUTHORISED`).

**Non-negotiables**

- Redirect host MUST be the club subdomain — apex and `www.` produce a 404 after paying.
- `redirect_url` IS appended to the Express subscribe link; body-level redirect keys are ignored.
- One active mandate per member, enforced by the `enforce_single_active_mandate` trigger.
- Every money-writing path stays idempotent against the Stitch collection reference.
- Only test hosted-link behaviour against a freshly created, unauthorised link.

**Files that own this flow** (once-off files are separate — never edit them for a mandate bug):
- `supabase/functions/stitch-create-mandate/index.ts` (`sanitizeReturnUrl`,
  `appendExpressRedirectUrl`)
- `supabase/functions/stitch-refresh-mandate/index.ts`,
  `supabase/functions/stitch-reconcile-mandates/index.ts`,
  `supabase/functions/stitch-mandate-webhook/index.ts`,
  `supabase/functions/stitch-collection-webhook/index.ts`
- `src/components/PaymentMethodsCard.tsx`, `src/components/club-admin/DebitOrdersPanel.tsx`
- `src/lib/stitch-checkout.ts` (`openStitchMandateWindow`, `buildStitchReturnUrl`)
- DB: `stitch_mandates`, `stitch_collections`, `record_mandate_initial_payment`,
  `enforce_single_active_mandate`

**Guard:** before changing anything here, check the last authorised mandate's `auth_url` in
`stitch_mandates` — that string is the record of what works. Match it.



### 2026-08-09 · ✅ CONFIRMED WORKING — canonical once-off / top-up payment flow (DO NOT CHANGE)

Verified end-to-end by Daniel on 9 Aug 2026 (13:40 SAST). This is the known-good reference
implementation for once-off/top-up payments. Any future change to top-ups must reproduce this
exactly; if a top-up breaks, restore this shape first before investigating anything else.

**The flow, step by step**

1. Member taps "Pay by card" (My Account top-up, or `TournamentRegisterCard` entry fee).
2. Client `startClubCheckout()` in `src/lib/club-payments.ts` builds the return URL via
   `buildStitchReturnUrl()` in `src/lib/stitch-checkout.ts` — current **tenant origin**, `www.`
   folded to apex, path `/my-account`.
3. Edge Function `stitch-create-payment`:
   - `sanitizeReturnUrl()` rewrites apex/preview/`www` hosts to the **club's validated tenant
     subdomain** (e.g. `gb.squashhub.co.za`) — this is the part Stitch's whitelist matches on.
   - Creates the Stitch Express payment, then `appendExpressRedirectUrl(payment.link,
     safeReturnWithSession)` appends `?redirect_url=<tenant URL>&stitch_session=<id>`.
   - Returns `redirect_mode: "direct"`.
4. Client does a plain **same-tab** `openStitchCheckout(redirect)` — no popup, no prepared tab,
   no polling on this path.
5. Stitch redirects the payer back to the tenant URL; `/my-account` calls
   `stitch-verify-payment` with the session id and posts the credit.

**Non-negotiables**

- The redirect host MUST be the club subdomain. Apex (`squashhub.co.za`) → 404 after paying;
  `www.` → 404; tenant subdomain → 200. Proven by curl against a *fresh* link on 9 Aug.
- `redirect_url` IS appended to the Express link as a query param. It works. The earlier
  "Express 404s on any query string" conclusion was wrong (tested on a consumed link).
- Redirect values in the POST **body** (`merchantRedirectUrl`, `redirectUrl`, `successUrl`) are
  silently dropped by Express — do not add them back.
- Only test hosted-link behaviour against a freshly created, unpaid link.
- Test-mode keys for this club are Express credentials; `secure.stitch.money/connect/token`
  returns `invalid_client`, so the Express path is always the live path here.

**Files that own this flow** (recurring/mandate files are separate — never edit them for a top-up
bug, see §3):
- `supabase/functions/stitch-create-payment/index.ts` (`sanitizeReturnUrl`,
  `appendExpressRedirectUrl`, `appendRedirectUri`)
- `supabase/functions/stitch-verify-payment/index.ts`
- `src/lib/club-payments.ts` (`startClubCheckout`, `openStitchCheckout`)
- `src/lib/stitch-checkout.ts` (`buildStitchReturnUrl`, apex/`www` fold)
- `src/pages/MyAccount.tsx`, `src/components/TournamentRegisterCard.tsx`, `src/pages/PayReturn.tsx`
- Tables: `stitch_payment_sessions`, `stitch_collections`

### 2026-09-01 · New-member payment confused with recurring card setup
- **Symptom:** after registration, a member reached My Account and attempted to set up card details,
  which launched the separate Stitch recurring mandate/business-login journey instead of paying the
  newly-created account balance as an ordinary top-up.
- **Finding:** onboarding navigated to bare `/my-account`; the page displayed both the normal account
  payment action and the optional recurring-payment card without identifying which flow onboarding
  intended. Club numbers that also appeared in the regional league directory were also blanked in
  the wizard, causing completed members to repeat onboarding.
- **Fix:** registration now navigates to `/my-account?onboarding=payment`; after account data loads,
  My Account opens its existing normal Pay Account/Top Up dialog, prefilled with the amount owing and
  card selected. The wizard now treats `club_members.club_member_number` as authoritative even when
  the same code exists in a regional directory.
- **Guard:** onboarding payments are ordinary once-off top-ups through `startClubCheckout`; never
  create a `stitch_mandates` row or invoke `stitch-create-mandate` from registration completion.

**Guard:** before "fixing" a top-up, query
`select stitch_redirect_url from stitch_payment_sessions where status='completed' order by created_at desc limit 5;`
— that is the record of what works. Match it.



### 2026-08-09 · Fresh restored top-up link still returned 404 — tenant host confirmed
- **Symptom:** Daniel's 11:30 test top-up immediately opened a Stitch 404 after the old redirect
  behaviour had been restored.
- **Finding:** session `ba2f65cd` stored an apex return URL. The same fresh payment link returned
  **404** with `redirect_url=https://squashhub.co.za/my-account`, **200** without a redirect, and
  **200** with `redirect_url=https://gb.squashhub.co.za/my-account`. The query parameter is valid;
  the exact whitelisted redirect **host** determines whether Stitch accepts the link.
- **Fix (once-off only):** `sanitizeReturnUrl` now replaces apex/preview hosts with the club's
  validated tenant subdomain before appending `redirect_url` to the Express link.
- **Guard:** always test the same fresh link with bare, apex, and tenant return variants. Preserve
  the club subdomain; never generalise a successful tenant URL to the apex.

### 2026-08-09 · Express payment still replaced app and ended on Complete page
- **Symptom:** a successful once-off/top-up payment left the payer on Stitch Express's completion
  page even though the frontend polling fallback had been added.
- **Finding:** the popup was opened only after the asynchronous payment-session request and used
  `noopener`. Popup blockers therefore rejected it (and `noopener` can return no controllable
  `Window`), causing `openStitchPaymentWindow` to fall back to a same-tab redirect. Once the app
  tab was replaced, no frontend remained to poll or return the member.
- **Fix (once-off only):** reserve a blank payment tab synchronously when checkout starts, retain a
  safe local reference, navigate it to the exact bare Express URL after session creation, then close
  it and focus the still-open app when `stitch-verify-payment` reports completion.
- **Guard:** recurring mandate launchers remain untouched; never delay the initial `window.open`
  until after a network request, and never append parameters to an Express payment link.

### 2026-08-09 · Account statement listed oldest transaction first
- **Symptom:** My Account statement showed the oldest entry at the top; members had to scroll to
  find the newest one.
- **Finding:** `statementLines` was rendered in the same chronological order used to accumulate the
  running balance.
- **Fix:** `MyAccount.tsx` now keeps `statementLinesChrono` (oldest → newest) for the running
  balance and `netOwing`, and renders a reversed copy so the newest line is first.
- **Guard:** balance still derives from the chronological array — never reverse before accumulating.

### 2026-08-09 · Top-up 404 — SUPERSEDED by tenant-host test above
- **Test:** curled a live link both ways.
  `https://express.stitch.money/pay/<id>` → **200**.
  Same link + `?redirect_url=...` → **404**.
- **Conclusion:** express.stitch.money/pay links 404 on ANY query string. The redirect param must
  never be appended to them; the return URL goes in the create body only, and the app keeps its own
  tab open and polls `stitch-verify-payment`.
- **Separate real bug found:** return URLs had drifted to `www.squashhub.co.za`, which is not
  served. `sanitizeReturnUrl` (server) and `buildStitchReturnUrl` (client) now fold `www.` onto the
  apex.
- **Payment-request path is different:** when Stitch payment-request credentials are valid the
  function returns `redirect_mode: "direct"` and that hosted page DOES honour `redirect_url`, so
  the app uses a plain same-tab redirect. TEST credentials currently fail this token exchange
  (`invalid_client`), so test mode always lands on the Express fallback + polling path.
- **Guard:** do not "restore" the redirect param on express links — it is proven to 404.

### 2026-08-09 · Once-off top-up stranded payers on Stitch's completion page
- **Symptom:** after paying a top-up, the member ended on Stitch's "payment complete" screen and
  never returned to the app; the app showed nothing until the page was reopened.
- **Finding:** same root cause as the mandate flow — Stitch Express hosted pages ignore the
  merchant redirect. The once-off flow navigated the current tab away, so nothing was left alive to
  detect completion.
- **Fix (once-off flow only):** `openStitchPaymentWindow` / `closeStitchPaymentWindow` added to
  `stitch-checkout.ts`; `startClubCheckout` returns `keptOpen`; new `pollStitchPayment()` in
  `club-payments.ts` polls `stitch-verify-payment` every 4s for up to 10 min. `MyAccount.tsx` shows
  a "Waiting for your payment…" banner while polling; `TournamentRegisterCard.tsx` polls the same
  way for entry fees.
- **Guard:** mandate helpers left untouched (separate functions by design — see §3). Same-tab
  redirect remains the popup-blocked fallback, and the existing background reconcile loop stays as
  a second backstop.



### 2026-08-09 · Top-up "Pay by card" link opened a 404 page
- **Symptom:** member tapped the once-off top-up link and immediately hit Stitch's *Page Not Found*.
- **Finding:** `stitch-create-payment` appended `?redirect_url=…` to the hosted
  `express.stitch.money/pay/{id}` URL. Verified by curl: bare link → 200, with query param → 404.
- **Fix:** redirect URLs moved into the POST body; `appendRedirectUri` now skips
  `express.stitch.money` hosts; retry without redirect fields on a 400.
- **Guard:** memory rule `constraints/stitch-express-links`. Recurring flow untouched.

### 2026-08-09 · Duplicate R10 credit on mandate activation
- **Symptom:** member statement showed two identical R10 credits for one payment.
- **Finding:** the collection webhook posted the credit at 12:15, then mandate activation posted a
  second "first charge" at 12:18.
- **Fix:** removed the duplicate transaction and its journal legs; rewrote
  `record_mandate_initial_payment` to link to an existing Stitch collection instead of posting again.
- **Guard:** idempotency check inside the function; balance reconciled.

### 2026-08-09 · Payers stranded on Stitch's completion page
- **Symptom:** after saving a card, users landed on `express.stitch.money/card-consent/complete`
  and never returned to the app.
- **Finding:** Stitch Express hosted consent/subscribe pages ignore merchant redirect fields.
- **Fix:** mandate setup opens Stitch in a separate tab/Capacitor browser
  (`openStitchMandateWindow`) while the app polls `stitch-refresh-mandate` every 4s and on
  focus/visibility, then closes the window and toasts success.
- **Guard:** 5-minute reconciliation sweep (`stitch-reconcile-mandates`) as backstop.

### 2026-08-08 · First recurring instalment felt like a scam (R20 test charge)
- **Finding:** members hesitated to authorise a token R20.
- **Fix:** `stitch-create-mandate` now collects the full first monthly instalment; reconciliation
  sweep moved to 5-minute intervals.

### 2026-08-08 · Two active mandates per member
- **Fix:** database trigger `enforce_single_active_mandate` — one active mandate per member.

### 2026-08-08 · Subscription due prompt never appeared for club admins
- **Finding:** the invoice query filtered out the `issued` status.
- **Fix:** `SubscriptionDuePrompt.tsx` now includes `issued`.

### 2026-08-08 · Club dashboard member stats failed (unknown column)
- **Finding:** visitor query selected `full_name`; the column is `name`.
- **Fix:** corrected in `ClubStatsCard.tsx`. Stats now count registered visitors *and* shadow
  visitor records created by tournament imports.

### 2026-08-08 · Wi-Fi availability toast never surfaced
- **Finding:** a permanent "seen" flag in `localStorage` suppressed it forever, plus a mobile-only guard.
- **Fix:** daily timestamp key (`.day`) and guard removed in `DashboardWifiCard.tsx`.

### 2026-08-07 · Members missing from filtered member lists
- **Finding:** inconsistent gender values (`male` vs `Men`) excluded rows from filters.
- **Fix:** normalised comparison in `MembersTab.tsx`.

### 2026-08-07 · Pro-rata joiners skipped the next annual renewal invoice
- **Finding:** wrong `season_year` assigned at join time.
- **Fix:** corrected in `src/lib/fee-proration.ts`; joiners now appear in the next renewal batch.

### 2026-08-07 · "Link existing membership" card broken
- **Finding:** `find_unclaimed_memberships()` referenced `slug` where the column is `subdomain`.
- **Fix:** RPC corrected.

### 2026-08-06 · Duplicate member records (Isaac Lambrechts, Nelspruit/Glenwood cases)
- **Finding:** self-registration created a second `club_members` row alongside the imported one.
- **Fix:** cautious SQL merge preserving affiliations/ladder; `LinkExistingMembershipCard.tsx` lets
  users claim a matching record; fuzzy-match warning added to Add Member.
- **Guard:** never delete NSF/NSA affiliations during cleanup.

### 2026-08-06 · Super admin prompted to resume a match he wasn't marking
- **Finding:** `hasScoringProgress` treated any stored session as active.
- **Fix:** tightened the check plus a "spectator gate" in `MatchMarker.tsx`.

### 2026-08-05 · Project monitoring batch (3 findings)
- Players locked out of matches → marker lock release fixed.
- Court re-flow failing → Edge Function error handling corrected.
- Ghost "empty slots" → placeholder cleanup in `SwapFixtureButton.tsx`.

### 2026-08-05 · Non-captains got a raw Edge Function error posting to NSA
- **Fix:** `src/lib/nsa-errors.ts` maps NSA/API failures to human-readable messages in
  `NsaSubmitDialog.tsx`.

### 2026-08-05 · Desktop parity gaps
- Invite cards, open-door tile and sign-out were mobile-only.
- **Fix:** added to `DashboardDesktop.tsx`; sign-out moved into the avatar dropdown in `PageHeader.tsx`.

### 2026-08-05 · "View as player" hid admin functionality for a club captain with admin rights
- **Fix:** impersonation now resolves effective permissions from the impersonated member's roles.

---

## 5. Five-day audit (5–9 August 2026)

**Data checks run 9 Aug 2026:**

| Check | Result |
| --- | --- |
| `stitch_payment_sessions` last 6 days | 1 completed (08 Aug), 2 processing (09 Aug) — the two 404-affected top-up attempts |
| `stitch_mandates` last 6 days | 1 active, 1 cancelled (09 Aug), 1 cancelled (06 Aug — Katya Fulton, never completed at Stitch) |
| `court_reflow_log` last 6 days | 0 rows — no re-flow failures since the fix |
| Duplicate member credits | 1 found and reversed (Daniel Mommsen, R10); balance back to R1 590 |

**Themes observed this week**

1. **Third-party hosted-page assumptions** — Stitch Express ignores redirect params and 404s on
   query strings. Never assume a hosted checkout honours redirects; always have a polling or
   reconciliation backstop.
2. **Double-posting from dual event sources** — webhook *and* poll/refresh both writing ledger
   entries. Every money-writing path must be idempotent against an external reference id.
3. **Column/enum drift** — `full_name` vs `name`, `slug` vs `subdomain`, `male` vs `Men`. Verify
   the actual column/enum values with a query before writing a filter.
4. **Mobile-first drift** — features shipped on mobile layouts only. New dashboard tiles must be
   added to both `Dashboard` (mobile) and `DashboardDesktop`.
5. **Duplicate identities** — imported members re-registering. Always offer a claim/merge path
   rather than creating a second row.

---

## 6. Debug playbook

1. **Reproduce with data first** — `read_query` against the real rows before touching code.
2. **Check the right log** — Edge Function logs for backend, browser console/network for frontend.
3. **Search this file** for the symptom; a recorded fix probably exists.
4. **Fix the category, not the instance** — if one query used the wrong column, grep for siblings.
5. **Verify before declaring done** — re-run the query or the call that showed the failure.
6. **Append to §4.**

---

## 7. Stitch top-up redirect regression — root cause and restoration (09 Aug 2026)

**User report:** "It worked before." Correct — it did. This was a self-inflicted regression, not a
Stitch change.

### How it worked (last known-good, commit `458c20657`, 19 Jul 2026)

1. `buildStitchReturnUrl()` returned the **current tenant origin**, e.g.
   `https://gb.squashhub.co.za/my-account`.
2. `stitch-create-payment` created the Express payment, then called
   `appendExpressRedirectUrl(payment.link, safeReturnUrl)` — i.e. it appended
   **`?redirect_url=<tenant URL>`** to `https://express.stitch.money/pay/<id>`.
3. The client did a plain **same-tab** `window.location.assign(link)`.
4. Stitch redirected the payer back to the tenant URL; `/my-account` verified the session.

Evidence in the data: session `c8a18aad` (08 Aug, R60) stored
`https://express.stitch.money/pay/kgZHbT2DL14PtQZhCPuoQe?redirect_url=https%3A%2F%2Fgb.squashhub.co.za%2Fmy-account`
and completed normally.

### How it broke (09 Aug 2026, commits `ed6020805` → `2ee573670`)

| Step | Change | Effect |
| --- | --- | --- |
| 10:35 | Return URL began resolving to `https://www.squashhub.co.za/...` | `www.` is not served → payer hit a **404 after paying**. The 404 was caused by the *host*, not by the query param. |
| ~10:50 | Misdiagnosed the 404 as "Express 404s on any query string" and **stripped `redirect_url` from the Express link** | Redirect died. Payers now stranded on Stitch's `/pay/complete`. |
| 10:50–11:11 | Compensated with body-level `merchantRedirectUrl`/`redirectUrl`, a prepared-tab + polling launcher, and apex folding | Layered workarounds on top of the real break; none restored the redirect, because Express drops body-level redirect keys. |

The "Express 404s on query strings" curl evidence was **wrong**: that test hit an already
consumed/expired link. Re-verified 09 Aug against a fresh link:

```
/pay/<id>                                   -> 200
/pay/<id>?redirect_url=https%3A%2F%2Fgb...  -> 200
/pay/<id>?redirect_uri=https%3A%2F%2Fgb...  -> 200
```

Also confirmed the club's `test-…` keys are Express credentials: Express token 200, but
`secure.stitch.money/connect/token` (Payment Request API v2) returns `invalid_client`, so the
Express fallback path is always the one in use for this club.

### The fix (restoration)

- `supabase/functions/stitch-create-payment/index.ts` — restored
  `appendExpressRedirectUrl(payment.link, safeReturnWithSession)`; removed the body-level
  `merchantRedirectUrl`/`redirectUrl` keys and the 400-retry; `appendRedirectUri()` no longer
  short-circuits express hosts. Response now returns `redirect_mode: "direct"`.
- `src/lib/club-payments.ts` — removed the prepared-window + polling launcher; back to a single
  same-tab `openStitchCheckout(redirect)`.
- `src/lib/stitch-checkout.ts` — kept the `www.` → apex fold (that part was a genuine fix) and the
  tenant-origin return URL. Window/polling helpers remain exported but unused by the once-off flow.

### Rules learned

1. **Do not "fix" a symptom by removing a parameter that has working evidence in the database.**
   Check `stitch_payment_sessions.stitch_redirect_url` on a *successful* older session first — it
   is the record of what worked.
2. **A 404 after payment is a host problem first** (`www.` vs apex, wrong subdomain), a query-param
   problem last.
3. **Only test hosted-link behaviour against a freshly created, unpaid link.** Expired/consumed
   links return misleading statuses.
4. Once-off and recurring stay separate (see Core memory) — this restoration touched the once-off
   path only.

## 2026-08-09 — 3-month free trial for new tenants
- **Change:** New clubs/associations now get a 90-day free trial (was 30).
- **Where:** `subscription_plans.trial_days = 90`, `app_settings.saas_trial_days = 90`, fallback in `supabase/functions/create-club/index.ts` and defaults in `SuperAdminSubscriptions.tsx`.
- **Existing clubs:** their current `trial_ends_at` values were NOT changed — no retroactive extensions.
- **Copy:** Home marketing page, RegisterClub page, and SLA v1.4 (new §1 "Free Trial Period"; billing starts the day after trial ends, not before 1 Sep 2026).

### 2026-08-12 · Same-night substitution across teams
- **Need:** a player registered in one team must be able to fill in for another team on the same night.
- **Fix:** new association rule `league_rules.allow_multi_fixture_per_night`. Registration stays
  one-team; when on, Fill Up Leagues keeps already-placed players selectable in other teams of the
  same gender group with an "also <team> #n" badge, and `move_player_to_lineup(p_allow_multi)` keeps
  the original lineup row instead of deleting it.
- **Guard:** do NOT use `allow_multi_team_registration` for this — that changes permanent squad
  registration. Same-date fixtures only warn, never block.

## Router & Internet Monitoring (2026-08-14)
Network-agnostic router monitoring module.
- Tables: `club_router_configs`, `club_data_bundles`, `club_router_polls`, `club_router_alert_settings`, `club_router_alerts`. Credentials live in `club_secrets` (`router_username/password/api_token`).
- RPC `purchase_data_bundle` archives the active bundle and re-bases the usage baseline from the latest poll.
- Edge function `supabase/functions/router-poll` (+ `drivers.ts` driver registry: generic_http, mikrotik_rest, huawei_hilink, glinet_luci). Cron `router-poll-all` runs every 5 min and polls clubs whose interval is due.
- UI: Club Admin → Internet tab (`RouterTab.tsx`), dashboard widget `DashboardRouterCard.tsx`, hooks in `use-router-monitor.ts`.
- Alerts: thresholds default 75/90/95, email + push, one alert per threshold per bundle, offline alert throttled to 6h.
- Pilot: Gordons Bay Squash Club (config seeded, disabled until router details captured).

## 2026-08-14 — National Federation Module, Phase 1
- Added gap analysis: `docs/FEDERATION_MODULE_GAP_ANALYSIS.md` (Phase 0 deliverable per spec §24).
- New tables: `organisations`, `organisation_relationships`, `organisation_admins`, `external_ids`, `audit_events`.
- New functions: `org_descendants`, `has_org_role`, `can_view_org`, `is_national_admin`.
- Seeded "Squash South Africa" org; all clubs and active league associations linked into the hierarchy.
- New UI: `/admin/federation` (`src/pages/admin/SuperAdminFederation.tsx`, `src/hooks/use-federation.ts`) — national roll-up stats, hierarchy tree, scoped federation roles. No club screens changed.
- Decisions taken: one national `player_profiles` spine (Phase 2), SSA modelled in `organisations` (not as a club tenant).

## Federation Phase 2 — National Player Identity (2026-08-14)
- New tables: `people` (national spine, national_player_number SSA######), `people_private` (DOB + SA ID, restricted RLS), `person_affiliations` (per org/season affiliation + competitive licence), `national_licence_products` (billing_enabled defaults false — charging NOT activated).
- `club_members.person_id` links every club membership to one national person; trigger `ensure_person_for_club_member` matches on SA ID → auth user → email before creating a new person.
- DOB never exposed broadly: `people_directory` view returns age/age_group only; full DOB gated by `can_view_person_dob()` (self, platform admin, org roles super_admin/competition_admin/tournament_director).
- Dedupe via `merge_people(keep, dup)` RPC (platform/national admins only).
- UI: Super Admin → Federation → People tab (`src/components/admin/FederationPeopleTab.tsx`, `src/hooks/use-people.ts`).

## Tournaments — one wizard for club, association and federation (2026-08-14)

### Club level baseline — WORKING, do not change behaviour
`src/components/club-admin/ClubChampsTab.tsx` is the tournament wizard. Steps:
`category → courts → registration → players → groups → schedule → review` (+ programmatic `preview`).
It generates draws (round robin / groups+playoffs / Swiss / cross-league), auto-books courts,
writes `club_champs_entries` / `club_champs_matches`, and routes scoring through the format
registry (`src/lib/tournament-formats/`, marker routes per format: standard → MatchMarker, Bells → BellsMarker).
Any change here must keep the club path identical: the component defaults to `scope="club"`,
`ownerOrgId=null`, no extra participating clubs — which reproduces the previous behaviour exactly.

### Field ownership — one home per field (no double entry)
Storage was already de-duplicated when `club_champs` became a view:

| Concern | Table | Edited in |
|---|---|---|
| Operations (name, dates, play days, courts, day schedules, leagues, groups, capacity) | `tournaments` | Wizard |
| Sanctioning, eligibility, registration window, entry fee + federation/association split, payment, refunds | `tournament_governance` | Governance dialog (wizard's registration step writes the same record via the view) |
| Scoring format, draw type, standard of play, best-of, points, handicap, byes, ranking flag | `tournament_rules` | Rules dialog (wizard's category step writes the same record via the view) |
| Host venues, courts, host compensation | `tournament_venues` | Governance → Venues |

`public.club_champs` is a compatibility VIEW over these four tables with `INSTEAD OF`
insert/update/delete triggers (`club_champs_compat_*`). Legacy club code keeps working and
there is only ever one stored copy of each field.

### 2026-08-14 additions
- `tournaments`: `event_type`, `max_entrants`, `max_per_league`, `seeding_source`, `participating_club_ids`.
  These are NOT in the compat view — read/written directly against `tournaments`.
- `ClubChampsTab` props: `ownerOrgId`, `scope` (`club|association|federation`), `participatingClubIds`.
  Multi-club mode pools members and courts across the host club plus participating clubs
  (court names prefixed with the club name), and lists tournaments by `owner_org_id`.
- Super Admin → Tournaments (`src/pages/admin/SuperAdminTournaments.tsx`) mounts the same wizard
  for a chosen federation/association owner, host club and extra venues.

### 2026-08-15 — single entry point, tabbed wizard, no double entry
- `src/components/tournaments/TournamentPlanner.tsx` is now the ONLY mount point for the wizard.
  - `mode="club"` — used by Club Admin → Tournaments (`src/pages/ClubAdmin.tsx`, case `champs`).
    Owning body and host venue are the club itself; multi-venue picker only for super admins.
  - `mode="platform"` — used by Super Admin → Tournaments; pick any federation/association owner,
    any host club nationwide, plus extra participating clubs.
  Club behaviour is unchanged: `ownerOrgId=null`, `scope="club"`.
- Wizard step indicator is now clickable TABS (`goToStep`), not a read-only breadcrumb.
- Double entry removed in the Governance dialog:
  - Entry fee, "payment required" and the registration open/close window are READ-ONLY there;
    they are edited in the wizard's Registration step (same `tournament_governance` record).
  - Fee shares (federation/association) and refunds stay editable in Governance and are shown
    read-only in the wizard's Registration step.

## Tournament type split into category + eligibility (2026-08-15)
`tournaments.event_type` now holds ONLY real categories: club_championship, league_fixture,
league_finals, open_tournament, junior, masters, team_event, provincial_championship,
national_championship. Legacy values (closed, open, invitational, ranking) were migrated.
The mixed concepts each have one home:
- Who may enter → `tournament_governance.eligibility_scope` (shown in the wizard Category step)
- Invitation only → registration mode on the Registration step
- Ranking event → "counts for ranking points" on the scoring settings
- Sanctioning authority / level → Governance → Ownership
Next up (not built): official SSA tournament templates that pre-fill category, eligibility,
rules and fee split so clubs only add dates and venue.

## Per-league scoring & win condition (2026-08-15)
Match rules were fully decentralised to each league card in the wizard. `tournaments` now has
`league_scoring_modes`, `league_points_per_game`, `league_best_of` and `league_win_conditions`
JSONB columns. The compatibility view `public.club_champs` and its insert/update triggers expose
and persist the new column. In `ClubChampsTab` every league independently configures draw format,
category, singles/doubles, Standard/Bells, par 11/15, best-of 3/5 and win condition (win-by-2 /
sudden death). League 1's values sync back to the tournament-level `tournament_rules` row so the
legacy marker engine continues to work without per-league changes. Segmented row controls are now
color-coded by row to distinguish options visually.

## Hand-out flash duration & clarity (2026-08-17)
**Symptom:** The hand-out notice on the marker/scoring screen flashed too briefly (1.8 s) and was hard to read.  
**Finding:** Both `MarkerScoreboard.tsx` and `BellsMarker.tsx` used `setTimeout(..., 1800)` and a subtle `animate-pulse` amber highlight that made the message disappear quickly.  
**Fix:** Increased the display duration to 3 seconds in both components. Replaced pulsing with a solid amber-tinted background, a stronger border ring, larger uppercase text, and a bold server name so the hand-out stays visible and readable.  
**Guard:** Type-check passes; both markers share the same timeout and styling pattern.

## Security: club_members role-escalation fix (2026-08-17)
**Symptom:** Security scan blocked publishing with a critical finding: members could grant themselves `role='admin'` on `club_members` and gain full club-admin privileges.  
**Finding:** The `club_members` INSERT/UPDATE policies allowed `auth.uid() = user_id` with any `role`, including `admin`. There was no `WITH CHECK` to restrict self-service role assignment.  
**Fix:** Recreated the INSERT and UPDATE policies so self-service inserts/updates can only use non-admin roles (`member`, `visitor`, `captain`). Club admins retain full role assignment rights. Added a `BEFORE INSERT OR UPDATE OF role` trigger as an extra guard that raises an exception if a non-admin user tries to set `role='admin'`.  
**Guard:** Re-ran security scan; the critical error is resolved and only warnings remain.


### 2026-08-17 — Bar Scan-to-Pay is now gateway-agnostic
`bar-card-pay` / `bar-card-verify` read `clubs.payment_gateway` and route to Stitch or Yoco
automatically (Yoco uses `club_secrets.payment_gateway_credentials.secret_key`). No per-club code
changes are needed when a tenant picks a gateway — member fees/top-ups already route via
`src/lib/club-payments.ts`. Stitch Express bar checkout uses no body-level return aliases and one
documented `redirect_uri` on the fresh hosted link.

### 2026-08-17 · Once-off top-up 404 in Riverside (Stitch Express)
- **Symptom:** Normal member top-up in Riverside opened a **404** on the Stitch hosted link; Gordon's Bay
  appeared to work.
- **Finding (live probes):** For a fresh link, `/pay/<id>` → 200, `/pay/<id>?foo=bar` → 200, but
  `/pay/<id>?redirect_url=<any value>` → **404** — for Riverside *and* Gordon's Bay links alike.
  Gordon's Bay only looked healthy because the tested link belonged to an already-completed session
  (307 redirect). `redirect_uri`, `returnUrl`, `return_url`, `redirectUrl` all return 200.
- **Fix:** `stitch-create-payment` now appends `redirect_uri` (never `redirect_url`) to the hosted
  Express link, matching the bar checkout.
- **Guard:** `redirect_url` is dead on Stitch Express hosted links — any occurrence 404s the checkout.
  Use `redirect_uri` only.

### 2026-08-17 · ✅ REVERTED to the canonical Stitch shape (record-matched)
- **Symptom:** repeated changes (`redirect_uri`, body-level `redirectUrl`, param-free links) all
  ended the payer on Stitch's generic **Payment complete** page.
- **Evidence used:** `select stitch_redirect_url from stitch_payment_sessions where status='completed'`
  — **every** historically completed session is
  `https://express.stitch.money/pay/<id>?redirect_url=https%3A%2F%2F<club>.squashhub.co.za%2Fmy-account`.
  The only session ever created with `redirect_uri` did not redirect.
- **Fix:** `stitch-create-payment` and `bar-card-pay` both restored to append **`redirect_url`**
  (tenant-subdomain host) to the Express hosted link; `appendSessionParams` again adds
  `stitch_session` to the return URL. Mandate flow was already canonical — untouched.
- **Guard:** the completed-session `stitch_redirect_url` string is the source of truth. If a fresh
  link 404s with `redirect_url`, the **host** is wrong or not whitelisted for that club's Stitch
  credentials — fix the host, never strip the parameter, never swap to `redirect_uri`.

### 2026-08-17 · Riverside 404 before paying — redirect whitelist is PER CLUB
- **Probe on a fresh Riverside link:** bare → 200, `?redirect_url=riverside.squashhub.co.za` → **404**,
  `?redirect_url=squashhub.co.za` → **404**, `?redirect_uri=...` → 200.
  Same probe on a fresh Gordon's Bay link: `?redirect_url=gb.squashhub.co.za` → **200**.
- **Conclusion:** Stitch validates the appended redirect host against **that club's** Express
  whitelist. GB is whitelisted, Riverside is not — nothing in our code differed.
- **Fix:** `stitch-create-payment` and `bar-card-pay` now call `pickWorkingLink()`, which probes the
  real hosted link and uses the first variant that loads: `redirect_url` (branded return) →
  `redirect_uri` (loads, Stitch keeps its completion page) → bare link. No club can 404 again.
- **To get the branded return for a club:** whitelist `<subdomain>.squashhub.co.za` on that club's
  Stitch account. Until then that club finishes on Stitch's completion page by design.

### 2026-08-18 · WhatsApp replies now register/decline tournament entries (and events)
- **Symptom:** Members could reply to WhatsApp event/tournament invites, but the reply parser was narrow and the match could fail if the pending `whatsapp_interactions` row had expired or been cleaned up.
- **Fix:** `whatsapp-inbound` now understands natural replies such as `register`, `play`, `enter`, `join`, `ok`, `sure`, `withdraw`, `not playing`, etc. If no pending interaction row exists, it falls back to the most recent outbound `whatsapp_send_log` for that phone, provided the message was interactive and within 7 days. Tournament declines now also upsert a `cancelled` registration row instead of silently failing when the row was absent. `send-whatsapp` now stores the interaction payload in the outbound log so the fallback can recover the right tournament/event.
- **Guard:** Deployed both `send-whatsapp` and `whatsapp-inbound` edge functions. Bulk tournament invites from the wizard and WhatsApp event invites already send the interactive question; the replies now reliably update `club_champs_registrations` or `club_event_rsvps`.


### 2026-08-19 · Tournament invites: register to accept, partner rules, EFT proof upload
- **Symptom:** Invite cards only offered "Accept Invite" — no partner selection, no bank details, and no way to submit proof for EFT-only tournaments.
- **Fix:** New `src/components/tournaments/TournamentInviteRegisterDialog.tsx` (opened from `TournamentInviteActions.tsx`) walks the player through accept/register → pay (card or EFT) → partner. New shared `src/components/payments/EftPaymentPanel.tsx` shows bank details, reference and amount with a proof-of-payment upload; also used by `TournamentRegisterCard.tsx`.
- **Partner rules (three invite shapes):**
  1. Invited **with** an entry fee → must register and be paid before picking a partner, and only players who are themselves registered *and* paid appear in the picker.
  2. Invited **without** a fee → accept, then pick any eligible club member (partner need not register first).
  3. `partner_mode != 'players'` (admin pairs) → no picker; the player only confirms they can play.
- **Data:** `club_champs_registrations` gained `proof_url`, `proof_uploaded_at`, `proof_uploaded_by`. Private storage bucket `payment-proofs` with path `<club_id>/<club_member_id>/<file>`; members read/write their own, club admins read/delete their club's. Trigger `trg_champ_proof_uploaded` notifies club admins on upload.
- **Admin:** `TournamentRegistrationsDialog.tsx` shows a "Proof" button (signed URL, 5 min) next to EFT paid / Waive.

### 2026-08-20 · Tournament test emails opened a non-actionable generic page
- **Symptom:** Clicking the emailed test invitation opened `/club-champs/:id`, which showed “Registration pending” and no Accept / Decline controls.
- **Finding:** The test-send path explicitly used the generic tournament URL. Real sends also silently fell back to that URL when secure token minting failed, hiding the underlying error and delivering a link that could not identify the invitee.
- **Fix:** Test emails now use the first selected invitee (or the explicitly chosen sample player), materialise that registration if needed, mint its secure token, and link to `/i/:token`. Real sends now fail visibly before notifications are inserted if any recipient-specific token is missing; they never send the generic page as an invitation.
- **Guard:** Every tournament invitation channel must use `buildInviteUrl(token, subdomain)`. `/club-champs/:id` is a tournament view/payment destination only, never an initial RSVP link.

## Marker presence: LIVE falls away when the marker exits
- LIVE chips (Tournaments list, ClubChampsView, TournamentMatchLive) are now driven by a fresh heartbeat in `champ_marker_locks`, not by `status = in_progress`. Matches with no active marker show an amber "Paused · Resume" chip that opens the marker.
- `useChampMarkerHeartbeat` releases the lock immediately on `pagehide` / tab hide (previously only on unmount), and is now also used by `BellsMarker`.
- `MatchMarker` no longer early-returns on a cached marker config for the same match, so the board always re-reads the DB score and resumes at the real score instead of 0-0. Local scoring state (server/serve side/undo) is kept when it is the same match.

### 2026-08-19 · Tournament capacity check moved to Dates, Times & Courts
- **Symptom:** The capacity panel sat in the Structure step and printed a maximum-players number before dates, daily windows or courts existed. It also exposed raw formulas ("games per pool ≈ ⌈N/2⌉ × R") and duplicated structure controls (league count, pools, Swiss rounds).
- **Fix:** Math extracted to the pure module `src/lib/tournaments/capacity.ts` (`deriveSessions`, `missingCapacityInputs`, `computeCapacity`, `formatCourtMinutes`) and rendered by `src/components/club-admin/tournament/CapacityCheck.tsx`. The panel now lives in the **Dates, Times & Courts** step, below "Courts & daily schedule"; Structure only carries a note that capacity is checked later.
- **Inputs:** play-days or per-day custom windows (including per-window court subsets), selected courts, per-league match duration, per-league format (single/double round-robin, Swiss, cross-league), pools, Swiss rounds, singles vs doubles, per-league play-offs, pre-play-off break, and the roster (falling back to the planned expected players/pairs). Everything is a `useMemo` on those values, so it recalculates live.
- **Incomplete state:** no misleading number — "Add tournament dates, playing times and courts to calculate capacity" plus a list of exactly which inputs are still missing.
- **Wording:** headline answers court time available / court time required / maximum field / fits or not / bottleneck. Formulas and per-league rows sit behind "How is this calculated?".
- **Still advisory:** nothing consumes the capacity number as a constraint; setup is never blocked.
- **Model limitations:** there is no per-match turnaround/changeover field (only `court_rotation_minutes`, which shifts court ownership rather than consuming time) and no per-league court ownership — outside "run leagues side by side", each league is sized as if it can use every selected court, so per-league maxima must be read individually, not summed. `playoff_break_minutes` is charged once across all courts.
- **Tests:** `src/test/capacity.test.ts` (21) and `src/test/capacity-panel.test.tsx` (2).

## Dashboard "Mark a Game" tile + Tournaments lifecycle default (2026)
- Dashboard: marker tile renamed "Score a Match", demoted to the end of the tile grid; it only leads the grid (as pulsing "Resume Marking") when a marker session is active. Sidebar/desktop nav labels renamed to match.
- Tournaments.tsx: tabs are now controlled and always open on "Current" (never auto-jump to Past). Past detection covers completed/cancelled/abandoned/archived plus end_date < today; current list sorts running-now first then soonest start. Tab labels carry counts, empty Current state links to Past, Past shows 8 most recent with "Show all", Standings has an empty state.
- Known gap (unchanged): the tournaments query is still club-scoped (`eq club_id`), so association/federation events hosted at other clubs are not listed even where eligibility would allow entry.

## 2026-08-20 — Tournament lifecycle unified (July/undated rows in "Current")
Root cause: `src/components/MyChampionships.tsx` (member dashboard) filtered only
`status != 'completed'`, so July tournaments left in `planning`, cancelled/abandoned
events and undated rows appeared as current, and its cards printed no dates.
`Tournaments.tsx` had its own inline copy of the rule.
Fix: single source of truth `src/lib/tournaments/lifecycle.ts`
(`isPastTournament` / `isCurrentTournament` / `isNeedsDatesTournament` /
`splitTournamentsByLifecycle`), used by both surfaces. Undated tournaments are now
admin-only ("Needs dates"), cancelled ones show a Cancelled badge under Past, and
dashboard cards show dates. Regression tests: `src/test/tournament-lifecycle.test.ts`.
No data changes — DB inspection found no malformed/child rows in `club_champs`.

## League fixture lineup: reserves reverted to original players (fixed)
**Symptom:** Captains swapped reserves into a fixture lineup; later that evening the original players were back.
**Root causes (both in `src/pages/LeagueGameDetail.tsx`):**
1. On load, saved `league_match_results` rows were blanked whenever the sibling `league_fixture_results` row was missing/not-yet-fetched; the blanked slots were then re-filled from the default week lineup/registrations.
2. Prefill applied the weekly (default) lineup BEFORE per-fixture override rows, and its fill helper never overwrote a filled slot — so per-fixture overrides could never win.
3. Reserve swaps were only persisted when `setupDone` was true; swaps made before "Complete Setup" lived in local state only.
**Fix:** new pure helpers in `src/lib/league/lineup.ts` (`shouldKeepSavedRow`, `resolveLineupPositions`, `applyPrefillSlot`, `lineupDiffers`); saved player rows are always authoritative; precedence is fixture override → week lineup → registrations; new `persistLineupPlayers()` saves every lineup edit immediately (players only, never scores) with stale-write detection and a "Lineup saved" badge.
**DB:** additive audit columns `league_match_results.lineup_set_by/lineup_set_at`, `league_fixture_results.lineup_confirmed_by/lineup_confirmed_at`. No RLS changes.
**Tests:** `src/test/league-lineup.test.ts` (12) incl. reserve → reopen → match start round-trip and multi-reserve positions.

## Club Championship knockout (2026-08)

- Schema: `tournaments.league_sections` / `knockout_seeds` / `knockout_seeds_at`, `club_champs_matches.section_number`; `club_champs` view + triggers updated.
- Engine: `src/lib/tournaments/knockout.ts` — balanced (snake) seed distribution across sections, phased round generation (first round only up front), byes, league final between section winners.
- Wizard: `ClubChampsTab` has a `knockout` per-league format with a section-count stepper; capacity treats sections as `pools` and always needs `entrants - 1` matches.
- Live view: `src/components/tournaments/KnockoutCard.tsx` renders the draw per league/section and exposes "Generate next round" / "Generate league final". Knockout rows (`stage = 'ko'`) are excluded from the play-off card so play-off re-seeding is untouched.
- Tests: `src/test/knockout.test.ts` (engine) + knockout cases in `src/test/capacity.test.ts`.

## 2026-08-20 — Tournament invitations: public response + organiser test invite

**Issue 1:** The recipient-specific invite link (`/i/<token>`) forced a normal SquashHub login ("Sign in to respond"), contradicting the agreed public-response design.

**Fix:** New `public.respond_tournament_invite_public(token, accept, verify)` (granted to `anon`) responds without a login. A forwarded/stolen link is stopped by a token-bound recipient check instead of a login wall: last 4 digits of the member's cellphone, else surname (`invite_verification_kind` / `invite_verification_ok`). `get_tournament_invite` now returns `can_respond_public` + `verification_kind` (never the answer). Accept is idempotent (already-confirmed rows return their current status); fee rows use the existing `ON CONFLICT` upsert so reloads never duplicate payment obligations. Revoked / closed / invalid tokens still fail safely.

**Issue 2:** "Send test invite to myself" was missing; the existing test send used a REAL invite token.

**Fix:** New non-mutating preview route `/i/test/:champId` backed by organiser-only `get_tournament_invite_preview(champ_id)`. The Invite actions menu now has "Send test invite to myself", delivered to the organiser's own in-app/email channel, clearly marked TEST, with Accept/Decline that only simulate. No registration, count, seeding or payment is touched.

Regression tests: `src/test/invite-link.test.ts` (public actionable state, verification rules, test-link shape).

## 2026-08-20 — Tournament invitation blast + public accept constraint failure
- **A) Mass invitations on a selective send.** `notify_champ_registration_event` fired a
  "Tournament invitation" notification (with email) on every INSERT where
  `invited_by_admin = true`. `saveEntriesDraft` materialises the whole roster with that
  flag, and it runs when the organiser merely *opens* the "Send to selected members"
  picker or sends a test invite — so the entire roster was emailed. Its fall-through
  group-allocation block additionally flipped everyone to `paid`, producing hundreds of
  "Tournament entry confirmed" emails.
  Fixes: trigger no longer sends invitations on INSERT (sending is an explicit organiser
  action); `saveEntriesDraft(..., { inviteRosterOnly: true })` for picker/test paths;
  new `public.send_champ_invite_notifications` RPC enforces the exact recipient set
  server-side, validates every id belongs to the tournament, refuses empty sets and
  writes an `audit_events` row with requested vs sent counts; client resolution moved to
  `src/lib/tournaments/invite-recipients.ts` (fail-closed, explicit `mode: all|selected`)
  with a named confirmation summary before sending.
- **B) Public accept failed on `club_champs_registrations_confirmation_source_check`.**
  The constraint allowed only `rsvp|payment|admin`; `respond_tournament_invite_public`
  writes `invite_link`. Constraint widened to include `invite_link` (NULL still allowed
  for declines). Acceptance stays single-transaction and idempotent, so the confirmation
  notification can no longer be emitted for a registration that failed to commit.

## 2026-09-11 — Tournament fee “Add to my account” option
- **Issue:** Accepting a paid tournament invite already created an outstanding member fee, but members only saw immediate card/EFT actions and could not explicitly choose to leave the fee on their account.
- **Fix:** Tournament organisers can now enable **Add to member account** in Accepted payment methods. Members then see **Add R… to my account** after registration; choosing it confirms that the existing outstanding fee remains in My Account for later settlement.
- **Guard:** The option reuses the fee created by tournament acceptance and never inserts another charge. Existing tournaments do not gain the option unless an organiser enables it.

## 2026-08-21 — Shelly BLE fallback transport hardening (preventive)
- **Context.** The Bluetooth-only fallback (used when the club router/cloud is down) was
  confirmed working at Gordon's Bay after the service-UUID fix. These changes are
  preventive: they remove the timing and framing assumptions that made the exchange fail
  intermittently rather than deterministically.
- **New:** `src/lib/shelly-ble-transport.ts` — transport-agnostic helpers shared by the
  Web Bluetooth path (`shelly-ble.ts`) and the Capacitor/native path
  (`shelly-ble-native.ts`), so both behave identically.
- **Fixes applied to both paths:**
  - Rx-CTL is now **polled** (25 × 60 ms) instead of read once. A zero length means
    "reply not built yet", but the old code treated it as an invalid-length failure and
    aborted an unlock that would have succeeded.
  - **Settle delays** (30 ms after each control-register write, 5 ms between payload
    chunks) so the device latches the frame length before the payload arrives.
  - **Timeouts**: 6 s per GATT read/write, 15 s per full RPC exchange, with readable
    messages ("Bluetooth timed out (reading reply)…"). Previously a device drifting out
    of range mid-exchange hung the unlock UI forever.
  - **Empty reads tolerated** (bounded to 10) while assembling the reply body instead of
    failing on the first empty chunk.
  - Web path prefers `writeValueWithoutResponse` for payload chunks (falls back to the
    deprecated `writeValue`) — matches the native path and avoids per-chunk ACK stalls.
- **Unchanged:** discovery filters, RPC auth/digest logic, `Switch.Set` + `toggle_after`
  semantics, offline outbox attribution. No behaviour change on the cloud path.
- **Tests:** `src/lib/__tests__/shelly-ble-transport.test.ts` (9 tests — framing,
  chunking, poll-until-ready, empty-read tolerance, timeout messages).

## 2026-08-21 — Stale PWA accepted tournament invitations without divisions
- **Evidence:** Stiaan Swanepoel's recording shows the old single-action registration
  dialog while an "Update now" prompt is visible. That cached client called the current
  acceptance RPC without `p_divisions`, so the registration became confirmed/paid with
  `division_choices = {}` and no player-allocation entry.
- **Hardening:** A database trigger now rejects every confirmed registration for a
  multi-division tournament unless it contains at least one currently valid division.
  This protects public links, signed-in flows, direct writes, and outdated installed
  app versions. The internal trigger function is not executable by public or signed-in
  clients.
- **Data repair:** Reopened only the three incomplete Nelspruit Club Champs 2026 invites
  found by the audit: Stiaan Swanepoel, Dillan van Heerden, and Johan van Wyk. Their
  incomplete confirmation/payment markers were cleared; correctly registered entrants
  were not changed.

## 2026-08-21 — Club email pacing, delivery log & Nelspruit invite re-send

**Problem.** A bulk tournament-invite send from Nelspruit fired hundreds of parallel
SMTP requests through `deliver_email_for_notification` -> `email-notifications`.
Gmail responded `421-4.3.0 Temporary System Problem`: 208 sent, 153 failed, 53 expired
in the DLQ. Admins had no way to see this.

**Fixes.**
- `public.email_outbox` — per-club paced queue (status/scheduled_for/attempts/last_error)
  with club-admin RLS; `email_outbox_state` holds a single-flight lease.
- `claim_email_outbox_batch()` / `release_email_outbox_lease()` — service-role only,
  bounded batch, `FOR UPDATE SKIP LOCKED`.
- `deliver_email_for_notification` now detects a burst for a club and enqueues into the
  outbox (90s spacing) instead of firing another immediate request.
- `supabase/functions/process-email-outbox` — cron every minute, max 5 per run, 4s gap,
  3 attempts then `failed`.
- `email_send_log` gained `club_id` (+ backfill) and `context`; `email-notifications`
  now stamps `club_id` on every club-SMTP log row.
- New admin tab **Email Log** (`src/components/club-admin/EmailLogTab.tsx`): stats,
  time/type/status filters, queue view with send-now/cancel, bulk re-queue of failures.
- Data repair: 139 failed/DLQ Club Champs 2026 invites re-queued, 90s apart, starting
  00:00 SAST 2026-08-22.

**Note.** Personal Gmail SMTP tops out near 100 mails/hour in bursts; the outbox paces
  to ~40/hour. Clubs doing large mailings should move to a proper relay.

## 2026-08-21 — Tournament player withdrawal from allocation UI

**Problem.** Admins could allocate a player to multiple divisions using the
ExtraDivisionsPicker, but there was no way to remove a player from *all*
divisions / the tournament from the Players allocation step.

**Fix.** Added a **"Withdrawn / not playing"** option to the primary division
dropdown on the Players allocation step for singles, doubles pairs, and unassigned
players. Selecting it:

- removes the player/pair from local selection and group/extra-division maps;
- deletes any `club_champs_entries` rows for the player(s) using a
  `club_member_id` / `partner_member_id` OR filter;
- updates the corresponding `club_champs_registrations` row to `cancelled` and
  clears `confirmed_at`, `confirmation_source`, `partner_member_id` and
  `partner_confirmed`;
- invalidates `champ-invitees` and `champ-registrations` queries so the
  Registrations tab reflects the change immediately.

**Files.** `src/components/club-admin/ClubChampsTab.tsx`.

## 2026-08-22 — Self-scheduled knockout: single-round scheduling step
**Problem:** Knockout tournaments with `scheduling_mode = "self"` still rendered the full club-scheduling UI (courts, per-day windows, fill/spread, pool breaks, playoff timing, capacity check) even though players arrange their own games and later rounds do not exist yet.
**Fix:**
- New `src/lib/tournaments/self-scheduled-rounds.ts` — `isSelfScheduledKnockout` (self + ALL divisions knockout), `roundProgress`/`currentRoundNumber`/`nextRoundReady` from `club_champs_matches`, stage naming, non-destructive `patchRound`/`ensureRound`, `roundIsClubScheduled`.
- `RoundDeadline` extended with optional `notes` and `mode` ("club" flips a single stage back to club-scheduled) — stored inside the existing `club_champs.round_play_by` jsonb, no DB change.
- New `src/components/club-admin/tournament/SelfScheduledRounds.tsx` — current round only (name, play-by date, notes), completed rounds read-only, semi/final club-schedule switch, later rounds locked.
- `ClubChampsTab.tsx`: Dates/Times/Courts step swaps the multi-round deadline list for the single-round panel; Schedule Configuration step hides fill/spread, playoff timing, slot/bell and slot preview in this mode. Ticking the finals club-schedule switch restores the full controls; switching back to "Club schedules" restores all saved values (nothing is cleared).
**Tests:** `src/lib/tournaments/__tests__/self-scheduled-rounds.test.ts` (11), `src/test/self-scheduled-rounds-panel.test.tsx` (2). Full suite green.

## 2026-08-22 — Allocation UI: pools rendered as separate blocks
**Problem:** A multi-pool division (e.g. Nelspruit 1st League, 9 players, 2 pools) rendered as ONE seed list with alternating `1. A`, `2. B`, `3. B`, `4. A` badges — organisers could not read pool membership.
**Fix (rendering/grouping only — serpentine algorithm unchanged):**
- `src/lib/tournaments/pools.ts`: added `poolBlocks()` (pool-grouped rows carrying their division seed number), `poolSizes()` and `flattenPools()`; `blockPoolIndex` now uses the balanced `poolSizes` so a manual (block) split reproduces exactly the serpentine pool sizes for any pool count.
- `ClubChampsTab.tsx` allocation step (singles AND doubles): each pool renders as its own titled block `Pool A (5 players)` with its own `SortableContext`; per-row A/B badges removed, seed number kept; ladder `#n` badges, unranked flag, multi-division picker, withdraw and league dropdown unchanged.
- Drag handlers (`handlePlayerDragEnd`/`handlePairDragEnd`) now operate on the flattened pool-block (visual) order, so a move within/between pool blocks stores exactly what the organiser sees, marks the division manual and never silently rebalances. `Rebalance pools by seed` still restores the seeded blocks.
- Draw-prep (`splitIntoPools` → `distributeIntoPools`) uses the same membership shown in the blocks (asserted by test).
**Tests:** `src/test/pool-distribution.test.ts` now 14 tests incl. the Nelspruit 9/2 case, 4/8 pools, manual blocks and block↔draw-prep parity.

## Knockout section sizing (bracket-optimised)
- `src/lib/tournaments/knockout-sections.ts` — `knockoutSectionSizes(total, sections)`: greedy, strongest section first; each section takes the power of two closest to the running average (ties → larger) within `[2, remaining - 2*(sectionsLeft-1)]`; last section takes the remainder; sizes returned largest-first. 14/2 → 8+6, 22/3 → 8+8+6, 30/4 → 8+8+8+6, 12/2 → 8+4. Fewer entrants than 2× sections falls back to the balanced split.
- `pools.ts` gained `PoolAssignOptions.knockout`. Only when set do `poolSizes`/`poolIndexes`/`poolBlocks` use bracket sizes; the serpentine deal then respects those capacities (top seeds still land in different sections). Round robin / Swiss / cross league are byte-identical to before.
- `ClubChampsTab.tsx` passes `poolOptsFor(gi)` (`{ manual, knockout: formatForLeague === "knockout" }`) everywhere pools are rendered/dragged; the allocation UI shows `Pool A (8) · Pool B (6)` plus the round-1 bye count. Manual arrangements are untouched until "Rebalance pools by seed".
- Tests: `src/test/knockout-sections.test.ts` (10) + existing `pool-distribution.test.ts` unchanged and passing.

## Self-scheduled knockout matches (players arrange their own court/time)
- Wizard: `schedulePreview` no longer requires play days/courts when `schedulingMode === "self"`; it returns the draw with every playable match unscheduled (court/date/time null, `play_by` from the round deadline).
- DB: `club_champs_matches.booking_id` added; new `public.self_schedule_champ_match(match, court, date, time, duration)` SECURITY DEFINER RPC — participant/organiser only, re-checks court availability, creates/moves the booking, writes court/date/time and notifies both players. `guard_champ_match_participant_scoring_update` honours the `app.self_schedule` session flag so only that RPC may move a match.
- UI: `src/lib/tournaments/self-schedule.ts` (permissions + slot helpers), `src/components/tournaments/ScheduleMatchDialog.tsx` (real courts + live availability), `MyChampionships.tsx` shows "Upcoming match — not yet scheduled" with Choose court & time / Reschedule.
- Tests: `src/test/self-schedule.test.ts` (12).
- Player card actions (self-scheduled knockout only): `Schedule match` → `Set Up & Mark Game` (`getTournamentFormat(scoring_mode).markerRoute(matchId)` → existing marker, which inherits best-of / points-per-game / deuce rule from the tournament) → normal result capture with game scores. `canMarkChampMatch()` in `self-schedule.ts` gates it: participants + organiser only, never a completed/forfeited/walkover re-mark, and unscheduled matches are markable unless a booking is required.
- Progression: `buildNextRound({ playBy })` stamps the next round's deadline and leaves court/date/time null; `KnockoutCard` passes `selfScheduled`/`playByForRound` from `club_champs.round_play_by`, so the new round appears as an unscheduled self-scheduled match. Tests: 17 in `src/test/self-schedule.test.ts`.

## Knockout draw: "Player vs themselves" self-fixtures (fixed 2026-08-22)
- **Symptom:** first-round rows like `Thabo Mokoena vs Thabo Mokoena` in knockout sections.
- **Root cause (two parts):**
  1. `buildKnockoutLeague` in `ClubChampsTab.tsx` wrote bye rows as `entityA = entityB = bye member`, and the insert mapped both columns to the same member — a bye rendered as a playable self-fixture.
  2. It also used `distributeSeedsBalanced` (equal headcount) instead of the bracket-optimised knockout pool sizing used by the allocation UI, so sections came out 7/7/8/8 and produced avoidable byes.
- **Fix:** knockout sections now use `distributeIntoPools(..., { knockout: true })`, entrant IDs are de-duplicated per division, bye rows are one-sided (`player_b_member_id = null`, `is_bye`, winner set, status `completed`), and `assertNoSelfMatches()` in `src/lib/tournaments/knockout.ts` plus a pre-insert guard fail generation loudly instead of saving a corrupt draw.
- **Tests:** `src/test/knockout-self-match.test.ts` (8/7/6 entrants, duplicate-entry protection, progression).

## 2026-08-23 — Riverside: player court booking destroyed by draw regeneration

**Symptom.** Willem Pretorius self-scheduled his Riverside knockout match vs Craig
Nieuwoudt (Court 1, Tue 25 Aug 13:00, booking `1d56fbcf…`, notified 23:52). Two
minutes later the player card again said the match needed scheduling.

**Root cause (causes 2 + 4).** Re-saving the tournament wizard runs a destructive
rebuild in `ClubChampsTab.tsx`: it deleted every booking matching
`champ:<id>:%` — which includes player-created `champ:<id>:match:<matchId>`
bookings, not just organiser `:block:` court blocks — then deleted and
re-inserted all `club_champs_matches` rows with new ids. The player's booking row
and the match's court/date/time were both wiped; nothing in the UI was at fault.

**Data restored.** Booking `1d56fbcf-0182-4a66-9c56-74d537b875b1` recreated with
its original court/date/time and relinked to the current match row
`2bcadcfc-8433-4dff-bac2-593783366855`. No other bookings touched.

**Fix.** `src/lib/tournaments/preserve-schedules.ts` + rebuild rework:
matches with a booking or a result are "protected"; the rebuild reconciles them
against the new draw by participants (not row id), aborts before deleting
anything if a protected fixture is gone, carries court/date/time/booking onto the
new row, only deletes `:block:` bookings, and re-points surviving bookings'
external ids at the new match ids. Tests: `src/test/preserve-schedules.test.ts`.

## 2026-08-23 — Tournament court bookings show player names

Tournament match bookings rendered only the competition name ("Men's Singles").
New `src/lib/tournaments/booking-label.ts` derives the label dynamically from the
linked match's player ids (no snapshot stored, so renames stay correct):
`Willem Pretorius vs Craig Nieuwoudt` with `Riverside … · Men's Singles` as
secondary context, `A / B vs C / D` for doubles, `X (bye)` for byes and
`X vs TBD` for undecided opponents. `Bookings.tsx` now joins partners + is_bye +
group_labels, matches player bookings by the `champ:<champ>:match:<id>` external
id (falling back to court/time overlap), and shows the names in the grid cell,
tooltip and details modal. Non-tournament bookings are untouched.
Tests: `src/test/booking-label.test.ts`.

##  — league_marker_locks cross-tenant read (RLS)

- **Issue:** SELECT policy on `league_marker_locks` was `USING (true)`, so any authenticated user could read marker locks from any club.
- **Fix:** new SECURITY DEFINER helper `public.can_access_league_fixture(_user_id, _fixture_id)` resolves fixture -> `platform_league_fixtures.association_id` -> `league_associations.platform_association_id` -> association tenant club + `association_affiliated_clubs` (active) and checks `is_club_member`. Super admins (`is_platform_admin` / `has_role(admin)`) bypass scoping.
- SELECT policy replaced with the helper; stale-lock takeover (UPDATE/DELETE) now also requires fixture access; own-lock behaviour unchanged.
- Revoked anon table grants and anon EXECUTE on the helper.
- **Verified:** club member true, unrelated club false, platform admin true, anon/null false. 415 tests pass, build OK.

## 2026-08-23 — champ_marker_locks cross-tenant read (RLS)

- **Issue:** SELECT on `champ_marker_locks` was `USING (true)`; UPDATE was also `USING (true)` — any authenticated user could read or take over championship marker locks from any club.
- **Fix:** new SECURITY DEFINER helper `public.can_access_champ_match(_user_id, _match_id)` resolves `club_champs_matches.champ_id` -> `tournaments.club_id` -> `is_club_member`, with `is_platform_admin` / `has_role(admin)` super-admin bypass.
- SELECT, INSERT (claim), UPDATE (takeover request / stale takeover) and DELETE (stale release) all now require club access; own-lock behaviour (`user_id = auth.uid()`) unchanged.
- Revoked anon table grants and anon EXECUTE on the helper.
- **Verified:** club member true, unrelated club false, platform admin true, anon false. 456 tests pass, build OK.

## 2026-08-23 — Anonymous full `clubs` table access removed

- **Symptom:** the backend security scan flagged the anonymous `clubs` read policy as unrestricted (`USING (true)`), leaving the sensitive base table reachable even though column grants attempted to limit returned fields.
- **Finding:** public landing, directory, registration, PWA manifest, and TV routes still queried `public.clubs` directly. The existing invoker view depended on that base-table access and could not be the security boundary.
- **Fix:** revoked all anonymous privileges on `public.clubs` and removed its anonymous policy. Public discovery now uses only `get_public_club_by_subdomain(text)` and `list_public_clubs()`, fixed-column `SECURITY DEFINER` functions with an explicit `search_path`. Their projection contains public identity/branding/contact and landing delegate references only; gateway credentials, fees, billing/SLA, subscription, banking, secret, and internal operational fields are excluded. Authenticated member and super-admin base-table policies are unchanged.
- **Guard:** all unauthenticated frontend call sites use `src/lib/public-clubs.ts`; anonymous base-table privilege is verified false, and the security scan no longer reports the critical `clubs` exposure.

## 2026-08-23 — Club League doubles pair picker showed empty controls

- **Symptom:** A club admin could open **Pairs** for a Doubles League but could not select a team or players.
- **Finding:** The picker silently filtered teams against an association-level season value that is not authoritative for a team. A newly created Doubles League with no teams also opened the same blank-looking controls, with no route back to team setup.
- **Fix:** The picker now loads every active team owned by the selected club and league, uses each team's own `season_id`, prioritises current-season teams without hiding others, and provides a direct **Create teams** action when none exist. Team and member request failures now render explicitly.
- **Guard:** A stale team selection from a previously opened league is ignored, player selections reset when teams change, and both registration and member-query errors are checked.

## 2026-08-24 — Tournament champion scope schema-cache save failure

- **Symptom:** Opening or saving **Edit tournament** failed with `Could not find the 'champion_scope' column of 'club_champs' in the schema cache`.
- **Finding:** `champion_scope` existed on the authoritative `tournaments` table, but the editable compatibility view `club_champs` did not project it. Its insert/update compatibility triggers also did not forward the field.
- **Fix:** the view now exposes `tournaments.champion_scope`; compatibility inserts default it safely to `division`, and edits persist the selected `division` or `pool` value to the authoritative tournament row.
- **Guard:** existing tournament rows retain the non-null `division` default, the view remains `security_invoker`, and no historical draw or match data is rewritten.

## 2026-08-24 — Riverside Round 2 draw exposed only one pool

- **Symptom:** The tournament-level **Prepare next round** action opened one Riverside `Testing NSC` section and showed only two matchups, even though four independent sections were ready.
- **Data diagnosis:** Round 1 is complete and valid in Men's Pool A (5 qualifiers / 3 R2 matchups), Men's Pool B (5 / 3), Ladies Pool A (4 / 2), and Ladies Pool B (3 / 2): 17 qualifiers and 10 matchup rows in total, including three valid R1 byes. No R2 fixture/result rows existed. One stale Men's Pool A R2 planning row remained from the prior post-R1 cleanup and was removed; all R1 results were preserved.
- **Root cause:** `tournamentNextAction` intentionally selects one highest-priority section, and `TournamentNextActionBar` passed only that section into the setup/draw dialogs. The other ready sections existed in progression state but were not exposed from the tournament-level CTA.
- **Fix:** The action bar now inventories every ready division/pool and, when more than one is ready, opens a scrollable scope selector with the real division/pool name, bracket-derived stage, qualifier count, and expected matchup count. Selection then uses the existing section-scoped setup and atomic draw confirmation, so pools cannot be mixed and completed R1 rows remain immutable. Per-section progress and knockout controls now also include the pool name in both setup and draw dialogs.
- **Guard:** `readyNextRoundScopes` derives unique winners from every completed feeder section; tests cover four scopes, a 34-qualifier large round (17 matchups/compact layout), uneven brackets, exact scope visibility, bracket labels, duplicate protection, and R1 immutability. Full suite: 766 tests passed.

## 2026-08-26 — NIL same-night substitute available for one player but not another

- **Symptom:** Nelspruit could select Bamanye in a second fixture, but Matt was blocked; the club rule toggle also appeared not to save.
- **Finding:** Bamanye had permanent registrations in two teams, while Matt had only one. The fixture scorecard candidate query only included reserves and bye-team players, so it never applied `allow_multi_fixture_per_night`. Platform fixtures also loaded organiser rules directly instead of resolving the local team's tenant association override. The rules form omitted the toggle from its defaults.
- **Fix:** weekly lineups and fixture scorecards now resolve rules through the tenant association (with organiser fallback), include every other association squad when the club's same-night option is enabled, and label those players with their existing team. This covers valid movement such as Matt moving from a 1st League team into a 2nd League fixture. Rule saves explicitly create/update the tenant association row and validate the returned association. Nelspruit Singles League now has a tenant override with the option enabled.
- **Guard:** same-night participation remains separate from permanent multi-team registration; existing fixture rows are never deleted, player swaps continue to persist immediately to fixture-specific match rows, and database access policies remain unchanged.

## League lineup: guaranteed replacements + audited post-play corrections (2026-08-26)

- Backend: `sync_match_results_from_lineup` no longer overwrites fixture positions that a captain explicitly confirmed (`lineup_set_at`); `freeze_league_rubber_participants` locks participants only for rubbers that have play.
- New `admin_correct_rubber_participant` RPC (SECURITY DEFINER) lets a club/platform admin change the recorded player on a played rubber without touching scores; every correction is written to `league_participant_corrections`.
- UI (`LeagueGameDetail.tsx`): per-rubber rights come from `rubberEditRights()` in `src/lib/league/lineup.ts`. Captains may replace players in any not-yet-started rubber (latest save wins); once a rubber has play, only admins see the amber correction action.
- After a correction, an admin banner shows before/after bonus and total points and requires an explicit "Save corrected points & standings" action, so standings never shift silently.
- Coverage: `src/test/league-lineup.test.ts` (17 tests) including play detection and role boundaries.
- Follow-up hardening (same day): score/live-rally upserts no longer send player codes when the server row already has players (`playerFieldsForScoreWrite`), so a stale device cannot re-apply original players over a newer reserve swap; and "Save Setup" no longer blanks an already-submitted `league_fixture_results` row (only the format snapshot is refreshed).

## 2026-08-26 — `club_champs` security-definer view finding

- **Issue:** a later `CREATE OR REPLACE VIEW public.club_champs` omitted the view's `security_invoker` option, so the compatibility view reverted to owner-context access and triggered the database security linter.
- **Fix:** restored `security_invoker=true` without recreating the view, changing its columns, or changing its existing grants.
- **Guard:** reads now apply the underlying RLS rules on `tournaments`, `tournament_governance`, and `tournament_rules` for the caller. Existing member, captain, club-admin, association-admin, and platform-admin access remains governed by those policies. The security-definer-view linter error is cleared.

## 2026-08-26 — Platform invoices issued in advance of the renewal date
- `run-subscription-billing` now reads `advance_issue_days` (default 5) from `platform_invoice_settings`.
- The billing cron (`run-subscription-billing-monthly`, jobid 52) fires nightly at 02:00; the function only bills on the day that is exactly `advance_issue_days` before a month start (manual/dry/targeted runs bypass the window via `force`/`subscriptionIds`).
- Invoices are still dated on the renewal date: `issued_at`, `billing_month`, period and `due_date` (+14 days) all use the month-start date, while creation and emailing happen `advance_issue_days` earlier.
- WhatsApp arrears now cut off at the actual run timestamp (the arrears month is incomplete when issuing early); remaining unbilled usage rolls into the next invoice.
- Super Admin → Subscriptions → Invoice Options exposes "Send Invoices Days Early".

## 2026-08-26 — Scorecard submission protection guards (Nelspruit phantom results)

- **Symptom:** Nelspruit 2nd League scorecards were submitted at 11:45–11:47 SAST (ADMIN_OVERRIDE) for 17:00 fixtures — before any squash was played. This locked players out of live marking at 17:00 and risked bonus/penalty-only "phantom" results posting to standings.
- **Fix:** two guards now apply whenever a save would finalise a fixture as `submitted`:
  1. `LeagueGameDetail.tsx` `handleSubmit` blocks submission outright when total games played is 0 and no forfeit is recorded ("No games have been played yet — you can't submit results").
  2. Both `handleSubmit` and `AdminManualScoreDialog` show a confirm warning when finalising before the fixture's scheduled start ("This match hasn't been played yet — submitting will pre-empt live marking").
  3. `AdminManualScoreDialog` additionally blocks 0–0 total-points submissions and bonus-only entries (games explicitly 0–0 with points > 0).
- **Guard:** draft/setup saves and forfeit-only results are unaffected; the pre-match warning is a confirm (not a block) so catch-up/admin workflows remain possible; live-sync standings recalc is unchanged.

## 2026-08-26 — Bank Statement Import & Reconciliation
- New tables `club_bank_statements` and `club_bank_transactions` (club-admin RLS, unique fingerprint per club prevents re-importing the same line).
- Added missing `opening_balance_equity` value to the `gl_account` enum (Opening Balances dialog previously failed on its balancing entry).
- New parser `src/lib/finance/bank-statement.ts`: CSV/TSV (preamble skipping, auto column mapping, SA number/date formats), OFX and QIF, duplicate detection (exact fingerprint + ±7-day same-amount/narrative match), account auto-categorisation and fuzzy member matching.
- New `BankStatementImportDialog` in Finance → Journal: upload, override column mapping, per-row allocate account/member, deselect duplicates, optional immediate posting to the GL (bank_current vs contra account, dated on the transaction date), and opening-balance seeding when it is the club's first statement.
- Tests: `src/test/bank-statement.test.ts` (12).

## Tournament entry payment self-service hardening (2026-08-27)
- Finding: RLS UPDATE policies on `club_champs_registrations` were row-scoped but column-unrestricted, so an entrant could self-set `status='paid'`, `fee_paid_cents`, `payment_ref`, `paid_at`.
- Fix: `club_champs_registrations_guard_self_update` / `_guard_self_insert` BEFORE triggers block financial/confirmation column changes and restrict self status transitions to `pending_payment|pending_eft|cancelled|declined`. Admins (`is_club_admin_or_permitted(..,'champs')`), SECURITY DEFINER RPCs and service_role/webhook writes bypass (guard only applies when `current_user = 'authenticated'`).

## 2026-08-27 — Tournament detail: per-league fixtures nested under league standings
- src/pages/ClubChampsView.tsx: multi-league view no longer renders all standings cards first and all "— Fixtures & Results" cards afterwards. Each league is now one card: standings, then that league's fixtures (pool-grouped when pools exist). tournament-fixtures anchor moved to wrap the per-league cards; handicap suggestions moved below. Cross-league combined fixtures unchanged.

## 2026-08-29 — Member-facing action labels clarified (mark vs enter result, court booking)
- **Symptom:** Members found "Mark", "Enter Result", "Schedule", and "Reschedule" ambiguous; technologically inexperienced users did not know whether to mark point-by-point or just type a final score.
- **Fix:** Renamed member-facing CTAs across championships, tournaments, league fixtures, challenges, and bookings:
  - Marking: "Mark game" / "Mark game point by point" (instead of "Mark" / "Set Up & Mark Game").
  - Result entry after play: "Enter your result" (instead of "Enter Result").
  - Court scheduling: "Make your court booking" / "Book court" and "Reschedule your court booking" / "Reschedule" (instead of "Schedule match", "Set court & time", "Arrange your match").
  - League admin result editing: "Enter your results" / "Edit your results".
- **Files:** `src/lib/tournament-formats/standard.ts`, `src/lib/tournament-formats/swiss.ts`, `src/lib/tournaments/fixture-scheduling.ts`, `src/components/tournaments/ScheduleMatchDialog.tsx`, `src/components/MyChampionships.tsx`, `src/pages/Tournaments.tsx`, `src/pages/ClubChampsView.tsx`, `src/components/league-games/UpcomingFixturesTab.tsx`, `src/pages/Challenges.tsx`, `src/pages/Bookings.tsx`, `src/test/fixture-scheduling.test.ts`.
- **Guard:** Labels are presentation-only; underlying permissions (`canScheduleFixture`, result-entry guards, marker routing) are unchanged. Tests updated to match new label strings.

## 2026-08-29 — Hide point-by-point marking on self-scheduled knockouts
- Self-scheduled tournament matches (players book their own court, non-team events) no longer show "Mark game" buttons; players use "Enter your result" only.
- Removed Mark buttons from MyChampionships.tsx match cards; hid the marker button in Tournaments.tsx when the championship scheduling_mode is "self". Admin "Redo score" correction path in ClubChampsView unchanged.

## 2026-08-31 — Invite audience email-reach transparency + club_champs invite_extra_details fix
- Fixed "Save failed: Could not find the 'invite_extra_details' column of 'club_champs' in the schema cache": re-created the club_champs compat view with t.invite_extra_details and patched club_champs_compat_insert/update triggers to carry it to tournaments.
- tournament_invite_directory RPC now lists only members who can actually receive an invite (email on file OR linked login); tournament_invite_scope_tree RPC returns a new email_count per club.
- InviteScopeTree shows "X of Y with email" per club/association; selection summary reads "X of Y members can be emailed". ClubChampsTab roster picker and hint text updated to match (blue/asterisk = has a SquashHub login).
- Aligned two stale doubles-pairing wording tests with current copy.

## 2026-09-02 — Wallet top-ups auto-settle outstanding fees
- Problem: members who topped up their wallet (Stitch/Yoco/Paynow) were left with unpaid fee rows unless they manually did "Pay from credit", so the recurring-payment prompt kept showing (e.g. Megan, Gordons Bay, R725).
- Fix: new shared helper `supabase/functions/_shared/wallet-auto-settle.ts` (`autoSettleFeesFromTopup`) settles unpaid fees oldest-first from any confirmed top-up; wired into stitch-settlement, paynow-settlement, yoco-verify-checkout. FinanceTab EFT top-up confirmation now also auto-settles fees and posts only the remainder to member_credits.
- Data: settled Megan Hunter (GB) R725 fee from her confirmed R1000 Stitch top-up; cancelled her stale duplicate R725 pending EFT top-up.
- Deployed: stitch-verify-payment, stitch-sweep-pending-payments, yoco-verify-checkout, paynow-verify-checkout, paynow-webhook.

## 2026-09-02 — Club device switches "Device not found" fix
- Root causes (2): (1) device-control UUID regex used \d-only groups, rejecting ~98% of hex UUID device IDs before the registry lookup; (2) the club_devices registry migration was never applied to the database.
- Fix: corrected regex to hex groups [0-9a-f]; applied club_devices table + RLS + can_operate_device() + GRANTs, and backfilled existing Shelly door/court-light configs into the registry (5 devices: Gordons Bay door + 2 courts, demo club 2 courts).
- Verified: regex test against all real device IDs (old rejects, new accepts; legacy-court-light-N still routes to legacy branch). device-control redeployed.

## 2026-09-14 — Tournament player picker draft persistence
- **Symptom:** players checked on the tournament Players page disappeared after leaving and reopening setup unless the organiser had already visited league allocation.
- **Cause:** the picker lived only in browser state; draft entry rows were derived from league assignments, so an unallocated roster produced no saved rows.
- **Fix:** tournament drafts now store `draft_player_ids` separately. Settings autosave and Save Progress persist the checked roster, and setup restores it whenever no final entry allocation exists.
- **Guard:** final `club_champs_entries` remain authoritative; draft roster saves do not accept invitations, alter registration/payment status, or send messages. Regression coverage verifies draft, empty, legacy, and allocated restore precedence.

## 2026-09-14 — Enter and pay for other players (tournaments)

Members can now enter one or more other eligible players into a tournament from the entry card, optionally choosing each player's partner, and settle all entry fees in one go (card, EFT or member account).

- DB: `club_champs_registrations.paid_by_member_id`; RPCs `register_players_for_champ`, `charge_champ_entries_to_payer`; trigger `trg_fee_paid_marks_champ_entries` marks linked entries paid when the fee is settled (idempotent).
- UI: `src/components/tournaments/GroupEntryCard.tsx` used by `TournamentRegisterCard.tsx`; helpers + tests in `src/lib/tournaments/group-entry.ts` and `src/test/group-entry.test.ts`.
- Entered players get an in-app notification; already paid entries are never charged twice.

## 2026-09-16 — WhatsApp invitation: short link + single call to action
- Long `/i/<64-char token>` URLs looked like spam in WhatsApp. New table `invite_short_codes`
  plus SECURITY DEFINER `ensure_invite_short_code()` / `resolve_invite_short_code()`.
  Invites now carry `https://<sub>.squashhub.co.za/i/<10-char code>`; `TournamentInvite`
  swaps a short code for the real token before anything else (tokens are >= 32 chars).
  If a short code cannot be minted the full URL is used — an invite always goes out.
- Wording: the duplicated "Open your personal link to confirm. Reply NO to decline."
  line is removed. One instruction only: "To accept or decline your invitation, tap here: <url>".
  Never reintroduce the duplicate, and avoid the word "link" in the call to action.
- New template `tournament_invite_tap` carries that wording and is awaiting Meta approval.
  The send path uses it only when `approval_status = 'approved'`, otherwise the previously
  approved `tournament_invite` keeps sending — invitations are never blocked by approval.

## 2026-09-17 — Withdraw for guest entrants + missing challenges.expires_at
- Tournament invite: the withdraw block gave no way for an unauthenticated entrant to
  prove the invitation was theirs, so `withdraw_tournament_entry_public` always raised a
  verification error. The same surname / phone-last-4 field now appears inside the
  withdraw confirmation when there is no signed-in user, and verification errors show
  under the field.
- `challenges.expires_at` was absent from the live database (migration
  20260306224000 never applied), so the nightly `reminders` job 500'd on the
  challenge-expiry section. Column + partial index restored via migration.

## 2026-09-17 — Doubles pairing: no partner approval, payer covers both entries

- Choosing a partner now books the pair immediately (`propose_doubles_partner` inserts `awaiting_payment` with `accepted_at`); partners no longer accept/confirm.
- The chooser is always the payer (`pays_for_partner = true`), so the entry amount is the fee x 2.
- `tournament_invite_payment_context` returns the pair amount (both entry fees) when the payer's partner is unpaid, which fixes guest invite payments charging a single fee.
- New `champ_apply_paid_registration(registration_id, payment_ref)` marks the covered partner's entry paid and settles the pair; called from Stitch settlement after a tournament payment.

## 2026-09-17 — Family Doubles multi-pair entry and combined payment

- A Family Doubles invite holder can now build several exact two-player pairs from the genuinely invited players. Each player remains limited to one active pair in that division, but the payer does not have to play in every pair they create.
- Every created pair is accepted immediately; selected partners do not approve separately. The invite holder remains the payer for all managed pairs.
- The guest payment context counts distinct unpaid players across all managed pairs exactly once. Rachel's existing Rachel/Chané pair therefore produces a new R300 Stitch payment instead of R150.
- Covered partners cannot start a separate payment while the family payer is responsible for them. Successful settlement marks all covered registrations paid idempotently and settles every managed pair.
- This behavior is restricted to tournaments named/configured as Family Doubles. Ordinary doubles tournaments retain one self-selected pair per player.

## 17 Sep 2026 — Stitch webhook skipped payment settlement
Symptom: Rachel's R600 Family Doubles payment showed only the gateway fee in the
ledger; no bank receipt, fees still outstanding for all 4 players.
Cause: `supabase/functions/stitch-webhook/index.ts` had its own local
`finalisePayment()` that only stamped the payer's registration — it never marked
`club_member_fee_payments.paid` (which posts Dr Bank / Cr Debtors) nor called
`champ_apply_paid_registration` to settle covered partners/pairs.
Fix: webhook now imports the shared `finalisePayment` from
`supabase/functions/_shared/stitch-settlement.ts` (single source of truth for
once-off settlement). Existing R600 payment backfilled.
Rule: never duplicate settlement logic in a Stitch entry point — always use the
shared helper so verify, sweep and webhook behave identically.

## 17 Sep 2026 - League planning reminders suppressed when season finished

The nightly `reminders` job sent "Plan league games for next week" even after a club's league season ended (Nelspruit: last round ended 2026-09-06).
Fix: the `league_planning` section now requires (a) at least one non-archived league for the club and (b) at least one league round whose end date (or round date) is on/after tomorrow and whose status is not cancelled/completed/archived. Deployed `reminders` only.

## 17 Sep 2026 — Security findings: PII scoping
- `sportyhq_profiles`: replaced `USING (true)` SELECT policy with scoped access (platform admins, members of the linked member's club, or the person themselves).
- `club_champs` view: now `security_invoker = on`, so underlying `tournaments`/`tournament_governance`/`tournament_rules` RLS applies.
- To keep access unchanged for legitimate users, added a `tournaments` SELECT policy for registrants/entrants and extended `can_view_tournament()` to include registrations, partners and entries (covers cross-club entrants).
- `club_members.id_number` / `address`: already protected by column-level grants (authenticated has SELECT on 49 of 51 columns); read via `club_member_private_fields()` for self/admins. Finding was stale — no change needed.
- 17 Sep 15:29: REVERTED `club_champs` to `security_invoker = off`. Enabling invoker broke guest/anon access to tournament pages ("Tournament not found" when Vian tried to pay R600). The `tournaments` entrant policy and widened `can_view_tournament()` were kept (harmless, additive). Any future fix for the Security Definer View finding MUST preserve anonymous read of `club_champs` for invite/payment pages.

## 18 Sep 2026 — Shared tournament WhatsApp wording and player greeting

- Tournament re-invitations previously used the approved generic `club_notice` wrapper, which incorrectly described them as updates about a club account.
- Every club now uses the same `tournament_notice` utility template: tournament-specific heading, `Dear <player>`, editable organiser wording, and the personal tournament-entry URL.
- This was not a Gordon's Bay configuration difference. Email added names during delivery, while WhatsApp's generic fallback had no player field. Recipient names remain delivery-time personalisation and are not stored in the editable tournament copy.

## 18 Sep 2026 — PayFast gateway support (Uitsig)

- Uitsig selected PayFast in Admin → Banking and saved merchant credentials, but members hit "No supported online payment gateway is configured for this club". Cause: PayFast was selectable in the admin UI only — it was absent from `SUPPORTED_GATEWAYS` and had no edge functions.
- Added `payfast_payment_sessions` (member/admin read-only RLS, service-role writes) and three functions mirroring the Paynow pattern:
  - `payfast-create-checkout` — validates the member owns the club_member row, checks `gatewayEnabled(club, "payfast")`, resolves credentials with `resolveGatewayCreds`, creates a session and builds a signed PayFast process URL (sandbox when `mode=sandbox` or merchant 10000100).
  - `payfast-itn` — verifies signature, merchant id, PayFast server-side payload validation and the gross amount before an atomic claim + settlement (idempotent, safe on retries/out-of-order).
  - `payfast-verify-checkout` — read-only status report for the return page; confirmation is always the ITN's job.
- Signature rule: MD5 over fields in submission order, RFC1738 encoding (spaces as `+`, uppercase hex), blank fields dropped, passphrase appended last. Never reorder the field list in `payfast-create-checkout` without recomputing.
- Client: `GatewayId`/`SUPPORTED_GATEWAYS` include `payfast`; pending session stored under `sh.payfast.pending`; return params `payfast_session` / `payfast_cancelled`.

## 18 Sep 2026 — Empty member lists (tournament Players step, Riverside)

Symptom: the tournament wizard's "Select Players" step listed no club members;
only individually picked (directory) players appeared.

Cause: `club_members` uses COLUMN-level SELECT grants for `authenticated`. The
recently added `cross_gender_ladder_position` column was never granted, so every
query using `CLUB_MEMBER_COLUMNS` (useClubMembers, tournament member pool, etc.)
failed with `42501 permission denied for table club_members` and fell back to an
empty list. RLS was fine — this was a missing grant.

Fix: `GRANT SELECT (cross_gender_ladder_position) ON public.club_members TO authenticated;`

Rule: when adding a column to `club_members` (or any table with column-level
grants), grant SELECT on the new column in the same migration, or all roster
reads break silently.

## 18 Sep 2026 — PayFast card top-up failed (Uitsig)

Symptom: "Edge Function returned a non-2xx status code" when a member chose
Card on the Top Up dialog.

Cause: `payfast-create-checkout` selected a non-existent `clubs.currency`
column (the real column is `currency_code`). PostgREST errored, `club` came
back null and the function returned 400 "PayFast is not configured for this
club" — a misleading message because the club lookup error was swallowed.

Fix: select `currency_code`, and surface club-lookup errors explicitly instead
of treating them as "gateway not configured".

## 18 Sep 2026 — PayFast ITN signature mismatch (Uitsig) + monthly card payments

- **Symptom:** Gerhard Fourie's R20 PayFast top-up succeeded at PayFast but never reflected. `payfast-itn` logged `signature mismatch` and returned 200, so PayFast did not retry.
- **Cause:** our ITN signature always excluded empty fields and always appended the club passphrase. PayFast's own ITN sample keeps empty fields, and a merchant account may have no passphrase configured.
- **Fix:** `pfItnSignatureMatches()` in `_shared/payfast.ts` accepts any of the four valid combinations (empty fields kept/dropped x passphrase/no passphrase). The payload is still confirmed with PayFast's server-side validate call, so security is unchanged. The stranded R20 session was settled manually.
- **Recurring card payments (PayFast tokenisation):** `payfast-create-mandate`, `payfast-charge-mandates` (daily), `payfast-cancel-mandate`, and `payfast-itn` mandate activation. Stitch queue/submit jobs now filter `gateway='stitch'` so the two rails never collect the same mandate.

## 2026-09-20 — Recurring instalments now reduce fees (Gordon's Bay / Katya Fulton)
- record_collection_payment + record_mandate_initial_payment: added partial settlement — an instalment smaller than a fee now reduces the fee and posts Dr bank / Cr debtors against it (previously the fee stayed full and money sat as account credit).
- journal_fee_payment_received trigger: on final settlement posts only the remainder after existing part-payment credits (idempotent).
- booking-balance-gate: removed grandfathering bump-up; recognises fee_type 'club'; includes family fees (paid_by_member_id); allowance = season fees − payments made, buffer on top.
- wallet-auto-settle: top-ups now retain the club's min_booking_balance before sweeping old fees.
- PaymentMethodsCard: generic "Monthly club fees" row hidden when member's own category is recurring-eligible; family primaries see an "Increase to R x/month" action when family growth outgrows the active cap (new mandate cancels the old).
- Data: Katya's fee reduced 1600→1333.34, her two Stitch journal credits tagged to the fee, Kailash's missing R120 family fee raised (payer Katya), stuck session c5437b70 cancelled. She needs R201.99 (R181.99 other charges + R20 float) to book.
- Tests: src/test/booking-balance-gate.test.ts (5 tests).

## 2026-09-20 — Round dates ignored when a later stage is set up
**Symptom (Nelspruit):** the Final draw notice told players to play "before 17 Sep 2026" although the event was created with Finals = 22 Sep, and the admin could not change the date (field was disabled).
**Cause:** the planned `round_play_by` list was read positionally (`[round - 1]`). Divisions reach the final on different round numbers, so round 6 picked up the "Quarter-final" entry. `NextRoundSetupDialog` then treated that as a fixed, uneditable date.
**Fix:** new `deadlineForStage()` matches the round's stage name (Final / Semi-final / Quarter-final, section prefixes and plurals normalised) against the plan, falling back to the positional lookup only for unnamed rounds. `playByForRound(round, stageLabel)` threaded through ClubChampsView, ClubChampsTab, KnockoutCard, TournamentNextActionBar, AllNextRoundDrawsDialog. The play-by field is now always editable, with the planned date shown as guidance. Tests in `src/test/round-deadlines.test.ts`.
**Data:** Nelspruit Club Champs finals e774…/8a76…/a03e…/732a… corrected to 2026-09-22.

### 2026-09-20 — Fixture "play by" showed the wrong date on finals
Tournaments page: `matchPlayBy` read the section's round row (or the positional
plan entry) and ignored the fixture's own `club_champs_matches.play_by`. Nelspruit
finals carried 22 Sep on the match rows but displayed 20 Sep / 17 Sep. Fixed:
fixture's own date wins, then its section round row, then `deadlineForStage`,
then the positional plan entry.

## 2026-09-20 — Pool/section "Final" is really the league semi-final

A league running several sections has not reached its final: the Section A and
Section B winners still have to meet. The draw engine nevertheless named a
section's last game "Section B · Final", so it inherited the FINAL's planned
deadline (22 Sep) instead of the semi-final's (20 Sep).

Fix: `composeStageLabel(label, sectionLabel)` in `src/lib/tournaments/knockout.ts`
demotes a section-scoped "Final" to "Semi-final" (the league-wide "League finals"
bracket keeps its real names); used by knockout.ts, graduated.ts and draw-board.ts.
`src/pages/Tournaments.tsx` reads legacy rows back through the same demotion.
Data: Nelspruit Club Champs 2026 section finals relabelled and moved to 20 Sep.
Tests: `src/test/stage-label-section-final.test.ts`.

## 2026-09-20 — Mandate-increase notification on family growth
- `family_add_member` RPC: after raising the additional-family fee, compares the new family season total /12 against the primary's active stitch_mandates cap; if the monthly amount no longer covers it, inserts a deduped `mandate_increase` notification (unread-check) for the primary pointing to /my-account.
- Backfilled the notification for Katya Fulton (Gordon's Bay) whose R133.33 cap no longer covers R1,720 season total (R143.33/month).
- Notification bell realtime surfaces it as a toast; tapping opens My Account where the "Increase to R…/month" button re-authorises at the higher amount.

## 2026-09-20 — Nelspruit third-league final did not generate

- **Symptom:** The third league showed Hendrik Vorster and Raymond Gates as the two survivors, but **Create final** did not add their fixture.
- **Cause:** A completed section-0 semi-final made the old generation path treat the cross-pool bracket as decided instead of starting its next round.
- **Fix:** Every cross-pool round now uses the finals draw path even when section 0 already exists. The draw counts survivors across the complete league and excludes players eliminated in an earlier cross-pool round.
- **Data repair:** Added Hendrik Vorster v Raymond Gates as the third-league Final (round 7), scheduled status, play-by 22 Sep 2026.
- **Deadline:** The progress card now passes the centrally resolved Final deadline into the draw confirmation, matching the tournament milestone and player notices.
- **Regression:** `src/test/league-finals-draw.test.ts` covers this exact second play-off round: Hendrik remains after beating Stiaan, Raymond joins from Pool C, and the round-7 board contains their final.

## 2026-09-22 — Regional tournaments: owner, audience and venues

- Owner is now explicit on every tournament. `tournaments.owner_org_id` is set on
  create (draft and generate paths) from the club/association context and is shown
  as "Organised by" on the first setup step. Backfilled all existing rows; NA Open
  now belongs to the NSA association org.
- `tournament_venues` is the authoritative venue list. `deriveVenueRows()` +
  `syncTournamentVenues()` (src/lib/tournaments/venues.ts, use-tournaments.ts) mirror
  the wizard's host clubs and chosen courts into it, and keep
  `tournaments.participating_club_ids` / `court_ids` in sync as derived columns.
  Hosting fees on a venue row are preserved across syncs.
- Hosting fees: `host_fee_basis` (fixed | per_court_hour | per_day) + `host_fee_qty`
  added to `tournament_venues`; the governance venue tab edits them and the fee split
  uses the computed amount. No GL postings in this phase.
- Court picker groups courts by host club (with per-venue select-all) so a venue only
  ever contributes its own courts. No tournament-only court records are created.
- Tournament court blocks/bookings are now filed under the COURT's club, not the
  organiser's, so a regional fixture at PCC appears in PCC's diary. Cleanup deletes
  match on `external_id` only (they previously filtered by the organiser's club and
  left other venues' blocks behind).
- Association venue candidates = union of the org tree beneath the owner and
  `association_affiliated_clubs`, with an admin warning listing affiliated clubs
  missing from the tree (NSA: 22 in tree vs 46 affiliated).
- Tests: src/test/tournament-venues.test.ts (6). Full suite 1160 passed.

## 2026-09-22 — Association tournament player picker grouped by club

The association tournament Players step showed one long, mixed list of members from affiliated clubs, with some cross-club records labelled visitors. Group the visible list by each player's owning club, provide expandable club rows and per-player or per-club selection, and allow searching by player or club. Do not change eligibility, visitor identity, registration, or the club-owned tournament picker.

## 2026-09-22 — Regional schedule labels showed Unknown

The review schedule looked up fixture names only in the roster visible to the host club, so regional entrants from other clubs displayed as Unknown despite valid fixture member IDs. The review now uses the tournament's already-loaded, name-only entrant directory; the post-rebuild preview uses the same authorised tournament-scoped directory when cross-club member joins are hidden. No fixtures, registration statuses, or bookings were changed.

## 2026-09-22 — Regional tournament clubs did not match Federation tree

NSA's tournament venue picker merged legacy `association_affiliated_clubs` with Federation descendants, showing Durbanville despite no NSA relationship in the Federation tree. The association's club choices now come from active tree descendants only; a warning calls out legacy affiliations needing review. The regional player eligibility resolver now uses the same tree rather than expanding through league participation and affiliation rows. Platform host choices are scoped to the selected owner, and changing owners discards out-of-scope selections. Existing tournament entries and fixtures are untouched; unrelated legacy affiliations remain for review.

## 2026-09-23 — Post-pool playoffs + rotating-doubles match cap

- Round robin divisions split into 2+ pools now offer "Enable playoffs after pool stage"
  with two styles: **Position playoffs** (A1 v B1, A2 v B2 …, the previous behaviour and
  the default for existing tournaments) and **Knockout playoffs** (admin picks qualifiers
  per pool; a cross-pool bracket is snake-seeded so pool rivals meet as late as possible).
  `src/lib/tournament-playoffs.ts` gained `PlayoffMode`, `playoffModeByLeague`,
  `qualifiersPerPoolByLeague`, `knockoutQualifierCount`; both the match builder and the
  placeholder/slot-reservation path handle knockout so reserved slots match built rows.
  `ClubChampsView.poolCountFor` is no longer Swiss-only — round robin pools count too.
- Rotating-partner doubles gained **Maximum matches per player** (individual cap, not a
  round count). `generateRotatingDoublesSchedule(ids, { maxMatchesPerPlayer })` uses the
  greedy builder with an eligibility cap, balancing matches, partners and opponents.
- New columns: `tournaments.league_playoff_modes`, `league_playoff_qualifiers`,
  `rotation_max_matches` (all nullable → legacy behaviour unchanged).
- Fixed an unrelated broken test: `dashboard-device-controls` needed the club-secrets
  hook mocked after the Bluetooth fallback work.

## 2026-09-23 — Format-specific tournament structure (Round Robin vs Swiss)
- Round Robin: no manual rounds field; pool schedule derived from pool size. Multi-pool divisions offer "Enable playoffs after pool stage" with Position or Knockout (qualifiers per pool, cross-pool seeding).
- Swiss: admin-entered "Number of Swiss rounds", first-round pairing (seeded top-half v bottom-half, or random) via `firstRoundSwissPairs` in `src/lib/swiss-pairing.ts`, optional knockout with a chosen qualifier count honoured by `knockoutSizeFor` in `src/lib/tournament-playoffs.ts`.
- New nullable settings on `tournaments` (+ `club_champs` view): `league_playoff_modes`, `league_playoff_qualifiers`, `rotation_max_matches`, `swiss_pairing_modes`, `swiss_knockout_qualifiers`.
- Nelspruit Family Doubles `e85d7bd1-3a70-43ee-aa75-e984bb1518f9`: `league_formats.1` changed `swiss` → `single_round_robin` and the stale `swiss_rounds.1` cleared. Nothing else touched — 36 fixtures, pools `[6,6]`, playoffs flag, registrations, pairs and payments unchanged (0 matches were completed).

## 2026-09-23 — Tournament Players withdrawal and ordering
- In CSIR rotating doubles, unticking an entrant in the editor did not withdraw the registration; saving/reopening could restore that entrant from the paid registration or saved roster. Entered players now have a dedicated **Withdraw** action on the Players tab. It deletes their entries, marks the registration cancelled/withdrawn, and removes their saved roster, seeds, allocations, and manual-draw references; players with existing matches must instead use the Tournament Games withdrawal flow.
- Saving and reopening filters cancelled registrations from audience materialisation and saved draft IDs. The Players list now puts selected tournament participants first, then other available members in alphabetical order. Existing CSIR entries were not changed.

## 2026-09-23 — Smart Tournament Builder BETA (Super Admin only)
- Parallel builder at `/admin/tournaments/smart`; existing planner untouched.
- Draft storage: `smart_tournament_drafts` (RLS `is_platform_admin`). Gate: `src/lib/smart-builder/access.ts`.
- Definition model `src/lib/smart-builder/definition.ts`; deterministic validator `validate.ts`; mapping to existing engine `to-existing.ts` (blocks multi-stage/derived-doubles structures instead of lossy saves).
- AI interpretation: edge function `smart-tournament-interpret` (proposes definitions only; never writes).
- Tests: `src/test/smart-builder.test.ts` (acceptance 1–4).

### 2026-09-24 — Tournament Beta for selected clubs
- New `club_beta_features` (feature `tournament_beta`, Super Admin managed). Riverside enabled. `can_use_tournament_beta()` gates club-owned smart drafts (RLS) and `smart-tournament-interpret`. Club Admin shows a separate "Tournament Beta" tile next to the unchanged Tournaments tile, rendering the same `SmartTournamentBuilderCore` in club scope.
- 2026-09-24 Tournament Beta voice input: mic button in builder chat box -> `smart-tournament-transcribe` (Lovable AI google/gemini-3.5-transcribe, 16kHz WAV in memory, same beta access check). Transcript only fills the text box; Send uses the existing interpret flow.

## 2026-09-24 — AI Help Assistant beta
- Help bubble shows `AiHelpBetaPanel` for clubs with `club_beta_features.feature='ai_actions'` (Riverside) and Super Admin; others unchanged.
- Edge function `ai-help` (ask/confirm/cancel/escalate/rollback): context and permissions resolved server-side; actions = create_booking, cancel_my_booking, replace_tournament_player (admins, unplayed games only), update_my_contact. Preview stored server-side, 15-min one-time confirm; failures/out-of-scope requests open support tickets.
- Log: `ai_assist_interactions`; Super Admin view at `/admin/support` → "AI Activity (beta)" with beta club switch and inverse-operation rollback.
- Voice reuses `VoiceInputButton` + `smart-tournament-transcribe` (`purpose=ai_help` checks `can_use_ai_actions`). Screenshots in `support-attachments/ai-help/<uid>/`.

### 2026-09-24 — Tournament Beta: decisions stayed in chat only; readiness review; compact Schedule
- Cause: the Smart Builder draft only modelled structure, so invitation sending/channels, player selection, fees, WhatsApp group, result messages, scoring and tournament dates had nowhere to be stored.
- Fix: `players`, `comms`, `scheduleDefaults`, `scoring` added to the draft definition; `readiness.ts` deterministic completeness check drives tab dots, the "Next to decide" prompt, the AI's next question and the Review; `to-existing.ts` now reports ready/partial/blocked executability (partial = later stages deferred, kept in draft) and maps comms to existing fields; Create never sends invitations.

### 2026-09-24 — Tournament Beta native dropdown options invisible
- Cause: builder selects had white text on translucent dark surfaces, but browser-native option menus opened with a light background while inheriting white text.
- Fix: scope an explicit semantic popover background and foreground to the builder's native option menus, including Players, Design, Schedule, Invitations, Review and Super Admin beta-club selector. No tournament settings or data changed.

### 2026-09-24 — Tournament Beta Schedule clipping and Bells scoring asked for PAR
- Cause: Schedule squeezed eight defaults and seven stage columns into the half-width workspace; the scoring readiness check only understood PAR/best-of, ignoring timed Bells matches. Stage-only dates did not satisfy tournament-date readiness, and date-only inputs could receive full datetimes.
- Fix: defaults now use wide two-column fields and the stage overview uses a compact labelled, wrapping three-column summary; date inputs display date portions while retaining any saved time. Saved Bells drafts are recognized as timed-points scoring without requiring PAR/best-of; admins may explicitly switch to standard games. The existing tournament mapping uses timed-points mode, stage match duration, and calendar dates derived from stage dates when no defaults exist. No existing draft or live tournament row was edited; legacy setup remains unchanged. Focused builder tests and typecheck passed; signed-in Super Admin preview showed a legible Schedule without browser errors, but the Riverside Bells draft itself was not accessible to that account.

### 2026-09-24 — AI Help Assistant fell back to generic FAQ answers
- Root cause: `ai-help` had no read tools (model only saw a prompt telling it to "give step-by-step guidance"), classified player replacement as a forbidden "draw" change, and scoped tournament/member lookups to the club id only (Super Admin in Riverside couldn't resolve Riverside tournaments/regional entrants).
- Fix: tool-calling loop on the Responses API (`openai/gpt-6-astra`) with server-side permission-aware read tools (`supabase/functions/ai-help/tools.ts`: get_my_context, my_upcoming_matches, find_tournaments, tournament_details, tournament_fixtures, my_bookings, club_ladder) plus `propose_action` (preview only, confirm required) and categorised `escalate`. Super Admin authority resolved separately from viewed club. Replacement resolves entrants from the tournament itself and host/participating clubs; swaps of two existing entrants escalate as "not yet enabled", not a permission problem.

## 2026-09-24 — AI Help: controlled "Correct Match Result" action
- New RPC `ai_correct_champ_result(match_id, games jsonb, preview, reason)`: server-side permission (platform admin / club champs permission / can_manage_tournament), validates games vs best_of/points_per_game/win-by-2/decided-match rules, computes blockers, writes `audit_events` (old+new score, derived effects, notifications_sent=false).
- Executes only when winner unchanged, standard scoring, not bye/forfeit, and no playoffs already drawn from the pool. Same-winner updates do not re-fire ranking/ladder/result-notification triggers.
- `ai-help/actions.ts` `correct_match_result`: preview → confirm (stale-preview check on updated_at) → verify → audit; Super Admin inverse restores original games.
- Tested: Bells Beta test Willem Pretorius vs Albert Ndlovu 3–1 → 3–2 executed; double-confirm rejected; winner-changing request escalated with ticket.

### 2026-09-24 — Play-off games counted as pool games
Pool standings (ClubChampsView getGroupStandings) included playoff_* rows sharing group_number, giving a phantom 7th game and making auto re-seeding reshuffle play-offs after every play-off result. Fix: standings count only stage=group; auto re-seed stops once pools are complete and any play-off has started. Repaired Nelspruit Family Doubles 11th/12th row.

### 2026-09-24 — Family Doubles (Nelspruit) fixed-pair playoff lock
- Cause: `generatePlayoffs` (auto + "Regenerate") rewrote player/partner IDs on any non-completed playoff row, including in-progress rows and "scheduled" rows already carrying game scores; partners came from provisional standings rows rather than registered entries. Rotation-doubles code is not involved.
- Fix: `isPlayoffRowLocked` freezes started/scored rows (never re-seeded or deleted); `enforceRegisteredPairs` forces every doubles side to its registered partner and refuses to invent one. Tests: `src/lib/tournament-playoffs.fixed-pairs.test.ts`.
- Live data verified: all 30 pool + 6 placement rows use the 12 registered pairs; slots 1001–1006 = Pool 1 #N vs Pool 2 #N. No data changed.
- Follow-up (lifecycle): all six playoff rows were created at 08:40 on match day (after the first pool results), so the timed placeholders reserved when the schedule was generated (under the earlier Swiss format) were deleted by the first automatic re-seed and replaced with untimed rows. Restoring times later only edited the schedule. Fixes: unmatched reserved slots are now re-used (keep date/time/court) instead of deleted; timed slots are never deleted; `shouldAutoFillPlayoffs` fills slots only once every pool game is complete and never re-seeds filled slots; manual rebuild asks for confirmation and skips started/scored games.

### 2026-09-24 — AI Help "Failed to send a request to the Edge Function" (Nelspruit, Rachel Gates)
- Both attempts (11:55 / 11:56 UTC) reached `ai-help`, escalated correctly and each created a ticket; no data changed. The device never received the reply (FunctionsFetchError), most likely a long multi-step run on mobile (the loop kept calling the model after escalating). Language/apostrophes and auth/CORS were not factors. Edge request timing logs were unavailable, so duration is unconfirmed.
- Fix: loop stops immediately after escalation; no new AI step starts after 40 s (in-flight calls are never aborted); `clientRequestId` makes retries return the stored reply (no duplicate tickets/actions); structured timing log `ask_done`. Panel keeps the failed message with a Retry button (same request id) and a friendly network message. Helpers `supabase/functions/ai-help/flow.ts`; tests `src/test/ai-help-reliability.test.ts`.
- Live check: Afrikaans voice-flagged question answered in 11.6 s; identical retry replayed in 0.8 s with no second record.

## 2026-09-24 — AI Assistant live-tournament self-heal
- Rachel's Nelspruit report was only escalated. Added `supabase/functions/_shared/tournament-integrity.ts` (re-exported at `src/lib/tournaments/integrity.ts`): checks duplicate/missing playoff qualifiers, broken fixed pairs, wrong position slots, premature/empty slots, repeat pool games, from pool-only standings; labels changes deterministic vs judgement.
- `ai-help` tool `diagnose_and_repair_tournament` (repair.ts) auto-applies deterministic changes via service-role RPC `ai_apply_champ_repair` (row locks, refuses started/scored or stale rows, duplicate invariant), re-verifies, rolls back via `ai_rollback_champ_repair` on failure, audits (`ai_assist_interactions` action `repair_tournament_state` + `audit_events`), notifies club admins. Super Admin can undo from AI Activity.
- Verified on a temporary clone with Rachel's Afrikaans voice text: fixed + re-verified in ~11s, undo worked; clone removed.

## 2026-09-24 — Final overall standings after placement play-offs
- Pools + placement play-offs kept showing Pool A/B after the event. Added `src/lib/tournaments/final-standings.ts` (`computeFinalPlacements`): when every `playoff_final` slot (bracket_position league*1000+n) is completed, all teams placed once, positions come from outcomes (winner 2n-1, loser 2n); otherwise null. `ClubChampsView` shows a Final Standings table first and collapses pool tables beneath. Tests: `final-standings.test.ts`. Nelspruit Family Doubles verified 1–12.

## 2026-09-24 — Stale "Generate knockout/play-offs" on finished tournaments
- Cause: `round-control.ts` only treated stage `ko` as a post-pool stage, so placement play-offs (`playoff_*`) were invisible → "Pool stage complete, Generate knockout round"; header "Regenerate play-offs" was shown whenever `enable_playoffs` was on, and tournament `status` stayed `planning`.
- Fix: `isPostPoolStage` (ko + playoff_*); `tournamentNextAction` derives Play-offs in progress / Tournament complete from persisted play-off rows; header generate button + auto-fill hidden and generator refuses once every play-off row is completed or status is completed. DB: unique index `club_champs_matches_one_placement_row` (one final/3rd row per champ/group/slot) and trigger `guard_completed_playoff_rows` (completed play-off rows cannot be deleted/re-paired/moved except by service role). Play-off card headings name placement ("1st/2nd place play-off") with Completed badge. Backfilled Family Doubles status → completed (all rows played). Tests in `tournament-next-action.test.ts`.

## 2026-09-25 — Structured (Beta) tournaments: atomic commit, rebuild/withdraw, editor
- `structured_commit(p_tid, p_ops)` RPC: structure + rounds + games saved in ONE transaction (security invoker, can_manage_tournament, structured-only, refuses deleting played/started games).
- Client `bufferedDb`/`atomically` collect engine writes, then commit once; any integrity failure sends nothing.
- `rebuildStructured` (unplayed divisions regenerate from current entries; played divisions keep results, drop only withdrawn players' unplayed games) and `withdrawStructured` wired into StructuredEnginePanel.
- StructuredEditorDialog reloads builder_spec; label/date edits only, structural edits blocked/previewed.
- Builder Players tab: division names, league use, pool names, apply-structure-to-other-divisions.
- Disposable full simulation test in `src/test/structured-generation.test.ts`.
- 2026-09-25: Structured engine adds double RR (`legs: 2`), Swiss first-round + `nextSwissRound` with tie-breaks (buchholz, sonneborn_berger, seed), knockout `thirdPlace` match (stage_label "3rd place", excluded from re-entry). Fixed real-DB blockers: rounds used round_type 'round_robin'/status 'generated' which the CHECK constraints rejected — constraint widened (round_robin, swiss), status now 'active'.

### 2026-09-24 — Beta builder: Custom / mixed stage builder + one-field play-off fix
- Custom / mixed now opens an ordered stage builder (Diamond League template: singles RR → pairs formed → doubles RR, cumulative). Tests: `src/test/stage-builder.test.ts`.
- Fixed: structured play-offs after a one-field round robin or Swiss found no qualifiers (`poolStandings` ignored rows without a pool number). Swiss play-off preview now waits for every Swiss round.

### Tournament Beta Design: owner/scope, audience and venues first-class (2026-09-24)
- Problem: "Next to decide: event scope… Go there" pointed at a control that didn't exist on screen.
- Fix: EventSetupSection at the top of Design — Event level (club/regional/national) + owning organisation (permitted orgs only; club context preselects own club), Who may enter (audience per level), expected entries, seeding data, Venue(s) (single/multiple/none, candidates from the owner's club hierarchy). Readiness points to these controls. Schedule venue pickers only offer the event venue set; out-of-set venues block creation (readiness + specFromDefinition). Review uses Design's owner/venue. Structured editor shows owner/audience/venues from the saved spec.

### Tournament Beta: one canonical date window (2026-09-24)
- Problem: Start/End dates editable in Schedule "Tournament defaults", QuickSetup and the stage builder — several apparent sources of truth.
- Fix: `tournaments.start_date/end_date` (builder: `scheduleDefaults.startDate/endDate`) is the only tournament range, edited once in Design → Tournament dates; Schedule shows it read-only. Stages "Use tournament dates" (NULL start/end) or set an explicit "Stage window"; rounds keep fixed date / play-by. `src/lib/tournaments/date-window.ts` validates tournament ⊇ stage ⊇ round ⊇ fixture, resolves inheritance at generation (loadEntrants) without persisting copies (rawSchedule), and reports shrink impact. Structured editor edits the row dates + stage windows with impact and blocks saves that would push anything outside. Tests: `src/test/date-window.test.ts`.

## 2026-09-24 — Tournament Beta venues/courts hierarchy-driven
- Design venue picker now uses real org hierarchy (club → own club; regional → clubs under association, no all-clubs fallback; national → Region → Club) and real `courts` records via `tournament_host_courts` RPC (security definer, returns name/location only, gated by `can_host_at_club`).
- `courts.active` added (default true); inactive courts never offered.
- Selection persists in existing `tournament_venues.court_ids` (no parallel directory); Schedule free-text court counts replaced by the Design court pool; rotation hidden with <2 venues.
- DB triggers (structured tournaments only): match court must be in tournament_venues.court_ids; removing a court with games is blocked (played → history kept; unplayed → move first).
- Owner/level change marks ineligible venues `event.venuesStale` instead of silently keeping/dropping.
- Tests: src/test/venue-courts.test.ts.

## 2026-09-24 — Beta builder drafts lost on leave/return (fixed)
- Root cause: (1) the Workspace seeded the editor from the React Query cache once per draft id and never re-read the server copy, so returning in the same session showed an old copy and the next edit autosaved it over newer work; (2) the 1.2s debounce timer was cancelled on unmount/close, dropping the last edits; (3) failures were a toast only, with no status.
- Fix: `DraftAutosaver` (src/lib/smart-builder/draft-autosave.ts) — debounced, serialised, whole-draft writes to `smart_tournament_drafts`; `revision` column for stale-tab detection; `last_tab` restored; fresh server read on open (gcTime 0); flush on unmount/hidden; keepalive PATCH on pagehide/beforeunload; Saving/Saved/Save failed—Retry/Changed elsewhere indicator.
- Tests: src/test/draft-autosave.test.ts; browser check: type → navigate away mid-save → return → reload, values restored.

### 2026-09-25 — Tournament Beta stage builder: independent stages
- Problem: new stages silently copied the previous stage's match type/schedule and auto-chose a transition; doubles→singles was blocked; pairs could only be formed with "everyone continues"; transitions were reset to defaults when a later stage changed.
- Fix: `stage-builder.ts` addStage starts neutral (division entry type, round robin, one field, unscheduled, no transition); owner-only `copyPreviousStage`; `reconcile` drops only invalid parts of THIS stage's transition. Progression now separates who continues (`all_continue` / `top_n` + `top` / `qualifiers`) from `pairing` (fold/positions/manual for singles→doubles, `split` for doubles→singles) and `standings`. Contract + `nextStageFixtures` enforce/execute this in the same engine. Legacy `form_pairs` still accepted. Diamond template pairs 1+2, 3+4.
- Tests: 12 new cases in `src/test/stage-builder.test.ts`.

### 2026-09-25 — Tournament Beta: divisions first, stages owned per division
- `src/lib/smart-builder/division-structure.ts`: addDivision (blank or independent copy), cloneStructure (fresh section/stage IDs, remapped fromStageId; pools stay index-based so persisted pool IDs are per division), applyPlan/applyStructure (blank filled, configured only with explicit replace, divisions with games never touched, replace-not-append so repeats never duplicate), ownershipIssues (shared stage IDs / cross-division references block validation).
- Stage builder: "How many divisions?" step, division chips with stage counts, "Editing structure for: X", "Add stage to X", Add division (blank / copy from), Apply structure preview. Old regex-based copy removed from StageBuilder and BuilderTabs.
- Tests: `src/test/division-structure.test.ts`.

### 2026-09-25 — Tournament Beta: per-pool qualification
- Progression `top_n` + `perPool` = top N from EACH pool. Slots = source stage id + pool index + position (`perPoolSlots`), resolved by `perPoolQualifiers` from each pool's own table using the shared `rankPoolTally` (also used by play-off `poolStandings`; tie on the qualifying line blocks). FixtureRow now carries `pool`. Unfinished pools, N > pool size, duplicate slots and cross-division rows are refused. Pair formation still required separately for singles→doubles.
- Builder: "Top N from each pool" option (same-type knockout uses the cross-pool mapping editor + preview); slot list shown; knockout-last enforced on Add stage.
- Tests: `src/test/per-pool-qualification.test.ts`.

## 2026-09-25 — Tournament Beta: multi-stage creation + schedule maths
- Cause: Review judged executability via the legacy mapping (to-existing), so any Stage 2 that wasn't a same-discipline knockout was "deferred" even though the structured engine already persists every stage and starts later stages (startNextStructuredStage). Structured designs now report ready; all stages persist at Create; later stages show "Pending <previous> completion" on the tournament page.
- Create is now validate → schedule maths → persist all structure in one commit; any failure deletes the tournament shell. Multi-stage designs never silently fall back to the legacy engine.
- New src/lib/smart-builder/schedule-maths.ts (required rounds per stage, fixed round counts/order, play-by ordering, cross-stage dependency, knockout feeder order, after-end, court capacity when courts+match+session minutes known). Review shows "Schedule maths"; Schedule tab asks one date per required round. Tests: src/test/multi-stage-schedule.test.ts.

### 2026-09-25 — Tournament Beta: derived round counts drive round dates
- Round counts are derived (RR from largest pool incl. bye/return legs; knockout from draw size; later stages from what the previous stage sends; Swiss = explicit rounds).
- `roundDatePlan`/`syncDerivedRoundDates` (schedule-maths.ts) generate one date per required round from the stage/tournament start + weekday; later stages start after the previous stage's last round. Per-round overrides live in `schedule.roundDateOverrides`; shrinking a stage drops stale rounds/overrides. Synced on every builder edit and autosaved.
- `insertFixtures` now sets `club_champs_matches.scheduled_date` from the fixed-stage round date (times/courts still unset). Tests: src/test/derived-rounds.test.ts.
- Audit step 1 (2026-09-25): per-game schedule dialog is available on Beta games; result messages ran through `classify_champ_result_stage`, which reads `stage_label` — Beta knockout games had none, so every KO (incl. the final) got "early knockout" wording and member pages showed no round name. `insertFixtures` now labels KO rounds Quarter-final/Semi-final/Final. Legacy "reschedule unassigned" now keeps a Beta game's round date (fills time/court only); it still takes courts only from existing games and uses legacy play days (bulk scheduling for Beta = step 4). No per-game tournament reminders exist on the platform (not Beta-specific).
- Audit step 2 (2026-09-25): new Beta control page `/beta-tournament/:champId` (BetaTournamentOperate.tsx) — Overview (division → stage status/pools), Games (stage → round with date/label, Schedule + Mark), Run stages (StructuredEnginePanel), Entries (read-only list). Create now lands here (club + super admin); the legacy ClubChampsView shows a link to it for structured tournaments.

## 2026-09-25 — AI assistant escalated "remove member from members list"
- Cause: `ai-help` action catalogue had no membership action, so the model had to escalate as `[unsupported_action]` (Susan, Nelspruit: Alicia Rolfe 10:40, Robert 10:41, Michelle de Villiers 10:42). Not a permission problem.
- Fix: new `remove_club_member` action (`supabase/functions/ai-help/member-removal.ts`) reusing the Members roster "Resigned" status update under caller RLS (`is_club_admin`). Never deletes club_members/people rows. Preview → Confirm → guarded update (`neq status resigned`) → audit (`membership_ended`) → reversible by Super Admin.
- Coded refusals (permission_denied, ambiguous_member, member_not_found, already_removed, missing_required_data) are stored as `denied`/`needs_clarification` rows with `[code]` reason and no ticket; confirm failures escalate as `[backend_failure]`. AI Activity shows reason badges and new filters.
- 10:43 Willem "yes sherique…": separate — assistant correctly found the final (Sherique & Vian won) but the "Overall winners" display is not an assistant action, so `[unsupported_action]`. It's the Family Doubles winners-display bug, not routing.
- Tests: `src/test/ai-member-removal.test.ts`.

### 2026-09-25 — AI Assistant: requester "My requests" history + bug lifecycle labels
- Requesters had no way to reopen their own AI requests (chat was in-memory only). Added `conversation_id`, `assistant_answer`, `retry_of` on `ai_assist_interactions` (trigger fills conversation from context), `my_ai_bug_statuses` RPC (status only, own linked bugs), "My requests" list in the Assistant with real lifecycle statuses, reopen/confirm pending previews, deliberate retry of old escalations (never auto-executed; `confirmGate` in ai-help/flow.ts). AI Activity shows "Bug reported · <bug status>". Tests: `src/test/ai-my-requests.test.ts`.

## 2026-09-25 — Door geofence & unlock durations per door
- Open Door button no longer hidden/disabled outside the geofence; access permissions (can_open_club_door / can_operate_device) remain the gate.
- Per-door settings: geofence radius, auto-unlock on entry, manual unlock duration (seconds, = relay on/auto-off), separate geofence auto-unlock duration (default 12 s). Main door: clubs.door_auto_unlock_seconds; registry access devices: club_devices.geofence_* / auto_unlock_*.
- Auto-unlock fires once on entry; re-arms only after a sustained exit beyond radius + max(25 m, 30%) for 45 s (src/lib/geofence-auto-unlock.ts, tests in src/test/geofence-auto-unlock.test.ts). Edge functions accept trigger="geofence" and apply the auto duration server-side.

- 2026-09-25: Door pulse invert — added output_inverted (club_devices) and shelly_door_inverted (club_secrets); inverted pulse switches the relay OFF for the unlock duration then back ON (v2 toggle_after / Gen1 timer, both directions). Nelspruit main door set inverted. Invert switch added to the IoT door editor. Deployed shelly-door-trigger + device-control.

## 2026-09-25 — Diamond League (Uitsig) template in Beta Builder
- New `src/lib/smart-builder/diamond-league.ts`: admission (cap + first-confirmed + waitlist), snake across all pools, cross-pool league rotation (A v B, A v C, A v D), position pairs with explicit unresolved pair source, crossover semis (A/B confirmed, C/D + Div 2 mirrored), home courts, evening feasibility, template strip.
- Definition gains `cross_pool_league`, `poolNames`, `poolGroups`, `admission`, `poolSeeding`, `templateMeta`, `pairSource` (additive).
- `tournament_templates` table (club-admin RLS). Live creation of cross_pool_league stages is still blocked with a clear message.
- Open organiser items: points formula/tie-break, pair source, final mechanics, play-off weighting, Wed 4/5 allocation.

- 2026-09-25: Diamond League template corrected to weekly pool-v-pool ties (6 singles @20 + 3 doubles @30, one court, 210 min) via Stage.tieFormat; semis/finals rules pending organiser spreadsheet; removed singles→rerank→doubles dependency.

- 2026-09-25: Nelspruit main-door geofence never persisted. Cause: Access Control tab re-synced its geofence state from the club on every club refetch (window focus after the location-permission prompt), wiping the pinned location + enabled switch before Save; and its method/device Save also rewrote geofence columns from that stale state with no error check. Fix: resync only when not editing; geofence saved only by the Location card, atomically verified; IoT main-door save also verifies enabled+lat/lng persisted.

### 2026-09-25 — Smart Builder accepted engine-unsupported stages until Review; Bells cap used as schedule duration
- Cause: the Diamond League template (and the "Pool-v-pool league" format) creates `cross_pool_league` stages; only `specFromDefinition`/`to-existing` knew the engine can't generate them, so the Riverside "2026 DL" draft looked valid until Review. Separately, `scoringMinutes` (Bells cap) fed `stageMatch`, `sessions` and `schedule-maths`, and the stage editor overwrote tie game minutes with the cap.
- Fix: `src/lib/smart-builder/engine-support.ts` is the single engine-capability list used by validation (`engine_unsupported` error), the stage editor, `to-existing` and `specFromDefinition`. Exactly-representable pool-v-pool singles (opening stage, position pairing, pools not reused) are translated to banded position-group round robins; anything else is blocked at design time. Duration now comes only from game/match minutes. Review shows four checks (Structure valid, Engine supported, Schedule feasible, Scoring complete); "partial" no longer allows Create.

### 2026-09-25 — Explicit matchup mapping between stages (Riverside "2026 DL" engine blocker)
- Added engine stage kind `mapped` (DB `tournament_stages_kind_check` widened) driven by `StageMapping`: qualification source (entry-seeded pools or an earlier pools stage's finishing positions), units (1 slot singles / 2 slots doubles, any pools), matchups per round. Seed-pool mapped stages are generated with the tournament; standings-sourced ones start via startNextStructuredStage and block on tied positions.
- Builder: "Who plays whom" editor per pool-v-pool stage ("R1: A1+B1 v A3+B3"); Review lists source, pairs, every matchup per round and the next stage.
- Limitation: a knockout taking qualifiers from a pool-v-pool stage is blocked (pool totals across ties not computed yet).

## 2026-09-25 — Beta tournaments: automatic stage progression + Define-later set-up
- New `src/lib/tournaments/progression.ts` (lifecycle, autoProgress, setupDeferredStage, decidePositionOrder); `StageProgressPanel` on the run page.
- `sourcePositions` ranks finishing positions per source pool (incl. entry-seeded pool-v-pool stages); level wins at a used position block unless the admin recorded an order.
- `structured_commit` gained append-only `set_spec`; trigger `guard_structured_stage_round_once` prevents duplicate stage rounds.
- Limitation: auto-progression runs when a tournament manager has the run page open (engine is client-side), not from a member phone result save alone.

### 2026-09-25 — Smart Builder: one canonical division/pool structure; Define-later rule
- Cause 1: Diamond panel kept its own copies of divisions/pools/players and "Apply" rebuilt every division from scratch (losing per-division settings); the stage builder separately asked "One/Multiple divisions" via a local flag. Now both read/write `def.divisions` only; `resizeDiamond` changes shape in place, keeps ids/settings, copies the last division for additions, confirms removals.
- Cause 2: "Division 2 has no stages" = all four Division 2 stages had `defineLater: true`, so the defined-only view was empty. The tick box allowed deferring the first stage and same-session stages, and division copies duplicated the flag. Rule now in `deferred.ts` (`cannotDefer`/`setDefineLater`/`normalizeDeferral`/`deferralIssues`): first stage never deferred, same-session stages never deferred, deferral is a suffix; repaired on load.
- Cause 3: Diamond template never marked Semis/Finals as Define later and their questions were structural, so they blocked Create on rounds/Bells. Template now defers them; semi/final questions are operational; points question still blocks.
- `cloneStructure` now also remaps `sameSessionAs` and `mapping.sourceStageId` (copies pointed back at the source division).

## 2026-09-26 — Ladder refine: Masters league downweighted
- SportyHQ (Western Province) has three unlabeled competitions; numbered-team divisions (DBV 1, FH 2) are Masters, lettered (DBV A) are open Men/Ladies.
- `isMastersDivision` in `src/hooks/use-league-strength.ts` detects numbered-team divisions; Masters rubbers get `levelOffset = MASTERS_LEVEL_OFFSET (2)` so a Masters 1st League counts ~2 open-league levels weaker in `computeLeagueStrength` (`src/lib/ladder/league-strength.ts`).
- Tests added in `src/test/ladder-league-strength.test.ts` (14 passing).

- 2026-09-26: Visitor fees were recorded but never posted to the GL, so they did not show on My Account statements. Journal trigger now posts "Visitor fee –" / "Visitor court fee –" system charges (debtors / visitor_income); missing ones backfilled.

### 2026-09-26 — Duplicate registrations (forgotten email)
- Before: `check_member_duplicate_hint` only searched the current club's roster, only on "New member" sign-up, showed partial emails before any verification, and let people click past it. Visitors, visitor + Google, the league-number sign-up, /league and the join-a-club screen had no check, and the national `people` records were never searched.
- Fix: the `account-recovery` backend function plus a `person_match_candidates` search that only the backend can run. It searches every club and national player record. Same name + same cell (last 9 digits) means recover the existing account. Same cell only is a strong match, but families may continue. Same name only is a soft notice and never blocks. Emails are shown only after an SMS code to the number on file (hashed, 10 min, 5 attempts, rate-limited). Nothing is merged automatically. All paths use `useDuplicateGuard`. Tests: src/test/duplicate-person.test.ts.

### 2026-09-26 — AI assistant support hand-off failed ("bugLogged is not defined")
- Cause: `bugLogged` was used in the ai-help tool loop but never declared, so every `escalate` call threw and no support ticket was created (Susan's merge requests).
- Fix: declared `let bugLogged = false` per request; ai-help redeployed. Susan's 5 Nelspruit merges (Bethilde, Renier, Schalk, Simone, Umar) were done manually and her requests marked completed.

## 2026-09-26 — AI Maintenance Manager Phase 1
- Additive migration: `maintenance_cases`, `maintenance_case_requesters`, `maintenance_analyses`, `maintenance_actions`, `maintenance_events`; `ai_assist_interactions.triage` column; state machine (`maintenance_case_can_transition` + BEFORE UPDATE guard), event-log trigger, authoritative bug-status sync (`sync_maintenance_bug_status`), case/requester creation triggers, backfill of open bugs, `my_ai_maintenance_statuses(uuid[])` RPC.
- `supabase/functions/_shared/maintenance-policy.ts` (canonical) mirrored in `src/lib/ai/maintenance-policy.ts`: sensitive-area detection, risk clamp, approval policy, PII redaction, transition table, case→bug status map. Both must stay in sync.
- New edge function `maintenance-queue` (Phase 1: Super Admin sessions only): submit_analysis, set_status, propose_action, record_result, decide_action, ask_member. Risk/approval enforced server-side; automated actors can never approve/release/complete; audit mirrored to `maintenance_events` + `audit_events`.
- `ai-help` now records `triage` (question / safe_action / bug / feature_request / needs_info / support) on interaction outcomes; triggers auto-create/link maintenance cases and requesters (fingerprint reuse preserved — one case per bug).
- `src/components/ai/MaintenancePanel.tsx`: "Needs you" default view + New/Needs info/In progress/Released/Closed views wired into `/admin/support`.
- `requestStatus` accepts case status so My Requests shows "Needs more detail from you" without technical wording; `useMyAiRequests` fetches case statuses via the requester-scoped RPC.
- Standing constraints held: no production publish; Super Admin never a bottleneck for requester-authority work; member content treated as untrusted data.

## 2026-09-26 — AI Maintenance Manager Phase 2 Stage 0
- Added inert direct-agent infrastructure: `maintenance_agent_settings` (dispatch off, `stage_lock` true — DB refuses enabling), `maintenance_dispatches` outbox (one active per case, lease via `maintenance_claim_dispatch`), `maintenance_agent_nonces`, `maintenance_cases.agent_stage`, action `execution_class`/correlation/sent hash/commit/tests.
- Rule: investigate/prepare/test automatic at any risk; execute_live/release always need a named approver (DB trigger + policy).
- New signed (HMAC, 5-min skew, single-use nonce) `maintenance-agent` function; refuses all but `ping` while off. Kill switch in Maintenance UI.
- Member balance on Members list now shows single outstanding balance and opens the Member Statement (fixed a replace that silently failed).

### 2026-09-26 — AI Maintenance: low-risk auto-release lane
- Corrected Phase 2 so clear low-risk bugs can be fixed AND released automatically (no Super Admin approval) when objective gates pass: `evaluateAutoRelease` in `maintenance-policy.ts` (≤5 code files, ≤200 lines, allowlisted `src/` paths only, no protected paths/areas, regression test, tests/build/typecheck/lint clean, commit ref, post-deploy check, reproduced, within requester scope, daily cap).
- New agent ops `qualify_release`, `deploy_result`, `verify`; DB guard `maintenance_auto_release_ok` lets automated actors release/complete only with a qualified, deployed, verified low-risk release; circuit breaker trigger disables auto-release after 2 failed auto-releases in 7 days.
- Third switch `auto_release_enabled` (default OFF, blocked by stage lock). UI: "Auto-fixed" view + qualification/tests/deploy/verification/rollback details.

## 2026-09-26 — Nelspruit opening balances posted
- Source: old-system "Customer Balances – Days Outstanding" report dated 26/09/2026.
- Treatment: Dr Debtors (per member) / Cr Opening Balance Equity (not membership income — the income was earned in the old books). Positive balances are unpaid `club_member_fee_payments` rows with `fee_type='opening_balance'` (payable in-app); credits are direct journal pairs "Opening credit balance".
- 42 members posted (R50,051.06 net). Excluded non-members: Tuck Shop Sales, Squash Rush, Du Toit-Smuts Prokureurs. 17 report names had no SquashHub member and were not posted.
- Removed duplicates: Lucas Esterhuizen R150 overpayment (already in old books), Rachel Gates doubled R60 Yoco ledger entry. Kept Family Doubles payments, Vian Crafford R260 credit, visitor fee.
- Note: `fee_type='opening_balance'` is also used at St John's — always scope updates by club.

## 2026-09-27 — Member statement clipped on portrait phones
- Cause: seven fixed-width transaction columns exceeded the statement dialog width, hiding debit and credit on portrait screens.
- Fix: portrait transactions now show date, description, account, labelled debit and credit side by side, and running balance below; the existing desktop ledger remains unchanged. The dialog and member picker fit small screens without horizontal scrolling.

## 2026-09-27 — Mobile screenshot paste did not attach in AI Assistance
- Cause: the composer inspected only `clipboardData.files`; Samsung Internet and mobile keyboards can expose pasted images only through `clipboardData.items`, or through the browser Clipboard API when the paste payload is empty.
- Fix: image paste now reads files and file-items, deduplicates images, and uses a gesture-bound Clipboard API fallback. Ordinary text paste is unchanged. If the browser withholds image data, the assistant tells the member to use the existing photo picker.
- Guard: attachment uploads retain the existing three-image and 8 MB-per-image limits.

## 2026-09-27 — Tournament entry fees billed to host club
- Problem: cross-club entrants (Louna Stevens, White River → Nelspruit Family Doubles) were billed at their home club; her EFT top-ups (2 × R150, 15 s apart) landed in White River pending payments.
- Fix: `ensure_tournament_entry_fee` now bills via `resolve_host_billing_member` (finds/creates a billing-exempt visitor row at the host club, no user link, no new person). Association hosts keep home billing. `member_credit_transactions.fee_payment_id` links a payment to its fee; Finance confirm settles the linked fee first. Trigger blocks identical pending requests within 60 s.
- Data: Louna's fee moved to Nelspruit visitor row (journal reversed at WR, re-posted at Nelspruit); one pending EFT moved to Nelspruit linked to the fee; duplicate cancelled. Other historic cross-club fees untouched.

### 2026-09-27 — Tournament registration vs fee status split
- Problem: CSIR "6th vs 7th League Bells" draw had 12 players but entry list showed 10 confirmed; Juano Eksteen and Marius du Plessis were placed in the draw by the organiser while their registration stayed "invited". Free-tournament acceptances were stored as status "paid".
- Fix: `club_champs_registrations.registration_status` (invited/registered/declined), `fee_status` (not_required/due/pending/paid/waived), `registration_source` (player/organiser), derived by trigger `derive_champ_registration_statuses` from legacy fields on every write; `club_champs_entries` insert marks the registration as organiser-registered. Fee-required tournaments only register once paid/waived. `entrant-status.ts` prefers the new fields. Legacy `status` kept for existing functions. No payments/journals changed.

### 2026-09-27 — Show regional league averages when allocating handicap players
- For singles tournaments using league-average handicap, Allocate players shows each entrant's most-played regional league, average position, games, category and exact cross-league index used for handicap. The same loader supplies fixture scores and display; missing results are marked explicitly. Cross-club players use their own member ID and regional affiliation, not the host club ladder.

### 2026-09-27 — Regional league average controls allocation order
- For singles events with league-average handicap, Allocate players orders entrants within each tournament league by the same regional index used for handicaps (6th League averages ahead of 7th League averages). Missing results sort last without a club-ladder fallback; manual drags and later-stage progression remain authoritative. The inapplicable pool-allocation selector and club-ladder badges are hidden in this mode, leaving other tournament modes unchanged.

## 2026-09-27 — "Join Your Club" search hid NSA-seeded clubs
- Symptom: searching "Uitsig" on squashhub.co.za/register-club returned "No clubs matched".
- Cause: `search_registerable_clubs` filtered `tenant_type = 'club'` only; 15 NSA-imported clubs (Uitsig, CSIR, Irene, Centurion, etc.) are `nsa_seeded` and were excluded.
- Fix: function now includes `nsa_seeded` in the tenant_type filter. Verified: `search_registerable_clubs('uitsig')` returns Uitsig Squash Club. Live immediately (DB function, no publish needed).

## 2026-09-27 — Bar POS: Bar/Shop divisions and custom categories
- Request: split the bar into two divisions (Bar = drinks/snacks, Shop = rackets/clothing/other) and let clubs create their own item categories.
- DB: `bar_items.division TEXT NOT NULL DEFAULT 'bar'`; new `club_bar_categories` (club_id, division, label, value, sort_order; UNIQUE(club_id, value)) with RLS (members read, club admins manage).
- Code: new `src/lib/bar-categories.ts` (built-in categories per division, shared emoji map, `useBarCategories`). `HonestyBarTab` item form has a Division select; category options follow the division; "Categories" dialog adds/removes custom categories (removal blocked while items use them). `HonestyBar` POS has a Bar/Shop toggle; items filter by division; legacy categories group under "Other items". `CounterSaleDialog` and `QuickVisitorSaleDialog` use the shared emoji map.
- Verified in preview on CSIR (bar capability temporarily enabled, then reverted): POS toggle switches Bar/Shop; category dialog added and deleted "Cool drinks"; Add-item form switches category list to Rackets/Clothing/Footwear/Accessories when Division = Shop. tsgo + build clean. Preview-only; not published.

## 2026-09-27 — Bar screen showed two “Shop” choices
- The top tab was the whole buying view while the lower switch selected shop products, so both could say “Shop” and an empty catalogue looked broken. Renamed the top tab “Buy”, labelled the product divisions “Bar items” and “Shop items”, and added an explicit empty message for each division. No sales or category logic changed.

## 2026-09-27 — Visitor QR menu did not separate Bar and Shop
- Venue QR codes opened the public scan-to-pay menu as one mixed item list, because its public resolver did not return each item's division. The signed-in POS selector did not apply to that route.
- The public resolver now includes division for both venue and product codes. The venue menu has Bar items / Shop items tabs; legacy products default to Bar, the basket remains intact across tab switches, and individual-product stickers remain a single-product view. Empty divisions show a clear message. No charging flow changed.

## 2026-09-27 — Doubles original-pair bonus, reserves, sub rules
- Doubles OPB is per original pair (both players together), pairs resolved on the fixture date via `league_team_pairs.effective_from/effective_to`, frozen into `permanentSquadSnapshot.{home,away}.pairs` on first save (`src/lib/leagues/original-pair-bonus.ts`).
- Admin pair edits close the old row and open a new one dated today → new player is original from then on; past fixtures keep the old pair. Pair removal is a soft close.
- `league_rules.reserve_mode` (per_team|per_league), `sub_from_reserves`, `sub_from_bye_team`, `sub_rank_rule` (any|same|same_or_lower); league reserve team in `league_reserve_players` with rank. Scorecard shows "Sub not allowed" and blocks final submit (`src/lib/leagues/doubles-sub-eligibility.ts`).

## 2026-09-27 — Configurable bar/shop inventory (Riverside pilot)
- Added club-configurable divisions/categories, variants, bottle-to-tot selling options (yield default 30, per product), specials/combos with date/day/time windows, stock movement ledger, open-bottle stock takes.
- Ordinary items keep the existing policy (sale never blocked, stock floors at 0); specials are blocked unless valid now and every component has enough stock, and deduct all components atomically.
- Riverside: previous 23 test items archived (not deleted, history kept); pilot dataset seeded. No other club's data changed.

## 2026-09-27 — Optional weighted-average bar costing
Added per-club costing switch, average cost per stock unit, cost snapshots on every stock movement, audited cost adjustment, cost-of-sales report and admin "Costing & margins" step. Off for all clubs; verified in a rolled-back Riverside transaction.

## 2026-09-27 — Nelspruit opening balances: five member credits posted in wrong direction
- Issue: Johann Rademeyer (664), Eunice Combrink (550), Duard Combrink (435), William Mitchell (1100), JP Lategan (90) were posted as debtors debits (members owe club) in journal_ref 6b76f433-c60a-4a47-b785-721d5d7c455a, but these were member credit top-ups (club owes members).
- Fix: swapped debit/credit on all 10 rows of that journal (debtors + opening_balance_equity sides) and renamed debtors description to "Opening balance – member credit brought forward". Amounts unchanged. Data-only fix, no publish.

## 2026-09-28 — Mobile bar Single / Double prices overlap
- The three-column phone catalogue squeezed two spirit selling options into side-by-side buttons, overflowing their cards and obscuring prices.
- The signed-in bar catalogue now uses two columns on phones; selling options stack vertically with separate labels and prices, and longer product names can wrap. Sales, pricing, and inventory remain unchanged. Preview-only.

## 2026-09-27 — Add Special component picker: bar-only filtering + search
- Susan (Riverside) reported the special component picker listing shop products (Wilson racquets, Asics shoes) and being unsearchable on mobile.
- `HonestyBarTab.tsx`: `componentChoices` and `stockItems` now filter to items in the same division as the special being built (Spirits/Bar → bar items only; shop items excluded). `stockItems` is only used by the option "Sells from product" picker, so bar options can no longer attach to shop stock either.
- New `src/components/club-admin/bar/ComponentPicker.tsx`: cmdk Popover+Command searchable combobox, type-to-filter, grouped by category with emoji + label; replaces the native Select in the components row (249 items were unusable on mobile).
- Verified in preview at 384px: no shop items in the list, "klip" filters to Klipdrift/KWV options, selecting "Klipdrift Premium · Single" shows the tot hint; build OK. Preview-only, unpublished.

## 2026-09-28 — Made-to-order bar items (Restaurant category)
- New item_kind `made_to_order` for food prepared to order (burgers etc.): no stock levels, always on the menu, sales deduct no stock.
- DB: `bar_consume_sale` skips deduction for made_to_order; `resolve_qr_short_code` QR menu includes made_to_order items at zero stock.
- Frontend: `onMenu`/`formatStock` in src/lib/bar-inventory.ts; built-in `restaurant` category (🍔) in src/lib/bar-categories.ts; Add Item form gains "Made to order" kind and auto-selects it when category = Restaurant; admin list shows a "Made to order" badge instead of Out of stock.
- Preview-only, unpublished.

## 2026-09-28 — Bar menu: category shortcuts + specials visibility
- HonestyBar.tsx: sticky horizontally-scrollable category chip row above the catalogue; each chip smooth-scrolls to its section (`bar-cat-<value>` anchors, scroll-mt-14).
- Specials were hidden from the Buy menu: (1) `onMenu` required stock_qty > 0 — specials hold no stock, now exempt like made_to_order; (2) a special with equal valid_start_time/valid_end_time (e.g. 00:43–00:43) was never valid — equal times now mean "all day" in both `isValidNow` (bar-inventory.ts) and DB `bar_item_valid_now`; (3) `resolve_qr_short_code` QR menu now includes specials at zero stock. Verified at 384px: Specials section + chips render, chip tap scrolls to section.

## 2026-09-28 — Riverside food items moved to Restaurant category
- 12 prepared-food items (Beef curry and rice, Boerie Roll, Chicken Curry Rice, Chicken Pasta, Curry and Rice, NMSA Sunday Lunch, Prego Roll and Chips, Rib Burgers, Schawarmas, Toasted Sandwich, Vetkoek Mince, Vetkoek Plain) moved from custom_food to category `restaurant` with item_kind `made_to_order` (no stock, always on menu).
- CH Bites/Dry Wors left as stocked snack (has real stock of 8).
- Migration widened `bar_items_kind_chk` to include `made_to_order` (was blocking the update).

### 2026-09-28 — League scorecard ignored "Sudden death"
- Nelspruit Doubles association rules had win_by=1 (sudden death), but LeagueGameDetail let team mirror rows (default win_by=2, points null) override the association row, so the marker played win-by-2.
- Fix: association-scoped `league_rules` now wins for points-per-game and deuce rule; team rows only fill gaps.

### 2026-09-28 — Guided doubles serving in the live marker
- Problem: doubles marker showed only the first name of each pair ("Dave serving") and had no idea which partner served.
- Fix: new `src/lib/marker/doubles-serving.ts` (Even/Odd, By position, Second server), start prompt `DoublesServeSetup` (Forehand/Backhand for both pairs, serving pair, first server), serve banner "Name — SERVE RIGHT", "Correct server" override that rewrites state, state persisted with the marker session and in undo history. Settings: League rules → Scoring → "Doubles serving method"; tournament division settings → "Doubles serving method" (doubles divisions). Unset = old manual behaviour. Tests: `src/test/doubles-serving.test.ts`.

### 2026-09-28 — Bar menu category selection
- Replaced the horizontal jump-to-section strip on the signed-in Buy menu with larger, wrapping category choices. Choosing one shows only its products, with the cart retained across category and Bar/Shop switches. A division switch starts on its first available category; empty divisions retain their empty message. Prices, stock and QR menu are unchanged.

### 2026-09-28 — Multi-club bar/shop rollout
- Built-in categories remain a per-club fallback rather than writing rows to every club. The unambiguous shared labels are Cold Drinks, Energy Drinks and Snacks & Sweets; Beer & Cider stays combined where existing inventory uses that key. No other club's product category, price or stock is rewritten.
- The division manager gains a reversible Show/Hide Shop control. Hiding archives that club's Shop division, retaining shop items, stock and history. Riverside-to-Uitsig catalogue copying must remap item relationships within Uitsig and record opening stock through bar_stock_apply.
- Completed Uitsig copy in one guarded transaction after confirming its 21 old products had no linked transactions, stock history, QR labels or recipes. Uitsig now has 293 club-owned items (37 options and seven specials), 38 category settings, two divisions and 13 remapped recipe lines. The 72 stocked products received 25,936 opening units through 72 audited inventory movements. Verified source/destination product attributes match and no option or recipe points across clubs. No other club's products or transactions were changed.
- Public venue QR menu respects archived divisions; one-product QR stickers remain individually accessible. Uitsig's existing self-service bar toggle is OFF, so its signed-in Buy menu remains unavailable until the club enables it. Nelspruit's simple catalogue was visible in the preview with its original products and updated shared labels. App changes remain preview-only.

## 2026-09-28 — Cleared Uitsig test counter tabs (Willem & Koos)
- Removed 2 bar_guest_tabs (Willem R93 settled, Koos R88 open), 6 bar_visitor_sales, 8 bar_stock_movements, 12 club_journal_entries.
- Restored deducted stock on 7 items (incl. +500ml mixer, +4 tots); audit_events row `clear_test_bar_tabs` recorded.

## 2026-09-29 — Diamond League (teams) rules engine
- Organiser email showed Diamond League is a TEAM pool competition (teams of N, ties = N singles + N/2 doubles, +5 win bonus, crossover semis carry points, placing finals reset). Old `DIAMOND_LEAGUE_PRESET` (individual singles→doubles) is the wrong model.
- Added pure `src/lib/tournaments/team-league.ts` (+ `src/test/team-league.test.ts`): flexible team size, email week order for pools of 4, crossover A1vB2/A2vB1/A3vB4/A4vB3, placings 1–8, standings with carry, level totals reported as undecided (no invented tie-break), night timing.
- Not yet wired into the setup screen. Preview only.
- Follow-up: organiser options added (draw bonus split/both/none, ordered tie-breaks most wins/games won/points diff/head-to-head, level final rule, default 4 courts). New club-scoped `team_league_events` table (admins manage, members view) and `TeamLeagueManager` card above the tournament wizard: rules, teams + ranked players, pool weeks, score entry, tables, crossover semis, placing finals. Scores entered by admin (not yet linked to the live marker).

## 2026-09-29 — Diamond League inside the normal tournament setup
- Structure step has two tabs: Standard leagues / Diamond League (teams). DL mode skips the Schedule step; invites, registration, courts and players steps are the normal ones.
- Allocate step shows `DiamondAllocationBoard` (`src/components/tournaments/DiamondLeagueSetup.tsx`): registered players auto-placed via `autoSlotPlayers` (snake by seeding, locked manual slots never moved, withdrawn players leave a flagged empty slot); drag or tap to move.
- Saved to `team_league_events` linked by new unique `tournament_id`; running view (weeks, scores, semis, finals) stays in `TeamLeagueManager`, which no longer creates standalone events.

## 2026-09-29 — Diamond League substitutes via a Reserves pool
- Willem answered the absent-player rule: substitution is allowed; the admin replaces the player.
- `DiamondAllocationBoard` "Unallocated" list is now the **Reserves** pool: registered players waiting for a team slot; drag or tap a reserve into any empty slot to substitute. Withdrawn slots keep their empty-slot flag until a reserve is placed. Booking history (admin past-date picker) verified in preview the same day.

## 2026-09-29 — Diamond League events can be deleted
- TeamLeagueManager list rows have a trash button with a confirm dialog; deletes the team_league_events row (club-admin RLS policy "Club admins manage team leagues" already allows DELETE). Linked tournaments keep their row (tournament_id is ON DELETE SET NULL).

## 2026-09-29 — Diamond League page-two structure correction
- The standard individual singles-then-doubles preset and schedule review misleadingly suggested teammates played each other and doubles happened on another night. The tournament wizard's Diamond structure page now shows the team rules, number of teams, same-night game order, and per-week dates; standard schedule controls and review are hidden in Diamond mode. Courts and session times remain on Dates & Courts, with email times (17:45–21:15) set when switching from untouched standard defaults.

## 2026-09-29 — Diamond League fixture generation and standings placement
- Root cause: Create pool weeks only persisted JSON on `team_league_events`; the existing Riverside Club DL had three weeks but zero `club_champs_matches`, so Tournament Games and the live marker had nothing to show.
- The normal tournament Review & Generate step now previews every weekly tie and its position-v-position singles/doubles. Saving creates stable `dl:` tournament game rows immediately, replacing only unplayed Diamond rows and preserving scored/in-progress history.
- Linked Diamond events no longer appear in the separate manager above the tournament editor. Their team totals render directly in Tournaments → Standings, while doubles rows are recognised from their partner fields in the game list and marker.
- Backfilled Riverside Club DL only: 72 scheduled game rows across 7, 14 and 21 October 2026 (48 singles, 24 doubles). No other club data changed.
- Verified organiser email: each singles position faces the same position on the opposing team (#6 down to #1); doubles 5+6, 3+4, 1+2 face the matching opposing pairs. Pool weeks follow A1vA4/A2vA3, A1vA2/A3vA4, A1vA3/A2vA4; crossover and placing rounds apply to eight teams only. Preview verified page-two content without saving an event.
- Club DL screenshot exposed a false allocation warning: standard groups validation required `numGroups >= 1` although Diamond's two divisions and team slots are configured independently. Skip that standard-only check for Diamond allocation; keep it for standard tournaments.

## 2026-09-29 — Repeating AI Assistance notification and broken View link
- **Issue:** The hourly reminder only deduplicated against unread alerts. Clicking Done marked the current row read, so the next hourly run inserted the same reminder again. Its saved `/admin/ai-assistance` destination had no matching page and opened the 404 screen.
- **Fix:** Legacy and future AI reminder links now resolve to `/admin/support?view=ai`; the old route redirects there, and root-host Super Admin navigation preserves the requested admin path and query. View and Done wait for the read update and show an error instead of silently closing if it fails.
- **Reminder behavior:** The hourly job now compares the newest waiting request with the latest prior reminder regardless of read status. An acknowledged batch stays acknowledged; a request added or updated afterwards can create a new reminder. Existing alert links were corrected in place without changing request or member data.
- **Verification:** Focused navigation tests pass; the signed-in legacy route resolves to `/admin/support?view=ai`, no 404 is present, and no unread AI popup remains. Preview-only; not published.

## 2026-09-30 — Uitsig welcome video and Google registration
- Added the supplied registration/login video link to Uitsig's Welcome to SquashHub email, WhatsApp, and in-app versions, with guidance to use the club-held email for Google sign-in. Uitsig's SMS and all other clubs' templates remain unchanged; existing registration action is retained. The email uses a clickable link, rather than an embedded player unsupported by email clients.
- Existing-member registration now offers Google directly. Web Google entry points use the managed provider and a public same-origin callback retaining club context. A signed-in person with no linked membership returns to a unique exact-email club match, or the club finder if none is clear; MemberContext auto-claim requires exactly one exact-email match. Existing linked club member data remains authoritative.
- Checked the video URL, updated Uitsig template channels in the database, and confirmed the Google option displays on the Uitsig phone registration screen. Full provider round-trip and member linkage require an actual Google sign-in; no member records were changed in this check. App changes remain preview-only; not published.

## 2026-09-30 — Google sign-in 404 on club subdomains (regression)
- Cause: the 10:46 UTC Uitsig registration change switched web Google sign-in to the managed Lovable broker (`/~oauth/initiate`). squashhub.co.za and club subdomains are served from Vercel, which cannot serve that path, so Google returned 404 (worked the night before).
- Fix: GoogleSignInButton and ClubAuth restored to backend-direct Google OAuth via `getTenantAwareAuthRedirect` (tenant + club params kept). The new "Register or sign in with Google" button and hint text are kept. Do not switch web Google back to the broker unless the domains are served by Lovable.

## 2026-09-30 — Duplicate member records (Altu Sadie, PCC)
- Cause: signed-in callers had their own records excluded from the duplicate check (account-recovery), and email was never compared, so a logged-in player could create a second record at their own club.
- Fix: BEFORE INSERT trigger `club_members_block_duplicate` refuses a new record when a non-resigned record at the same club has the same normalized name and the same login or email (all paths, incl. Google/imports); a visitor insert is refused when the same login is an active non-visitor member with the same name at another club (ALREADY_MEMBER_ELSEWHERE:<subdomain>). register-visitor-user returns 409 codes; NoClubAccess sends the player to their home club. Families with different names are unaffected.

## 2026-09-30 — Recurring payments: club controls + outstanding-balance plans
- New `club_recurring_settings` (switch, allowed months, outstanding-balance window/max/min, audited to `recurring_payment_audit`); admin card under Payment gateway settings.
- Gateway recurring support is declared once in `src/lib/recurring-payments.ts` (`RECURRING_GATEWAYS`); Fees table Recurring column, My Account and dashboard prompt read it — never compare gateway names in screens.
- `mandate_arrears_plans` + RPCs `start_arrears_plan` / `cancel_arrears_plan` (server-side rule checks). Card gateways add the extra in `payfast-charge-mandates` (capped at plan remainder and amount owed, auto-completes); bank-capped debit orders require re-approval of the higher total instead of a plan row.
- "Pay your outstanding balance monthly" template seeded to all 799 clubs (not sent).

### 2026-09-30 — Susan's Nelspruit helper tickets
- Tanya Kinnear: kept login-linked record (now NSC396), moved her paid R3,300 family fee to it, removed duplicate unpaid R1,375 + R350; old record resigned. Holing: R1,650 opening balance moved Matt → Leigh. George Luputa already single record.
- Doubles swap list verified in preview: only Reserves + bye-team (LG001 on 06 Oct) players; sudden death (win_by=1) shows PAR 11 and is respected.
- Club admin Members list: "All current" now hides resigned members (e.g. Adele Geldenhuys); "Resigned" chip still shows them.

## 2026-09-30 — Diamond League team labels
- Default Diamond team names now use division-local labels A1–A4 and B1–B4 in setup, standings, and newly generated fixture labels. Previously saved default names are displayed with those labels without editing club records, player slots, scores, or custom team names. Focused team-league tests cover the old-name display mapping.
- The legacy Current Standings — Leaders / Bottom cards used individual player rankings even for linked Diamond League tournaments. Replace the leaders card with the Diamond team standings at the same position, hide individual bottom/survivor cards, and retain the team schedule and scores. Individual tournaments keep their existing rankings.

## 2026-09-30 — Diamond League slot and break timing
- Team setup has separate singles/doubles slot and included changeover-break minutes. Night estimates and game starts use the full slot; the Bells timer uses slot minus break per game. New linked Diamond tournaments save time-capped scoring; existing tournaments retain their original scoring mode on edit and require a separately reviewed scoring-mode transition before the Bells marker is usable.
- Re-saving updates existing unstarted fixture times in place (and removes only obsolete unstarted rows); a tie with any started or scored game keeps all its fixture rows untouched. No live club data was changed as part of this source update.

## 2026-09-30 — Diamond League marker team names
- The time-capped scoring screen now shows each side's saved fixture team name (A1/B1 or a custom name) beside the player or doubles pair in both counters and the serving indicator. Team identity comes from the linked event's saved weeks and team IDs, not a player's club or an inferred membership; unrelated Bells games retain their existing labels. Scoring and saved results are unchanged.

## 2026-10-01 Platform invoices missed messaging usage
- Cause: run on the 25th billed the *previous* month (August) of WhatsApp; SMS never billed; Super Admin "Amount Due" was a projection.
- Fix: issue day 1st; SMS line + sms_send_log.platform_invoice_id; messaging added to an unpaid invoice of the same month (reissued as Updated Tax Invoice); messagingOnly run flag; Super Admin shows unpaid invoice totals and real cycle. Reissued GB INSH-2026-00006 (R267.45), new INSH-2026-00007 Riverside R5, INSH-2026-00008 Nelspruit R147.

## 2026-10-01 — Diamond League scored fixture showed “Member”
- Cause: standings loaded names only for current team slots, while scored fixture rows hold the actual participants; substitutes and re-seeded doubles partners can differ from the current slots.
- Fix: load names for both current slots and recorded fixture participants, scoped to the event's club. Keep the recorded participant IDs as the display source; do not alter teams, scores, or results.

## 2026-10-01 — Diamond League squad substitution missing from fixtures
- Cause: saving team slots updated the event JSON, but the fixture synchronizer only refreshed dates/times of existing unscored rows; player IDs were left as originally generated. A started tie's pending doubles may have been re-seeded, so blindly rebuilding them would also lose their order.
- Fix: on organiser Save, update participants in unstarted games from current team slots; in started ties, change only the departing player's identity in still-scheduled/unscored games. Keep game rows, scores, completed games and seeded partner order. The allocation screen remains a draft until Save.

## 2026-10-01 — Diamond League points follow team position
- After a substitution, the roster displayed the incoming player with zero because the totals were keyed by person ID. Team positions retain their accumulated singles and doubles scores across substitutes; historical scored participants remain unchanged. Standings now aggregate scored fixtures by team slot, using singles rows to resolve historical occupants and seeded doubles partners, and label the leader cards as positions rather than personal lifetime totals. Unknown historical doubles slots are not guessed.

## 2026-10-01 — AI Assistance: stale "20 open" alert, invisible support replies, Tanya balance
- Hourly `ai-open-queries-hourly` counted every `escalated` assistant row even when its support ticket was resolved/closed (17 of 20). Now counts only escalations whose ticket is open/pending/in_progress, clarifications under 7 days old, and unexpired proposals. Old unread alerts marked read.
- Support replies live on `support_messages`; the assistant's "My requests" only showed the AI answer and linked to `/support` (which opens the newest thread, not the replied one). The panel now shows support replies inline, a "Support replied" note in history, and links to `/support?threadId=…`.
- Tanya Kinnear (Nelspruit): the earlier fix removed duplicate fee rows but left the matching statement charges (R1,375 + R350) and debtor journals. Reversed both journal groups (audited) and added a R1,725 statement reversal; balance R0.

### 2026-10-01 — Nelspruit: opening balance stayed on the wrong member's statement
- Symptom: Matthew Holing (NSC187) showed R1,650 owing although the opening-balance fee had been moved to main member Leigh Holing (NSC247).
- Cause: moving a fee row (`club_member_fee_payments.club_member_id`) does not move its GL rows; My Account reads the balance from `club_journal_entries` by `club_member_id`.
- Fix: reversed the GL pair on Matthew (`reverses_journal_ref`) and reposted it on Leigh linked to the same fee, audited in `ledger_audit_log`. Rule: when reassigning a fee to another member, always reverse + repost its journal entries too.

## 2026-10-01 — Diamond League summary tiles froze after pool play
- Symptom: Front runner and Wooden spooner stayed on pool totals while semi-final and final running tables updated below them.
- Cause: the team summary read only the two pool tables, although the carried semi-final and final tables already contained each newly marked game's points. Position totals already scanned every saved Diamond stage.
- Fix: summary teams and live markers now follow the furthest-created running table (final, then semi-final, then pool). Added focused guards that individual position points accumulate across pool, semi-final and final games, and renamed Last position to Wooden spoon position.
- Scope: display calculations and tests only; no fixtures, scores, teams, tenants or live records changed.

## 2026-10-02 — Step-by-Step Beta doubles entry and payment choices
- Replaced the combined doubles entry/payment menu with independent optional controls: a player may enter both partners and a player may choose to pay for both. Off means each player registers or pays for themselves; either choice can be deferred.
- Existing per-group partner selection and per-player/per-pair/category fees remain separate. Older device-local combined choices are converted on load; no tournament records, billing, schema, or normal builder were changed. These choices are planning-only, not active registration/payment rules.
- Follow-up: moved both independent choices into Fees & Payment (including free tournaments), with explicit Yes / No / Decide later answers and matching tree/summary wording; the separate partner-selection step remains unchanged.

## 2026-10-02 — Step-by-Step Beta match format visible in guided flow
- Added an early "How will matches be played?" choice after Singles/Doubles. Standard captures PAR 11/15, best-of-3/5 and win-by-2/sudden-death; Bells captures minutes per match. The tournament choice inherits to groups, with optional category and subcategory overrides after categories are defined.
- Overview and summary resolve and display actual group scoring when exceptions exist; a uniform choice stays concise. "Both" discipline now reads "Singles and Doubles". Saved answers remain per club on this device; no tournament creation, normal builder, schema, or live data changed.

### 2026-10-02 — Step-by-Step "Book courts now" booked only Semifinal/Final
- Cause: plan slots were checked for clashes only against existing bookings, never against each other, then sent in ONE batch upsert. The `prevent_overlapping_bookings` trigger refused the batch whenever two plan slots shared a court/time (e.g. two categories' rounds), so later presses booked nothing new; earlier-booked playoffs stayed.
- Fix (`src/lib/smart-builder/stage-bookings.ts`): `internalOverlaps` reports same-plan overlaps as clashes; stale plan rows are removed first; each slot is upserted on its own so one refusal never blocks other stages. Test: `step-builder-court-bookings.test.ts`, `step-builder-handover.test.tsx`.

### 2026-10-02 — Step-by-Step "Complete setup" hit invitation division error
- Cause: `persistStepTournament` never set divisions, so `tournaments.num_groups` took its default (2 unnamed divisions); admin-entered registrations carry `confirmed_at`, so trigger `enforce_confirmed_tournament_division_choice` required `division_choices` and raised the participant message.
- Fix: Step-by-Step categories map to `num_groups`/`group_labels` (+ `league_match_types` on base table); each admin entrant gets `division_choices=[its category]`; unplaced picks give a builder-specific error. Trigger unchanged (empty choices still rejected).

### 2026-10-02 — Step-by-Step "Inform selected players" sent nothing
- Cause: "Mark as informed & continue" only changed device-local stage; no message path existed.
- Fix: `StepInformPanel` sends one Communications-engine campaign (audience=selected entrants, per-recipient `audience_filter.member_vars.personal_message`, action `tournament_view` → `/club-champs/:id` with existing Pay card); `send-comms-campaign` now merges per-member vars and never re-sends an already-sent recipient/channel (safe retry). Per-recipient status from `comms_deliveries`; lifecycle persisted in `tournaments.beta_lifecycle`. Manual mark is a separate confirmed action.

- 2026-10-02 Step-by-Step Beta management: lifecycle stages revisitable (no undo), Inform "Send again" (new campaign per resend, ids on beta_lifecycle.inform.resend_campaign_ids), in-app notifications carry per-recipient `data.actions` (Pay now → /club-champs/:id?pay=1, Join WhatsApp group) from member_vars; Finalise gated on registrations status with reasons.

### 2026-10-02 — Stitch "Page not found" on tournament (and top-up) payments
- Symptom: Riverside R100 entry fee opened Stitch "Page not found".
- Root cause: `stitch-create-payment` Express fallback appended `?redirect_url=` to the hosted `/pay/<id>` link and kept it for club hosts even when its own probe got 404. Stitch 404s any query param on Express links (plain link 200). The v2 Payment Request attempt fails `invalid_client` for Express-only TEST creds, so every payment took this path.
- Fix: return the plain `payment.link`; the return URL travels only in the create body (`merchantRedirectUrl`/`redirectUrl`). Settlement unchanged (`_shared/stitch-settlement.ts` updates the existing registration to paid).

### 2026-10-02 — Step-by-Step: replacement counted 41; "Add to my account" still outstanding
- Replacement: `persistStepTournament` upserted picked players with ignoreDuplicates and never withdrew unpicked ones (nor updated partners), so the outgoing player stayed active. Now `step_sync_admin_entrants` syncs the set server-side.
- Account: `charge_tournament_entry_to_account` only ensured the fee row (already raised at admin entry) and recorded nothing, so status stayed pending_payment. Now records `fee_settled_via='account'`; derive trigger gives `fee_status='on_account'`; Management counts it as charged to member account, not outstanding.

### 2026-10-02 — Step-by-Step management: stale 41st entrant + "Player + Partner" rows
- Names: `loadRegistrations` selected non-existent `club_members.first_name/last_name`; the query failed and every row fell back to "Player"/"Partner". Now reads `club_members.name`.
- Stale entrant: a replacement saved before `step_sync_admin_entrants` left the incoming player claiming a partner whose own row still pointed at the outgoing player. New `step_reconcile_admin_entrants(champ)` (run on every management load) resolves duplicate partner claims: newest claimant wins, older unpaid claimant is withdrawn via `step_sync_admin_entrants` (fee reversed + audited). Conflicts involving paid entries are left for the organiser. Singles-only stale rows cannot be detected without the picked list (re-complete selection to sync).

### 2026-10-02 — Step-by-Step organiser-made pairs: pay partner's fee / both
- The Fees & Payment answer "A player may pay for both partners" (fee.doublesCover) was device-local only. Now saved as `tournaments.beta_lifecycle.partner_pay` on Complete Setup.
- Existing pay-for-partner logic (`champ_doubles_pairs.pays_for_partner` + `champ_apply_paid_registration`) only covers self-made pairs, so organiser pairs (`partner_member_id`) use `step_pair_payment_context` (server amount/eligibility, scopes options/partner/both) and `step_apply_partner_cover` (service-role, from Stitch settlement via session `metadata.pay_scope`). Partner fees are settled on the partner's own entry/fee row — never posted to the payer's account. Stitch only.

### 2026-10-02 — Step-by-Step partner payment had no buttons; member-account settlement not recognised everywhere
- Cause: (1) the saved tournament's `beta_lifecycle.partner_pay` was only written on Complete Setup, so messages promised partner payment while the server said "disabled"; (2) partner options were hidden unless the gateway was Stitch, and guests (no login) could not read the options (anon lacked EXECUTE); (3) the delegation check in `step_pair_payment_context` / `charge_tournament_entry_to_account` used non-existent `member_account_delegations.member_id` (now `member_is_delegate_of`, grantor_member_id + status active); (4) the secure link, invite card-payment context and Stitch start only looked at `status`, so an entry "Added to my account" (`fee_settled_via='account'`, status still pending_payment) was still offered card payment.
- Fix (migrations 0005/0006): `champ_member_fee_settled()` = paid/waived/on_account; used by pair context and invite payment context; `step_charge_pair_to_account` (partner/both → payer's club account; partner's own unpaid charge reversed + audited; partner entry `on_account`, becomes paid when the payer settles via existing trigger); `charge_tournament_entry_to_account` refuses already-paid entries; `get_tournament_invite` returns fee_status/fee_settled_via; `stitch-create-payment` refuses own-entry card payment for settled/on-account entries. Builder syncs partner_pay whenever the answer changes. Riverside test tournament partner_pay set to true.

### 2026-10-02 — Step-by-Step: Generate draw & fixtures
- Added StepGenerateDrawPanel (confirm final format → preview → generate/rebuild), `step-draw.ts` bridge, migration 0007 `step_prepare_draw`. Structured `insertFixtures` now writes `play_by` on rounds/games for play-by stages. Payment never affects the draw. Tests: src/test/step-generate-draw.test.ts.

### 2026-10-02 — Step-by-Step Generate draw: cross-league, rankings, multiple play-by rounds
- Cross-League Round Robin now generates (existing Club Champs rule: every selected group plays every other selected group, never its own) as one structured `mapped` division with explicit league positions; entries keep their own group so league standings still work; `round_format` set to `cross_league`.
- "Use rankings" seeds by club ranking points (pair = both players' points); regional/national level, unknown level, or no points recorded → blocks with a message (never falls back to entry order).
- Several play-by deadlines in one stage → per-round `roundDates`; rounds split over the dates (organiser can set the split), saved per round/game `play_by`.
- Draw reconciles entries before preview and again before commit, refusing if the entries changed.
- Step-by-Step Generate draw: pools & seeds preview before generating (existing pools.ts allocation + move-to-pool, drag or select); organiser's pools saved as explicit poolMembers and used exactly by the engine (refuses if they no longer match entries).

- 2026-10-02: Beta tournament court booking rejected Riverside courts (court_not_selected) because the venue had no explicit courts while the window fell back to all club courts. Fixed with one resolver `tournament_bookable_court_ids` used by both guard and window; regional events block generation until a host club is set.

## 2026-10-02 — Pool standings shown as one combined ladder (River 2 Clubs)
- Stored fixtures were already pool-bounded (10+6, 15+10 etc., no cross-pool games). Standings read pool count only from `swiss_pools`, which Beta tournaments never set, so pools rendered as one ladder with a Pool column.
- Fix: pool count also derived from persisted `pool_number`; engine now asserts pool boundaries and per-pool counts; Generate draw blocks unresolved/duplicated/missing pool places. Tests: `src/test/pool-boundaries.test.ts`.

## 2026-10-02 — Step-by-Step pool creation moved to competition grouping
- Cause: the Pool structure controls were buried below Planned format and mixed structural size with playoff qualification. New category-only events could not see the setting until much later in setup.
- Pool creation is now shown immediately under each category without subcategories, or each subcategory when present: Yes / No / Decide after entries close, with preferred size for Yes. Actual allocation remains at Generate draw, using the existing allocation engine and actual active entrants. Explicit No normalises legacy multi-pool provisional formats to one round robin at review; an absent rule retains the old format.
- Qualification fields moved to Playoffs (once-off) or Stages & scheduling (Club Champs). The saved `playoffPoolQualifiers` overrides the legacy `poolPlan.perPool/runnersUp` fallback without rewriting old plans. Unsupported pool + non-round-robin and between-subcategory combinations block generation. Existing fixtures/results were not modified.

- 2026-10-02: Step-by-Step Beta "Draw notifications" (Messaging step, default on, beta_lifecycle.draw_notify) — Round 1 at Generate draw and each later stage on creation; notify_champ_round_draw now messages both doubles partners with partner name + both opponents and phones, optional p_stage_key filter.

## 2026-10-02 — Round-1 notice lists all round booking dates + messaging step section headings
- `notify_champ_round_draw` (migration `round_notice_all_round_dates`, applied): when every round of the current stage was drawn upfront with its own play-by date, the Round 1 notice (in-app/email/WhatsApp; not SMS) now appends "Your rounds and booking dates: Round 1 by DD Mon, … — Please book a court for each round by its date." so players can book all their courts in one go. `round_schedule` added to the notification data. Also back-filled the earlier doubles-partner + `p_stage_key` version of the function, which had been applied live but not committed as a migration file.
- Step-by-Step messaging step: solid colour-block section headings (semantic primary) for Invitation/Entry notification, Tournament WhatsApp group, Draw notifications and After-match notifications; Draw notifications description and Generate-draw checkbox now mention the all-rounds booking-date list.

### 2026-10-02 — River 2 Clubs final verification
- Added `src/test/pool-to-final-integrity.test.ts`: two pools (5+4) → QF → SF → Final, singles + doubles; pool membership, every pool result and P/W/L/GW/GL/points snapshot identical after every stage; revisits create nothing.
- Organiser-scheduled play-offs (`stage='ko'`, no play_by, date+time set) are no longer bookable/reschedulable by players (`isCentrallyScheduled`); admins may still override.
- "Enter result" limited to the game's players + organisers (was any club member with a confirm). Mark game unchanged.
- River 2 Clubs: pool data intact; existing QF pairings DO NOT match the current engine's recalculation in any of the 5 subcategories (old QFs used earlier manual whole-pool orders). No QF played; left untouched pending organiser decision.

### 2026-10-03 — River 2 Clubs historical pools and structured play-off presentation
- Pool tables remain pool-stage-only: existing pool ranks and P/W/L/GD/points are not recalculated from play-off matches. Their first-place label reads “Pool winner”; eliminated entrants are dimmed and struck through, while surviving QF winners are labelled “Advanced to Semifinals.” No pool or result records were changed.
- Structured draws show Quarterfinals and projected Semifinals separately from historical pool tables; legacy knockout cards and the generic “Ready for Round 2” action are suppressed for structured draws. The collapsed progress card uses the configured next-stage name instead.
- Riverside preview at 390px: five Semifinals draws and ten Pool winner labels visible; all five progress lines read “Quarterfinals complete — Ready for Semifinals”; pool table width 293px within its container, no horizontal page overflow. Current database state has completed QFs (four winners per division); the existing pool-stage results are preserved. Historical-status, round-control, and pool-to-final integrity suites: 16 tests passed; TypeScript check clean. No publication or messages sent.

### 2026-10-03 — Fixed knockout feeder paths (pool → QF → SF → Final)
- Later play-off stages are filled only from fixed bracket feeders (`stage_winners` mapping, by source `bracket_position`): with crossover QFs (QF1 A1vB4, QF2 B2vA3, QF3 B1vA4, QF4 A2vB3), SF1 = W QF1 v W QF2, SF2 = W QF3 v W QF4, Final = W SF1 v W SF2. Never reseeded from points, pools or rankings.
- New SF/Final rows persist feeder labels in `placeholder_a/b` ("Winner QF1"). UI shows "Winner → Semifinals n" on QF cards and fills SF slots as each feeder QF is decided.
- River 2 Clubs: spec already stored these feeders for all 5 draws; no SF rows existed; no data changed.
- Known pre-existing: 3 tests in playoff-progression.test.ts fail on an unresolved 5-way tie in their cross-league fixture data (tie-break engine change), unrelated to feeders.

### 2026-10-03 — Semifinals created for only one draw; SFs showed without time/court
- Cause: Structured engine panel decided "stage exists" by stage key across ALL draws (keys repeat per draw), so once Men's A had Semifinals the other four draws lost their Start button; the manual start path also skipped booking the planned fixed session, leaving SFs with a date but no time/court (read as player-arranged). Tournaments page fell back to milestone play-off deadlines for structured play-offs.
- Fix: per-draw existence check (stage_key + group_number); manual start/confirm now books the target stage's planned session; structured play-offs never take a fallback play-by. Tests: src/test/per-draw-semifinals.test.ts (5 draws → 10 SFs, partial readiness, SF scheduling from SF stage only).
- River 2 Clubs: created SFs for the 4 missing draws via the normal engine; all 10 SFs booked on 25 Oct 16:25–20:25 per the Semifinal stage; earlier games unchanged.

### 2026-10-03 — Historical pool survivor colours
- Structured historical pool rows use theme-aware green for players still alive and light pink/red for eliminated players once progression is known. Eliminated names keep their strike-through; historical position and statistics are unchanged. Unresolved pre-progression tables stay neutral. No tournament records or notifications changed.

### 2026-10-03 — Final courts/times blocked by the stage's own reservation; "Book court" on organiser-run Finals
- Cause: "Book courts now" reserved courts 20/21/24/26 10:25–17:25 on 28 Oct as `sbs:` blocks; the play-off scheduler and `self_schedule_champ_match` saw that block as a clash, so Finals stayed date-only. Admins saw the generic "Book court" label.
- Fix: `schedulePlannedPlayoffGames` treats the stage's own `sbs:` block as room and carves each game slot out of it (rest stays reserved); organiser-run unallocated fixtures say "Assign court"; header says "court & time still to be assigned" with an admin "Assign courts & times" action. Test: `src/test/playoff-reservation-carve.test.ts`.

- 2026-10-03 — Tournament Beta Diamond League now opens the proven Current Builder Diamond setup (ClubChampsTab `launchDiamond`); the Beta's stage-model Diamond template, "Load Diamond League template" button and DiamondLeaguePanel removed for new creation. Existing Diamond tournaments/data untouched.
- 2026-10-03 — Tournament home removed the duplicate top-level Diamond League choice; its SquashHub Pre-built template keeps the same `ClubChampsTab launchDiamond` hand-off. No saved tournaments, fixtures or results changed; preview only.

### 2026-10-03 — Diamond League invitation wording in the Beta entry
- Cause: the shared invitation details and preview used the singles match type and an unset scoring mode for a new Diamond team event, producing a misleading singles name and standard scoring description.
- Fix: the Diamond setup identity now drives its editable invitation opening, separate competition/category lines, time-capped team-tie scoring, and placing-round points rule. The default tournament name, in-app heading, test heading, and email preview no longer fall back to Singles. The same invitation body is used by preview and outbound in-app/email/WhatsApp; ordinary singles/doubles wording stays unchanged. Existing events, saved copy, fixtures, scores and standings were not modified.
- Verified the unsaved Riverside Diamond preview across in-app, email, WhatsApp and SMS, plus five focused invitation tests; no message sent or event saved. Not published.

## 2026-10-03 — New self-signup members not charged membership (Nelspruit)
- Cause: the sign-up trigger creates the club_members row before MemberOnboardingWizard runs, so the wizard treated the member as pre-existing and skipped the pro-rata + registration fees.
- Fix: wizard treats a signup-created row (pending approval, or joined within 10 min of auth account creation) with no club/registration/opening fee as new.
- Data: Francois Steyn fees raised (R875 pro-rata + R350 registration) and settled from his R2,100 top-ups (R875 credit left); Francois Vosloo's paid-by-card fees marked paid. Ledger settled via balanced "Wallet credit applied" debtors entries (no extra bank posting).
- Open: marking a fee paid from wallet credit posts Dr bank/Cr debtors a second time (journal_fee_payment_received) — inflates bank and member credit on wallet settlements club-wide; not yet fixed.

## 2026-10-03 — Wallet-settled fees double-counted in bank
- Cause: `journal_fee_payment_received` posted Dr bank / Cr debtors whenever a fee flipped to paid, even when settled from wallet credit (top-up had already posted that).
- Fix: `club_member_fee_payments.settled_from_wallet`; trigger skips it; set by `_shared/wallet-auto-settle.ts` and MyAccount "Credit" payment.
- Data: removed 3 duplicate "Fee paid" pairs (GB R725, GB R120, NSC R150). Only cases club-wide.

### 2026-10-03 — Paced knockout management
- New pure engine `src/lib/tournaments/paced-knockout.ts` (active field, milestone from existing shared/own play-off stages, pace plan + risk warnings, progressive/traditional pairings) with tests in `src/test/paced-knockout.test.ts`.
- Builder knockout format gains Knockout pace and Pairing strategy; Generate draw creates only the paced Round 1; Manage Tournament gets "Knockout rounds" to confirm each later round with editable pairings. Round-robin round-count errors no longer apply to knockout categories. Diamond League untouched.

## 2026-10-03 Knockout inside pools
- "NSP Knock out": Create pools = Yes + Format = Knockout was blocked ("Pools need a within-group round robin"). Pools are now a partition; knockout eliminates within each pool to its qualifiers, then the play-off takes over. Round robin pools unchanged.
- Follow-up: knockout "rounds needed" now = fewest elimination rounds to the next stage field per pool (10 players, 2×5, QF 8 → 2 eliminations, 1 round), not round-robin rounds; each play-by date is one knockout scheduling round; format shows "Knockout within pools/groups".

- 2026-10-03 NSP Knock out: paced Round 1 games were saved as "Quarter-final"/"Semi-final" because structured-persist named knockout rounds by game count. Paced fixtures now carry `pacedRound` and save as "Round N"; pool rounds in Manage never take play-off names. No future rounds had been created; 8 unplayed rows relabelled only.

### 2026-10-03 — Paced knockout: Round 1 created while organiser thought they were still choosing matches
- NSP Knock out: all 8 Round 1 games were created in one Generate commit (16:41:47); the Generate step showed only pools/seeds, never the actual Round 1 matches, then closed straight into the next stage.
- Fix: Generate draw now lists the proposed Round 1 matches per pool (same engine dry run, `proposedKnockoutRound1`) with editable players, remove/add and reset; Generate saves exactly those (`paced.pairs` / `paced.poolPairs`, validated in `engine-service` — same pool, distinct, real entrants) and asks for an explicit confirmation stating how many games are created. Edits reset when seeds, pools, pace or pairing change.

### 2026-10-03 — Knockout pool colours before the first result
- Cause: standings only passed pool status to the shared table after a completed elimination; Masters had results and turned green/red, while every other NSP Knock out category with no results stayed neutral.
- Fix: all configured knockout pools always pass active/eliminated status to the same table. An unplayed match never eliminates anyone; no results or tournament records changed.

- 2026-10-03 Optional play-off stages (knockout): QF no longer assumed. Builder pool-qualification target, summary path text and pairing ("Winners of previous stage" = qualification survivors for the first knockout play-off) now read the first CONFIGURED stage via milestoneFor/playoffSteps; removing a play-off stage on a live tournament is blocked when that stage has played games. Tests: src/test/optional-playoff-stages.test.ts.
- 2026-10-03: KO Confirm N fixtures failed 'needs division, stage and round' for categories with no prior games (Ladies/Boys). StepKnockoutRoundsPanel now resolves division/stage from tournament_divisions/tournament_stages (formal stage by label when present), creates the round row, and guards double-clicks.

- 2026-10-03: Tournament Games grouped paced knockout fixtures under bare "Round N", suggesting one global tournament round although each category advances independently. Structured pre-playoff knockout headings now read "Knockout Round N" with category names (compact count for long lists) and category subheadings; formal playoff labels and fixture data are unchanged.

## 2026-10-03 — Fixed-stage games left TBD (NSP Knock out Final)
- 2026-10-03 Standings overview: restored a single compact Tournament Summary above detailed category/pool cards. Reads saved formal QF/SF/Final fixtures and completed Final winner (not pool rank or early knockout rounds), in configured category order; mobile stacks rows. NSP Knock out's five categories verified read-only in preview; no match data or messages changed.
- Cause: scheduling was only wired to formal play-off confirmation via the panel's own step lookup; Finals created without it stayed TBD/"Book by".
- Fix: `src/lib/tournaments/formal-stage-schedule.ts` is the single fixed-stage scheduler (any round/stage with fixed date + window + courts). Knockout confirm resolves the configured stage by label for every round; initial draw generation (StepGenerateDrawPanel, StructuredEnginePanel) calls `allocateAllFixedStages`. Capacity shortfall blocks confirm with required vs available. Tests: `src/test/fixed-stage-scheduler.test.ts`.
- Repair: 5 unplayed NSP Finals slotted on 26 Oct (last category first). SFs with missing slots already had results — left untouched.
- Follow-up: organiser reduced the Final to Courts 1–3 after slotting. `reconcileFixedStages` (run when setup saves) re-slots any fixed stage whose unplayed games sit outside that stage's own date/window/courts (`slotFitsStage`); overflow loses its invalid slot and warns. NSP Finals moved off Court 4; the stale Court 4 Final reservation was cancelled.

### 2026-10-03 — Cross-league round robin blocked ("needs at least one other group")
Cause: per-group validation read only each group's own selection; a setup "Cross-league" with no named groups left both empty. Fix: canonical edge graph (`crossEdges`), `divisionIssues(d, all)`, `defaultCrossAll`; preview lists "A ↔ B: N matches". Tests: `src/test/cross-league-edges.test.ts`. Also removed club-facing "Beta" labels (identifiers unchanged).
- 2026-10-03: Who-plays-whom UX reworked (Within this group / Against other groups → Full cross-group round robin or Selected player matchups); tests in cross-league-edges.test.ts.

- 2026-10-03: 6th/7th Standings — singles between-group draw falsely raised "doubles entry has no partner" (partner check now only for pair units); 7th table rank-tinted with 0 played (between-group tables now plain until results); added configurable Standings & awards (team outcome, top scorer, wooden spoon).

### 2026-10-04 — Existing-member signup said "not found" for members who already have a login
- Cause: `lookup_existing_member_for_signup` only returns unclaimed rows (`user_id IS NULL`), and ClubAuth showed one generic "couldn't find a member" message for every empty result.
- Fix: new `existing_member_signup_status(club_id, email)` (status word only: already_linked / verification_mismatch / not_found, email lower+trim). ClubAuth calls it only when the lookup is empty: already_linked shows Sign in with Google / Sign in / Reset password; mismatch shows a specific number/phone message. Regression case: Riverside + HKFTservices@gmail.com. Test: `src/test/existing-member-signup-status.test.ts`.

### 2026-10-04 — Onboarding template showed blank Email / "No Email version" (fixed)
- Symptom: Edit Template showed empty subject/body; Send Campaign > Channels said "No Email version in this template".
- Root cause: `useCommsTemplates` loaded `comms_template_versions` with no filter. Platform admins can read every club's versions (~6,400 rows across 799 clubs) and the API caps responses at 1,000 rows, so the club's own versions were silently dropped. Data was intact. Stale cached name came from a session opened before the rename.
- Fix: load versions filtered by the club's template IDs; activation sender and `seed_club_welcome_template` now identify the template by action key `register_existing_member`; email subject normalised to "Activate your SquashHub account – {{club_name}}" for all clubs.

### 2026-10-04 — Member bar page ignored bar payment settings
- Symptom: members buying at the bar (e.g. Nelspruit) still saw "I swiped at the card machine" and other methods the club had switched off.
- Root cause: `ClubContext` restricted-column select did not load `bar_account_tab_enabled`, `bar_pay_online_enabled`, `bar_card_swipe_enabled`, `bar_cash_enabled`; `HonestyBar.tsx` treats a missing flag as enabled (`!== false`), so every option showed.
- Fix: added the four bar flags to `RESTRICTED_CLUB_COLS`. Server-side RPCs already refuse disabled methods.

### 2026-10-04 — Bar: no way to cancel an online card payment on a tab
- Symptom: after "Pay online" the tab stayed "awaiting payment" with no cancel option (counter or guest), so it stayed stuck.
- Fix: `bar-card-verify` accepts `{tab_id, tab_token, cancelled:true}`; checks the gateway first (paid is kept), otherwise reopens the tab and returns lines to it. Only tabs closing via `online` are affected. "Cancel card payment" button added in `BarCounter.tsx` and `ScanPay.tsx` (helper `src/lib/bar/cancel-tab-card-payment.ts`); guest page now keeps an awaiting-payment tab after reload.

### 2026-10-04 — Pick players allowed only one event per person
Cause: builder stored one event per picked player; saving wrote one division and one partner; draw rejected a person appearing twice. Fix: event chips per player, `division_partners` per-event partner column, per-event draw validation and category guard. Entry fee stays one per registration (unchanged).


### 2026-10-04 — Weekend play-offs before qualifying finished; ambiguous play-off rows; fee per event
- Cause: assumed-schedule gated each event's play-offs only by its own qualifying games; play-off headings omitted the event.
- Fix: first play-off stage of every event waits for ALL qualifying games (+gap / later fixed start; earlier fixed start = conflict); headings lead with the event (`playoffHeadingText`). Tests: `playoff-global-gate.test.ts`.
- Entry fee now per event; partner payment covers only the shared doubles event (migration `0036_entry_fee_per_event`). Tests: `entry-fee-per-event.test.ts`.

### 2026-10-04 — Invite payment total and payment methods
- `champ_member_event_paid` returned NULL for a partner event covered by an unpaid "pay for both" promise, so the partner share dropped out of the amount owed (R150 instead of R250). Now always true/false.
- Invite page now offers the tournament's chosen payment methods that the club can accept (card / EFT / member account / cash) via `invite_payment_options` + `invite_settle_entry`; card still goes through Stitch.
- Picking a doubles partner can now be "Pay both" or "Pay only mine" (`propose_doubles_partner` honours `p_pay_for_partner`).

## 2026-10-05 — Outstanding-balance plans separated from fee plans
- Problem: outstanding-balance plan was added onto the membership monthly charge and sized from all unpaid charges (double-financing membership).
- Fix: `member_outstanding_breakdown` RPC, rewritten `start_arrears_plan` (stores covered charges, never touches the mandate), separate collection per plan in `payfast-charge-mandates` (purpose `fee` against plan charges only), member UI copy updated.
- Follow-up (same day): reverted to ONE combined debit (fee amount + plan instalment) with split settlement: fee part as before, plan part as separate 'fee' session against covered_fee_ids.

## 2026-10-05 — Nelspruit doubles scorecard showed old pairs; Edit / Select Players did nothing
- Cause 1: a single reserve swap (27 Sep) saved all 5 rubber rows with `lineup_set_at`; saved rows were treated as authoritative, so later `league_team_pairs` changes (new pairs effective 5 Oct) never showed. Singles fixtures were unaffected (no pre-saved rows on upcoming singles fixtures).
- Cause 2: the button set `setupDone=false`, but the saved-rows load effect re-ran on every poll/realtime refetch and forced `setupDone=true` again.
- Fix: `league_match_results.home/away_lineup_explicit` (true = chosen for this match, false = default copy, NULL = legacy). Unstarted fixtures refresh default copies and legacy doubles pairs that are superseded on the fixture date; explicit picks and started/locked rubbers are kept. Edit flow guarded by a ref; button limited to captains/admins and disabled once scoring starts.

### 2026-10-05 — League scorecard "Replace player" silently ignored (Nelspruit, Dual Machines)
- Cause: two unplayed rubbers carried a leftover `participants_locked_at` (set 2026-09-28 when a result/forfeit was briefly recorded then undone). `freeze_league_rubber_participants` trigger silently restored the old players on every save.
- Fix: trigger now releases the lock when the rubber has no winner, no game scores and no forfeit; played rubbers stay frozen. No data edited directly.

### 2026-10-05 — Match Day links opened a duplicate scoring page
- Symptom: secure league link showed a separate "Match Day" page with a simplified score form instead of League Games.
- Root cause: League Games screens require a member login (RLS), so the first version rebuilt them behind `md_*` functions. Courts were never wrong (fixtures carry `court_id`; only the bye has none).
- Fix: `/md/*` now renders the existing `LeagueGames` / `LeagueGameDetail` inside `MatchDayDeviceContext`; requests go as anon + `x-match-day-token`, scoped by `md_hdr_*` RLS policies; device writes audited. `md_save_league_rubber` revoked. Tournaments still on interim page.

## 2026-10-05 Match Day tournament links
- Tournament QR links showed an empty "Standings appear once results are in" because they used a separate interim page with its own simplified standings. Fix: links now open the real member Tournaments, tournament (standings), marker and live screens in device mode; interim MatchDay.tsx removed. Verified on Riverside 6th 7th and Open S D.

- 2026-10-05 Booking banner showed "Turn On Lights" at clubs without court relays (e.g. Nelspruit) because the banner rendered for door access and the lights button ignored device config. Now gated per court by `courtHasLightDevice` (lights integration on + courts.relay_device_id).

- 2026-10-05 Nelspruit got club-wide "Fill up your league teams" notices from a stale deployed `reminders` function (club `fill_top_down_enabled`). Redeployed repo version: per-league `fill_up_reminder_enabled` + fixture within 14 days, captains only.
- 2026-10-05 Barry Christie (Nelspruit) not charged joining fee: newness check compared row to the saving user (fails in 'Viewing as'); now compares row joined_at to the row owner's profile created_at. Fees R875+R350 added manually.

### 2026-10-05 — New member application skipped details/category/fees (Nelspruit)
Root cause: clubs with auto member numbering assign a number when the applicant's account is created; the dashboard only opened the signup steps when the member number was missing, so applicants (e.g. "Susan Toets", NSC400) landed straight on the dashboard and admins approved an empty application. Also the self-update guard blocked an applicant from saving their first fee category, and signup rows were treated as "existing" so the once-off registration fee was hidden.
Fix: `src/lib/membership-application.ts` (incomplete = own signup row without fee category); Dashboard resumes the steps; wizard treats fresh signup rows as new (registration fee shown, never re-charged once joining fees exist) and requires a category; DB guard allows an applicant's FIRST category only; admin panel shows Incomplete / Awaiting payment / Ready for approval and blocks approving incomplete ones.

### 2026-10-05 — Application resume restarted at step 1; activation link showed "already linked"
Root cause: signup steps saved nothing until the last step; and a preloaded member auto-linked by email on sign-in saw "already linked" on their activation link (link never marked used).
Fix: server-side `club_members.application_progress` + owner-only RPCs; wizard saves step/answers on Next and resumes on any device. ActivateAccount now calls claim when the link resolves as claimed, confirming the signed-in owner and retiring the link. Verified end-to-end with temporary Nelspruit records (removed).

### 2026-10-05 — Second-club membership applications
Existing members at another club only saw 'Register as a visitor'. Added RPC `apply_to_club_as_existing_person` + warn/confirm dialog in `NoClubAccess.tsx`; the new pending row flows through the normal application wizard (fees at final save, admin alerts on completion).

### 2026-10-05 — Stitch success no longer returning to SquashHub (regression)
Root cause: Riverside's Stitch portal 404s any ?redirect_url (host not whitelisted); fixes on 2 Oct (stitch-create-payment) and 5 Oct (stitch-create-mandate) stripped redirect_url for ALL clubs, relying on body keys Express ignores. Restored redirect_url with a per-link probe, bare-link fallback only where Stitch 404s.

### 2026-10-06 — Andre de Beer could not claim his Uitsig membership
- Cause: Andre signed in with Google using `andredebeer1973@gmail.com`, while his imported Uitsig member row still carried `andredb@fischersa.com`; email auto-linking therefore left the existing member and person records unclaimed. His league signup retries returned 400 because the Google account had no password for the password-based claim endpoint.
- Resolution: linked the verified Google account to Andre's existing person and Uitsig member records and updated their contact email. Preserved member number UITS2557, role, status, fee category and ladder position 30; no duplicate membership was created.

### 2026-10-06 — Elizane Barnard separated from Manie Barnard's login
- Elizane UITS3356 was linked to Manie's `maniebarnard@gmail.com` login despite having her own member email.
- Created and linked a separate confirmed login for `elizanebarnard23@gmail.com`, linked Elizane's existing person record, and left Manie's login/member record unchanged. Preserved Elizane's member number and ladder position 15.

### 2026-10-06 — Diamond League per-division schedules + play-offs switch
Template setting `divisionSchedules` (play days, optional from-date and start time per division) gives each division its own round-robin nights; `playoffs` (default on) hides/blocks semis and finals when off. Legacy events unchanged. Tests: src/test/diamond-division-schedule.test.ts.

- 2026-10-06: Admins can change a member's login email from Members → Edit (Login email box). Shared logins are split: the member gets their own confirmed login (edge fn admin-set-login-email, club-admin only). Damian & Luhann Groenewald (Uitsig) split off Deon's login.

- 2026-10-06 — Match-day tablet "Complete Setup" failed with RLS error on league_fixture_results: anon device policies only allowed status 'draft' but setup saves status 'setup'. Policies now allow 'draft' or 'setup' (submitted rules unchanged).

- 2026-10-06 — Durbanville Diamond League save failed for Grant van Zyl ("Cannot coerce the result to a single JSON object"): he has the "Events & Tournaments" permission role (champs) but `team_league_events` only allowed full club admins, so the update returned 0 rows. Added policy "Tournament admins manage team leagues" (has_club_permission 'champs').

- 2026-10-06 — Diamond fixtures showed 7 Oct, 22 Oct, then 14 Oct because generated week/round groups spanned both divisions' nights. Diamond lists now use chronological date-only headings via `tournamentMatchDays`; times/courts remain underneath. No saved fixture, player or position changes; preview only. Regression: `tournament-schedule-order.test.ts`.

## 2026-10-07 — Bar tab card payments stuck "awaiting payment" after paying
- Cause: bar scan-to-pay/tab Stitch payments were only confirmed while the payer's page polled `bar-card-verify`; `stitch-sweep-pending-payments` only scanned `stitch_payment_sessions`.
- Fix: sweep now also re-checks pending `bar_visitor_sales` references (non-PayFast, 2 min – 3 days old) via `bar-card-verify` (gateway first, never auto-cancels). First run settled 2 more paid Nelspruit sales.

## 2026-10-07 — One online bar payment split into many bank entries
- Fix: `bar_post_sale_journal` posts sales sharing a `payment_reference` under one journal ref (md5(club:ref)): one bank debit for the full amount, one gateway fee, itemised bar_income credits. Single/cash sales unchanged. Existing paid multi-line payments re-posted (totals unchanged).

- 2026-10-07: Club ladder saves failed for admins granted via a Full Admin permission role (club_members.role=member). Ladder RPCs (admin_reorder_ladder, apply_ladder_adjustments, approve/reject_ladder_move_pending, admin_set_cross_gender_ladder, seed_ranking_points_from_ladder) and ladder_configs policy now use is_club_admin_or_permitted(...,'ladder').

### 2026-10-07 — League doubles scorecard saved pairs as text only; stray 0–0 games; stale updated_at
- Doubles positions now also write `rubber_type='doubles'`, `*_player2_name` and both `*_member_id`s (resolved from pairs official on the fixture date; label stays the display name). Helper `src/lib/leagues/doubles-rubber-columns.ts`.
- Manual "Enter result" overlay and setup save drop 0–0 games (`dropEmptyGames`).
- Every scorecard write sets `updated_at`. Frozen (scored) rows unchanged by DB trigger. Tests: `src/test/doubles-rubber-columns.test.ts`.

### 2026-10-07 — League Team Standings hidden when rounds lacked season link
Nelspruit Doubles League showed "No league rounds set up yet" despite 3 submitted results: its only round had `season_id` NULL while a 2026 season existed, and standings only read fixtures through season-linked rounds. Fix: standings now read all league fixtures in the season (season_id match, or unlinked and dated in the season window) and use rounds only for grouping (`src/lib/leagues/team-standings.ts`, tests `src/test/team-standings.test.ts`). No data changed.
- Follow-up: added trigger `league_rounds_autolink_season` so any round created without a season is linked to the single league season covering its date; backfilled the Nelspruit Doubles round. Scores untouched.

### 2026-10-07 — Club Admin setup steps still showed rounded coloured buttons
- Banking alone opted into connected steps; other setup pages retained default pills. ClubAdmin now provides a presentation-only scope selecting connected steps throughout its workspace, with responsive grids for different step counts. Shared association consumers retain pills; callbacks, fields and permissions unchanged. Preview only.

### 2026-10-07 — Club Admin light/dark contrast
- Global muted text and translucent court surfaces made menu descriptions/content hard to read, especially in dark mode. Added local Club Admin semantic text/surface tokens, near-opaque photo wash, readable disabled/placeholders and switch boundaries; Features readiness uses semantic status colours. Removed local locked-fieldset fading and made navigation hover neutral. Navigation order, coloured icons, callbacks, permissions and live data remain unchanged. Preview only.
- Validation: 13 focused regressions pass; signed-in Riverside desktop/mobile Features/navigation, Banking and Settings checked in both themes with no text contrast failures, horizontal overflow or runtime errors. Token tests cover selected/disabled text and 3:1 input boundaries. No native/config/backend changes; not published.

### 2026-10-07 — Member home mobile-first first pass
- Removed duplicate Account/Profile tiles on phone; Courts/Bar/Events tiles remain only when the existing permanent shortcut does not supply that destination. Desktop retains destinations because its bottom navigation is absent. Main Help & Tutorials tiles replaced with an opt-in, labelled 44px PageHeader help icon opening the same /help screen. Club Admin permission expression unchanged.
- My Stats precedes the phone feature grid and desktop quick access; phone rankings follow the features. Existing stats/history data hooks and filters unchanged; larger semantic Button touch targets. Club Controls remain dynamic, prominent and unchanged; no hardware actions exercised.
- Local member-home/club-bottom-nav tokens preserve colourful features and improve light/dark secondary-text/icon contrast; active shortcuts have an outlined tint and heavier icon/label. Association bottom-nav styling stays unchanged; no Club Admin pattern reused.
- Validation: signed-in Riverside light/dark at 320/390/768/1280px, no horizontal overflow; Courts, Account, Profile, six feature destinations, Help and stats season/history exercised with no runtime errors. Existing localhost navigation drops ?club=riverside and resets club context on Bar; original link target verified and Bar page checked with explicit approved-club query. No routing/permission/domain/data changes. PWA safe areas retained; native config unchanged and native hardware not tested. Preview only, not published.

### 2026-10-07 — Compact member mobile device controls
- Mobile dashboard opts into wrapping, touch-sized device buttons with device names and Open / Turn On / Turn Off actions. Manual actions now have a cancellable confirmation (previous controls executed immediately). Existing command hooks, geofence auto-unlock, age/role/visibility restrictions, Bluetooth rescue and booking-only court-light billing remain unchanged; desktop keeps its existing controls.
- Validation: 38 focused regressions passed, including confirmed main-door/registry actions, cancellation, toggle state updates and hidden devices. Signed-in Riverside has no visible manual controls, so phone visual/confirmation checks used browser-only sample devices at 320/390px in both themes, with hardware requests blocked: no overflow, touch targets at least 44px, no runtime errors or device commands. Real hardware actuation and native builds were intentionally not tested. Preview only; no data/configuration/backend changes or publication.

## 2026-10-07 — Member dashboard Club Controls: compact smart-home controls
- Mobile compact mode now renders round push/toggle buttons (56px) with the device name below, wrapping side-by-side; full-width cards removed.
- Stateful devices: green border/tint = On, red = Off, grey "Unavailable" when the device reports an error (off is never shown as unreachable).
- Momentary/access devices flash green ~2.5s on success, then return to rest; confirmation dialog, permissions, BLE rescue, geofence and desktop rows unchanged.
- Tests: src/test/dashboard-device-controls.test.tsx (13) pass. Preview only, not published.

### 2026-10-08 — Uitsig: Google signup skipped existing-member check; erroneous import SSA/NSA charges
- Cause: Google/Apple signups go straight to the signup steps (`MemberOnboardingWizard`), which created the membership row and R200 Registration with no duplicate guard. A "Michiel Philip Heyns" application slipped past existing "Michiel Heyns" records.
- Fix: the wizard now calls `useDuplicateGuard` (first + last name, cell) before any row or fee insert. A source test enforces that order.
- Data: 46 SSA R300/NSA R160 postings from the 30 Aug 2026 import (23 members, R10,580, no fee lines, no payments) were reversed with linked reversing journals plus audit_events (`reverse_erroneous_import_fees`). The originals are kept.
- Open: the pending Heyns application and its R200 stay untouched until the club confirms identity (its ID number and cell differ from the existing member's).
- Resolved 2026-10-08: the pending "Michiel Philip Heyns" signup was the son (age 17 from ID), not the father. His Google login, ID, cell and email were moved onto UITS3543 (Michiel Jnr Heyns). The duplicate row was set to resigned and kept, its person record marked merged, and the R200 reversed with a linked journal. Father UITS2970 was untouched and is now alone on the old login. Audit action: `resolve_duplicate_signup`.

## 2026-10-08 Court Booking Rules: opt-in peak late-cancel restriction and penalties
Added separate Peak Hours card (Edit/Save/Cancel), member events moved to section 3, booking-hours summary, opt-in restriction/penalty card, admin no-show confirmation and waivers. All clubs default OFF / R0.

## 2026-10-08 — View-only court display: existing P peak indicator
- Extracted the booking table's existing P marker into PeakTimeIndicator; same size, amber colours and top-right placement. Both grids reuse isPeakSlot and the club's weekday/weekend/day overrides. Token-scoped court_display_board now includes only the existing peak settings; no stored data, permissions, penalties or booking actions changed.
- Validation: 15 focused tests passed, covering seven weekdays and 30/40/45/60-minute slots; sample display checked at 1280/1366/390/320px with 12 markers across four courts and no runtime errors. Both active display tokens return matching saved peak settings. Riverside has no active display token, so live browser token check unavailable without creating data. Preview build OK; not published; native configuration unchanged.

## 2026-10-08 — View-only court display: header sign-in notice
- Added a small, muted, horizontally centred line under the club row in the display header: "View only — To make changes to your booking, please log in to the SquashHub app." (11px phone / 14px desktop, muted foreground).
- Header is now a two-row card: existing logo/club name/clock/full-screen row unchanged, notice below. Peak P markers, booking rules, penalties and permissions untouched.
- Validation: courts-display-peak.test.tsx (6) passes, including the notice; Uitsig display token checked live at 1280x1800, 1280x800, 390x844 and 360x740 — notice centred (0px offset), single line on desktop, two lines on phone, no clipping/overlap, 20 peak markers, no console errors. Preview only, not published.

## 2026-10-08 Bar/Shop "Allow member account to go into debit"
Separate Bar and Shop switches (default on). When off, account charges that would exceed the booking-gate allowance (credit + fees under active monthly mandate) are refused server-side; nothing posted. Tests: src/test/account-charge-gate.test.ts; rolled-back backend test on Riverside.

## 2026-10-08 Treasurer approval link lands on dashboard (Nelspruit)
Causes: (1) right after sign-in the permission check ran before member details loaded and bounced non-admin finance staff to /dashboard; (2) email link opened the Finance hub, not the payment; (3) approve/reject and pending reads were admin-only server-side, so Treasurers could not act. Fix: MemberContext loading key, deep link ?view=pending&tx=, RPC finance_decide_member_transaction (finance permission, row lock, pending-only, audit_events), finance read policy. Not fixed: rest of Club Books reads remain admin-only; post_journal has no caller permission check.

## 2026-10-08 — View-only court display: notice legibility
- Raised the sign-in notice to 12px phone / 14px desktop at medium weight and switched it from muted foreground to the shared accent token (text-accent), the same colour as the header clock. Wording, centring and header layout unchanged.
- Validation: Uitsig token live at 1280x1800 and 390x844 — notice computed colour rgb(249,169,31) identical to the clock, centred 0px offset, one line desktop / two lines phone, no overlap, no console errors, peak P markers intact; courts-display-peak.test.tsx (6) passes. Preview only, not published.

### 2026-10-08 Bar/Shop early account warning
- Member Bar basket (Buy + My Tab) and admin Add Charge show "Your member account cannot be charged..." as the basket changes when the Bar/Shop no-debit switch would refuse it (same court-booking allowance rule). Final ACCOUNT_LIMIT refusals now stay until dismissed. `member_account_gate` no longer directly callable by signed-in users; new guarded `bar_account_charge_preview`.

### 2026-10-08 Sidebar personalisation
Bar / POS moved after Club Books in Club Admin. Users can reorder/hide their own permitted menu items (main side menu + Club Admin) via Edit menu; stored per user/club; display only.

### 2026-10-08 — Platform updates "all clubs" audience matched no admins
send-platform-update filtered club_members by ~800 club IDs, overflowing the request URL and returning no rows. Fix: skip the club filter when audience_type = all.

## 2026-10-09 — Round-draw email "VIEW TOURNAMENT & SCORE MATCH" button
- `email-notifications` (type `tournament_round_draw`) now links to the tournament's existing overall Match Day link (`/md/<token>`, same as the QR "All Courts" link) via `_shared/match-day-cta.ts`; falls back to `/club-champs/<id>` when Match Day Access is off. Queued (outbox) sends recover the tournament from the recipient's latest round-draw notification.
- `/md/<token>` shows a signed-in participant their own next match (own session, checked before anonymous device mode) with a button into the normal signed-in tournament page. No new token, route or scoring path.
- Tests: `src/test/match-day-draw-cta.test.ts`.

## 2026-10-09 — Entry-confirmed email: second "View tournament & score match" button
- `tournament_paid` (entry confirmed) emails keep "Open in SquashHub" and gain a second button via new `resolveEntryTournamentCta`: the same permanent destination the Match Day QR encodes (`/md/<token>`, fallback `/club-champs/<id>`), reusing `resolveTournamentDestination` extracted from `resolveDrawCta` — no new URL per email.
- `club-notification.tsx` template gains optional `secondaryUrl`/`secondaryLabel` (outline button) so the second button also renders on the platform sender (no club SMTP / SMTP fallback); other template senders unaffected.
- Text versions append the second link; queued outbox sends resolve the champ from the `/club-champs/<id>` URL. Code only — edge functions not yet deployed (awaiting approval, together with the draw-email CTA).

## 2026-10-09 — "Tournament link & QR" tab repeated the draw step
- `StepTournamentManagement.tsx`: the stage card (draw/fixture generation, "Revisiting Generate draw & fixtures" banner, deferred stage dates, draw notification wording) is now rendered only when `qrOpen` is false, so the new link & QR tab shows the Match Day Access card alone; the lifecycle pill row and the Entries & payment status / Decided later summary stay visible.
- Clicking any stage pill sets `qrOpen` false, so the draw step returns unchanged. No routing, permission or Match Day Access behaviour change; the tab remains reachable at every lifecycle stage.
- Verified signed-in Riverside "club champs": link & QR tab shows Match Day Access only (draw action panel 0, "Revisiting" banner 0), clicking the "Generate draw & fixtures" pill restores the panel (1) and clears the pressed link tab.

## 2026-10-09 — WhatsApp club notice opening line shortened
- Willem: the WhatsApp notice opens "Update from Riverside Squash Club about your club account:" — drop "about your club account" and leave just "Update from Riverside Squash Club".
- The wording is not in the app: it is the Meta-approved WhatsApp message template `club_notice` (`public.whatsapp_templates`, Twilio Content `HX1e52bdf178cdb53fb3b07a19a3167b41`, friendly_name `squashhub_club_notice_v4`). Meta does not allow an approved template to be edited in place, so a new version was registered instead: key `club_notice_v5`, friendly_name `squashhub_club_notice_v5`, body `Update from *{{1}}*:` + message + link + "Thank you." (Content `HXf5e0bb4ea8c9a00acb2156672739e209`, category UTILITY, submitted for Meta review 2026-10-09, status `received`).
- Sends keep using the approved v4 wording until the cutover. Every caller (`send-comms-campaign`, `send-whatsapp` fallback, `DebitOrdersPanel`) resolves `template_key: "club_notice"`, so switching over is one row update on key `club_notice` (body + content_sid + friendly_name) once Meta approves — no code change, no deploy.
- `src/components/club-admin/DebitOrdersPanel.tsx`: the admin WhatsApp preview line now matches the new wording.

## 2026-10-09 — Stock purchase picker mouse-wheel scrolling
- The invoice dialog's scroll lock treated the non-modal, portalled product list as outside the dialog, blocking mouse-wheel scrolling despite a working scrollbar. The purchase picker now uses a modal popover so its list belongs to the active scroll-lock scope. Search, filters, item selection and purchase writes are unchanged; preview only.

## 2026-10-09 — WhatsApp "Pay my fee" tappable button for outstanding fees
- Willem: WhatsApp messages show the pay link as plain green text — members should get a tappable button instead. Constraint: a cold WhatsApp message must use a Meta-approved template, and a URL button's link needs one fixed base address with only a personal suffix as a variable, so the per-club subdomain links cannot be the button target.
- Migration `0110_whatsapp_pay_button_template`: `whatsapp_templates.url_button` jsonb column (default `[]`) + new template row `club_notice_pay` (friendly_name `squashhub_club_notice_pay`): body `Update from *{{1}}*:\n\n{{2}}\n\nThank you.` (variables club/message/pay_token), url_button `[{"type":"URL","title":"Pay my fee","url":"https://squashhub.co.za/i/{{3}}"}]`. Created on Twilio and submitted to Meta 2026-10-09 (status `received`, review up to ~48h).
- `whatsapp-templates-sync`: url_button rows build a `twilio/call-to-action` content type; variable sample scanning includes `{{n}}` inside button URLs.
- `send-comms-campaign`: WhatsApp recipients carrying a `pay_token` use `club_notice_pay` once Meta approves it (message keeps the md/ tournament link as text; only one dynamic URL button per message). Until approval — and for any send-whatsapp fallback — the pay link is appended to the message as plain text, exactly as before. SMS always appends the link as text (no buttons).
- `draw-notice.ts` + `step-handover.ts` (`sendInform`): for owing players the pay link moves out of `personal_message_plain` into per-recipient `pay_link` + `pay_token` (the `/i/<token>` invite token); entry notifications now fetch the personal links for WhatsApp/SMS too (previously email-only), so those messages gain the pay link/button.
- Button target verified: root-host `/i/<token>` resolves the member's club and shows the entry with "Payment outstanding" and Pay online/EFT options, no login needed. Tests updated (`draw-notice-delivery.test.ts`); edge functions `whatsapp-templates-sync` + `send-comms-campaign` deployed live.

## 2026-10-09 — Riverside Stitch payment parked on express.stitch.money/pay/complete
- Evidence: since 6 Oct every nsc link carries `?redirect_url=https://nsc.squashhub.co.za/my-account` and returns members. Riverside's 9 Oct tournament link was bare. Probe: bare link 200, `?redirect_url=https://riverside.squashhub.co.za/my-account` 404. Stitch refuses the address because Riverside's own Stitch Redirect URL list does not include it, so the probe falls back to the bare link.
- Not a code regression. Fix: register `https://riverside.squashhub.co.za/my-account` (and `/*`) in Riverside's Stitch Express dashboard. Added `RETURN_URL_MISSING` error logs + `metadata.return_missing` on sessions, plus `src/test/stitch-return-url.test.ts`.

### 2026-10-09 — Gordon's Bay Main door showed "Unavailable" after it was back online
- Cause: the Main door opens through `shelly-door-trigger`, but its registered `club_devices` row only had `last_error` set/cleared by `device-control`. An Oct 6 offline error stayed on the row; when the near-door-only button was hidden, the device row rendered as a disabled "Unavailable" button.
- Fix: `shelly-door-trigger` clears `last_error` on the matching access device after a confirmed pulse (deployed); compact device buttons stay tappable when showing a stored error (preview). Verified cleared after a real open on 2026-10-09 16:00 UTC.

### 2026-10-10 — Odd pool showed "vs Unknown" instead of "vs BYE"
- Cause: an odd-sized pool leaves one player without an opponent. `engine-service.ts` (`swissFirstRound`, and the pool generators) pushes `[bye, null]` pairs straight into the fixture rows, and `structured-persist.ts` never writes `is_bye` for them. The games list resolved the empty side through `getName(null)` → "Unknown". Riverside's club champs Mens B (29 entries) is the live example.
- Fix: `src/lib/tournaments/bye-side.ts` — `isByeFixture(m)` treats a row with exactly one side filled and no placeholder text as a bye. Used by `Tournaments.tsx` (`sideLabel` now takes the row), `ClubChampsView.tsx` (team names + member "My Schedule") and `ChampSchedulePreview.tsx`. Placeholder slots ("Winner QF1", "Empty slot") and empty bracket rows are still not byes. Tests: `src/test/bye-side.test.ts` (6). Verified in preview: row reads "Wynand Anderson vs BYE", zero "Unknown" on the page. Presentation only — no stored row changed.
### 2026-10-10 — Removed the "Decide these first" callout on Tournament Management
- Asked for: Willem saw the red "Decide these first (you chose \"Decide later\")" box while revisiting **Generate draw & fixtures** on a running tournament and asked for it to be removed.
- Cause: `StepTournamentManagement.tsx` rendered a `blockersFor(h, shown)` callout on every stage. It duplicated information that is already enforced where it matters: Finalise shows "Blocked because: … is still \"Decide later\"" with the Generate button disabled (and `nextAction` explains it), the Invite/Inform buttons are disabled by the same list, and the "Decided later — coming up" panel lists outstanding items. On a completed stage it was pure noise.
- Fix: removed that callout (`src/components/smart-builder/StepTournamentManagement.tsx`). The disabled Invite button now carries the reason as its tooltip so a blocked button is never unexplained. `blockers` still gates Finalise. Test updated: `src/test/step-builder-handover.test.tsx` now asserts the "Blocked because … Seeding" explanation instead of the removed box. Verified in preview (Riverside club champs, revisiting Generate draw & fixtures): no "Decide these first" / "Decide now in setup"; revisiting banner, Scheduling preferences, "Schedule fits", draw notification wording and draw controls all intact.

## 2026-10-10 — Swiss standings disagreed with Swiss pairing (Riverside Men's A)
- Cause: standings page ranked structured Swiss groups by games won (Pts = sets won) because the tournament kept legacy `scoring_mode=standard`; pairing used match wins. "Pool winner" shown after round 1.
- Fix: shared `swissTable` used by the page and `nextSwissRound`; Swiss detected per stage; "Current leader" until the last Swiss round is complete; tie-break picker in Stage Builder; tests `src/test/swiss-standings-agreement.test.ts`. No data changed.
- 2026-10-10 follow-up: Swiss round gate (one round at a time, progress message, admin confirm, server trigger `guard_swiss_round_progression`, tests `src/test/swiss-round-gate.test.ts`).

- 2026-10-10 Swiss Round 2 not offered in Manage Tournament: Generate Round button only lived in the collapsed admin card on the draw page; added StepSwissRoundsPanel (per-category Set up / Generate Round N Draw, detects saved round schedule). Mens B bye (null opponent, status scheduled) counts as final.
- 2026-10-10 No "Send draw to players now?" after Swiss Round 2: new Generate Round N Draw path never prompted and the saved draw_notify setting was never read (Round 1 path always asked). Added DrawNoticeDialog per category+round, draw_notices log, Sent/Resend.

## 2026-10-10 — Tournaments Standings tab: auto-open single tournament (replaces inline embed)
- Problem: inline embedding of full ClubChampsView inside Tournaments.tsx was unsafe (disabled registration/doubles-pair reads, missing beta_lifecycle, duplicate marker-lock polling, whole 4k-line controller mounted).
- Fix (src/pages/Tournaments.tsx only): removed InlineTournamentStandings/ClubChampsView/DiamondStandings usage from the Standings tab. When exactly one active tournament exists, opening the Standings tab navigates once per session (sessionStorage key sh.autoOpenChamp.<id>) to the existing /club-champs/<id> view with full data/actions. Browser Back returns to Tournaments and shows the compact View Standings card without re-navigating (no loop). Multiple tournaments keep compact cards; zero state unchanged.
- Verified: tsgo clean; 3 regression tests pass; Playwright desktop+mobile Riverside: Standings click → /club-champs/0980bb1e-… with working Standings | Fixtures & Results tabs; Back → compact card, no redirect loop. No data writes; nothing published.

- Pick Players toolbar redesign (preview only): rebuilt toolbar rows in StepByStepBuilder.tsx; pending visual verification at three widths because the reachable draft had no picked players.

### 2026-10-10 — Swiss → Quarterfinal transition shown as "Set up Round 6" (Riverside Club Champs, Men's A)
- Root cause: Setup was changed after the draw to 5 Swiss rounds + Quarterfinal → Semifinal (qualification/pairing "Decide later"). The live draw (`builder_spec` + `tournament_stages.config`) still holds `swissRounds: 6`; QF/SF are saved only as Define-later `deferredStages`, which the engine unlocks after the LAST live Swiss round (6). The server `set_spec` op is append-only and refuses changing an existing stage, so a setup edit can't shorten a started Swiss stage. The Swiss panel only read the live round count.
- Fix (UI only): `swissTransition` in `src/lib/tournaments/swiss-progress.ts` compares setup's plan with the live draw once a round is complete → `plan_conflict` (live_rounds / setup_rounds / not_in_draw) or `playoffs` hand-over; `StepSwissRoundsPanel` shows the conflict with "Review stage plan in setup" and an explicit "Keep 6 rounds — Set up/Generate Round 6". Nothing is skipped or generated automatically. Tests: `src/test/swiss-progress.test.ts`.
- Open: ending a started Swiss stage early needs a new audited server op; QF seeding from Swiss must use Swiss standings (Buchholz/SB) — current play-off ranking (`rankSourcePools`) uses generic pool tie-breaks and `checkDeferredSetup` rejects knockout-from-Swiss.

### 2026-10-11 — Manage Tournament completed Swiss next action
- Presentation-only bridge: StepTournamentManagement → StepRunOverview → StageProgressPanel supplies lifecycle statuses and its existing setup/confirmation dialog opener to StepSwissRoundsPanel. Promoted Swiss stage actions replace duplicate stage buttons, with no new queries or generator logic.
- Completed Swiss categories show qualification completion, configured next-stage name, primary Generate [stage] Draw and View Swiss standings. Initial click only opens existing preflight/setup; blocked/active/waiting/completed next stages cannot be generated. Completed-round send/resend + saved last-send details are collapsed under Previous round notifications; ongoing category controls remain unchanged.
- Verified Riverside fresh signed-in session: Men's A 5/5, 8/8 final → Set up Quarterfinal dialog; Men's B R2 ongoing; Men's C/Ladies R2 actions retained. Desktop and 390px mobile screenshots inspected; no horizontal overflow. All write/function calls blocked during browser checks (including pre-existing admin entrant reconciliation); no creation/send action clicked, no data changed or publishing.
- 49 focused tests pass (Swiss next-action UI, existing-dialog bridge, Swiss progress/shorten, stage transition). Wider playoff-progression suite has 3 failures in cross-league doubles qualification ties; no competition-code changes made in this task. Existing QF setup has pairing unset and must be resolved in the reused dialog; defaults are not an approved eight-player QF bracket. RR/other transitions keep existing stage controls. Saved notification history remains the existing last-send timestamp/count, not a new full delivery-log viewer.

### 2026-10-11 — Step-by-Step Beta: stale device copy overwrote saved picks
- Symptom: Uitsig picks repeatedly reverted to 71/74 after edits saved elsewhere.
- Cause: on Edit setup, a device-local plan won over `tournaments.beta_lifecycle.answers` and was pushed back to the server on open.
- Fix: `StepByStepBuilder.tsx` always reads the saved answers first when editing; server copy wins; local copy only published when the tournament has none; autosave waits until that read completes.

### 2026-10-11 — Unpaid entries counted as "invited" despite pay-before-entry = No
- Cause: `derive_champ_registration_statuses` only registered organiser/accepted entries once the fee was settled and never read `club_champs.payment_timing`. Uitsig card showed 26 (rows saved before the fee existed).
- Fix: trigger treats `payment_timing='after_acceptance'` as non-gating (fee stays in `fee_status`); Uitsig rows recomputed (71 registered, all fee due). Card now shows unique players · category entries · paid · outstanding. Riverside club champs (79 affected rows) recomputes on its next row update — not bulk-recomputed.

- 2026-10-11 — Tournament messages: `send-comms-campaign` now delivers to entrants registered via another club (only members with a `club_champs_registrations` row in the host club's own tournament); tournament invitations and draw notices automatically include a personal activation link for players with no login (own-club page, single-use, 14 days).

### 2026-10-11 — Riverside club champs Men's A Swiss→QF config repair (Step 2, approved)
- Live data only (audit_events f1e0308f-…): g1 deferred QF pairing later→seeded, SF later→winners, Final (vmv0p0b27-po3, 26 Nov, courts 20/21/26) added. Guarded on 40/40 completed Swiss games; Men's B/C/Ladies, games, results, fees untouched. QF stage NOT created, no draw generated.
- 2026-10-11 follow-up: Check Draw blocked "finishing positions can only come from a pools / round robin stage… (Swiss rounds is swiss)". `contract.ts mappedIssues` now accepts a Swiss source (one standings table; engine already ranks Swiss via `rankSourcePools`), and `startMappedStage` refuses a Swiss source until all configured rounds are played. Dry run on live Men's A (writes blocked): check clean, 4 seeded QF games. Nothing committed.

### 2026-10-11 — Opponent contact sharing (preview)
- Added opt-in person-level match contact preference (activation, Settings › Privacy & Contact Preferences, entry-form notice), per-fixture opponent contact in My games and ladder challenges, and send-time consent check in draw emails. No consents backfilled; `send-comms-campaign` change not yet deployed. League fixtures not covered (no per-player opponent before lineups).

### 2026-10-11 — Draw notice modal still overflowed (second dialog)
- Cause: the "Send draw to players" button on Generate draw & fixtures opened a SEPARATE legacy dialog in `StepGenerateDrawPanel.tsx` (plain DialogContent, "Not now"/"Send now", its own fee text) that never got the bounded layout; earlier fix only covered `DrawNoticeDialog`, and none of it was published. Also the shared CSS relied on stylesheet order against Tailwind's `grid`/`max-w-lg`/`p-6`.
- Fix: legacy dialog uses the same header/scroll body/pinned footer classes; CSS uses doubled-class specificity, min-height:0, row footer, full-height sheet ≤480px. Browser regression: `scripts/e2e/check_draw_notice_modal.py` + harness `src/test/e2e/draw-modal-harness.tsx`.

### 2026-10-11 — Standings auto-open + Standings | Upcoming Fixtures | Results tabs
- Cause: Standings tab auto-opened only once per browser session (`sh.autoOpenChamp.*` sessionStorage) and then showed a card; the tournament page's tab pair was still `Standings | Fixtures & Results` (3-tab split never implemented), plus between-subcategory and cross-league layouts had their own combined lists.
- Fix: choosing Standings with exactly one current tournament navigates to `/club-champs/:id?view=standings` (user action, no load-time redirect, Back safe); `ClubChampsView` (shared by app and QR `/md/:token/t`) has three tabs with `?view=standings|upcoming|results`; `src/lib/tournaments/fixture-split.ts` puts every game in exactly one list; other layouts use the same split; unscheduled rows show "Date TBC"/"TBC".

### 2026-10-11 — Tournament entry card trusted the "on account" flag alone
Riverside Willem R34 entry showed "charged to member account" from `fee_settled_via` only; linked charge (fee_payment_id) is R100, listed unpaid, though the ledger holds a matching R100 bank receipt. Fix (preview): `src/lib/tournaments/entry-fee-state.ts` derives state from entry + linked charge; card shows charge amount/mismatch, "no matching charge" when unbacked, hides "I've already paid" unless genuinely unpaid, refreshes the charge with the entry. No data changed.

### 2026-10-12 — "This is not your game" alert scared players off
- Cause: scoring a game you are not playing in was gated by a browser `window.confirm` reading "This is not your game. Are you sure you want to enter the result?" with generic OK/Cancel buttons, so players backed out instead of carrying on.
- Fix (preview): new `src/components/tournaments/EnterResultConfirmDialog.tsx` asks "Do you want to enter the result for this game?", names the two sides, and offers "Yes, proceed" / "No, cancel". Wired into `Tournaments.tsx` and `ClubChampsView.tsx` (replacing both `window.confirm` calls); permission checks, trigger condition and the save path are unchanged. Tests: `src/test/enter-result-confirm.test.tsx`.

### 2026-10-12 — Diamond League standings flashed "Registration pending"
- Cause: ClubChampsView rendered the Registration pending card (no groups) before/while the Diamond event lookup loaded; Diamond events never have groups. 72 Diamond League 2026 registrations had registration_status=registered but legacy status=invited.
- Fix: card hidden while the Diamond lookup loads and for Diamond events; other tournaments unchanged. Live data (user-requested): legacy status synced to `paid` (free-tournament convention) for the 72 registered rows; Andre Smith and Jacques Smith left Invited. No fees/fixtures/results changed; not published.

- 2026-10-12 — duplicate self-applications (Dino De Sousa, CBCTUT: NSF4304 + pending CBT0009, same email). Cause: BEFORE INSERT triggers fire alphabetically, so `club_members_block_duplicate` and `ensure_person_for_club_member` ran before `fill_club_member_email_from_auth` and saw no email; the duplicate check also required an exact name match. Fix (migration block_duplicate_self_applications_by_email): both functions resolve the login email themselves; self-applications are blocked when the same login or same email already has a non-visitor record at the club (families allowed when both have different 13-digit SA IDs); person lookup also reuses the login's existing person record.

- 2026-10-12 — Step-by-Step Beta missing per-tournament 'Affect club ladder' switch. Cause: only the Current Builder exposed `tournaments.ladder_affects`; Beta tournaments saved NULL and silently inherited the club setting (ON by default). Also `award_points_for_champ_match` used COALESCE(tournament, club) so a tournament ON could bypass a club OFF (0 rows affected). Fix: Summary step switch (new = OFF, edits untouched unless changed, disabled when club disallows); `ladderAffectsPatch`/`clubAllowsTournamentLadder` in step-handover.ts; trigger now lets club OFF win (NULL keeps legacy inherit). Timing unchanged (per confirmed singles match). Tests: src/test/step-ladder-affects.test.ts.

- 2026-10-12: Category court choices ignored (Riverside). Greedy wave packer let the first category take every court, so a "Required" court rule could not fit and placement fell back to ignoring all preferences. `pack` now gives chosen courts to their category first and lends them only when needed. Test: scheduling-prefs-court-keep.test.ts.

### 2026-10-13 — Fixtures and standings still showed PAR 11 for every category
- Cause: both architecture reads requested `scoring_mode`, `points_per_game`, and `best_of` from `tournaments`, where those columns do not exist (they belong to `club_champs`). The rejected reads lost all saved per-category settings, leaving the legacy PAR 11 fallback.
- Fix: request only existing setup columns, retain tournament-wide fallback from `club_champs`, surface standings query errors, and version both query keys to replace cached pre-fix results. Regression covers all eight saved category/subcategory scoring labels. Presentation-only; no live setup, fixtures, results, backend changes or publishing.

- 2026-10-13: Tournament invite "Manage fee" lacked a clear "I have already paid" choice (only hidden in the EFT label). Added a separate button on InvitePaymentChooser that records a pending EFT for admin approval with proof upload — never marks paid.

- 2026-10-13: The invite "I have already paid" flow required proof-of-payment upload. Made upload optional (button label "(optional)", wording invites but does not require it) on InvitePaymentChooser; in-app ReportPaymentDialog was already optional. Never marks paid either way.

### 2026-10-13 — Duplicate pending member on sign-up with shared/existing email
- Symptom: Uitsig sign-up (cipcworkforce@gmail.com) created a new pending "Hendrik Earle" (UIT0024) although existing rows UITS2588/UIT0002 already had that email.
- Cause: `handle_new_user` inserts the profile first; the profile trigger already linked the existing club_members rows, so the later email fallback updated 0 rows and the "create membership" branch inserted a duplicate.
- Fix: the create branch now skips when this login is already linked to a member of the club or the club already has a member with that email. Duplicate UIT0024 removed (no attached records).
- Follow-up: the "New member" sign-up form never checked email — its duplicate guard only matched name + cell. It now calls `existing_member_signup_status` first and shows "There's already a member with this email — is it you?" (sign in / claim existing membership, or continue as a family member sharing the email).

### 2026-10-13 — Uitsig Champs: fees raised for all entrants; invite "already paid" → claims queue
- Raised R100 entry fee (via `ensure_tournament_entry_fee`) for 67 organiser-entered regs with no fee row; paid/on-account/cancelled untouched.
- `invite_settle_entry`: confirmed organiser-entered (`invited` + `confirmed_at`) may pay; new `already_paid` method creates a `champ_payment_claims` row (reported) approved in Tournament registrations → fees panel. `invite-upload-proof` attaches proof to the open claim.

### 2026-10-13 — Champs match booking still showed all times
- Symptom: players opening "Make your court booking" from tournament fixtures saw every court/time instead of only the reserved Club Championships slots.
- Cause: Champs-only mode was skipped for anyone with organiser/champs rights (`canManage`), and the full picker rendered while the reserved-slot query was still loading.
- Fix: `ScheduleMatchDialog` now starts in Champs-only mode for everyone while reserved holds exist; organisers get an explicit "show all courts and times" toggle; the full picker waits for the reserved-slot check.

## 2026-10-13 — Champs singles result counted twice in member stats
- Cause: `save_marker_match_result` writes a flat `matches` copy plus the `club_champs_matches` result; `get_member_match_history` only skipped that copy for doubles.
- Fix: skip the flat copy for singles too (same players + score, within ±60 days of the champ date); removed Gerhard Fourie's extra copy; refreshed stats cache for all players with completed champ results.

## 2026-10-13 — No search on the bar Items & prices screen
- Cause: `ItemManager` (Club Admin → Bar POS → Items & prices) rendered every division/category group with no text filter; only Stock Levels had one. With 288 live items a club could not find an item without scrolling.
- Fix: added a search box that narrows the list by name, category label, product group, variant label, division or barcode (display only — saving, counts and stock are untouched); the header count follows the filter and a "no items match" hint appears when nothing does. Verified in preview as Willem at Uitsig: brandy 1, coke 5, "zzzznothing" 0, cleared 288.
- Follow-up: the staff/customer menu screens (laptop POS, phone QR page) still have no search — offered, awaiting owner.

## 2026-10-13 — Test bar tabs cleared at Uitsig (data cleanup, no code change)
- "Test Guest" (opened while checking the new cell-number field) had no lines — closed and removed.
- "Willem test guest" (+27833759003) held 8 unpaid QR lines totalling R216. Owner chose "cancel items, return stock": the 8 `bar_visitor_sales` rows were deleted (all `on_tab`, so no journal entry existed to unpost), the tab row removed, and stock returned with an `adjustment` movement each — Whiskey +4 tots, Chocolates +1, Vodka +4 tots, KWV 5 Years +2 tots, Klipdrift Premium +3 tots, Coke Bulk +250 ml.
- Verified afterwards: 0 sales left against the tab, no open tabs at Uitsig, stock counts back to pre-test values (Chocolates 107, Coke Bulk 523 250 ml, Klipdrift Premium 377 tots, KWV 5 Years 84 tots, Vodka 13 tots, Whiskey 19 tots).

## 2026-10-14 — "30 min match" label on the Champs booking dialog
- Symptom: the bottom of "Make your court booking" showed a `30 min match` pill. Reserved Champs slots are 45 minutes and the booking takes the whole slot, so the label was wrong and confusing (owner asked for it removed).
- Fix: `ScheduleMatchDialog` no longer renders the duration badge; the row now only appears when a court/time is already booked, holding the "Clear court & time" action (right-aligned). Booking length logic is untouched — `duration` still drives availability checks and the booked slot length.
- Frontend only: preview until published.

### 2026-10-14 — Fixed-position Swiss full-draw pilot
- 2026-10-14 Riverside calendar spectator scores: LIVE comes from marker-lock presence independently of match score persistence. Cards/details now explicitly show "Live · score pending" when no score exists, identify A/B score order, apply scoped canonical match updates immediately without losing hydrated names/courts, and use the existing spectator's 5-second safety poll. Ndlovu fixture was already completed (A/B 0–3) on read-only inspection; no active live marker available to reproduce original screenshot. Initial-load deadline/retry retained; no marker writes, results, bookings, permissions or publishing changed.
- Symptom: owner needs whole positional draw generated up front, names resolved from results.
- Fix: `swiss-positional-draw.ts` (generate once, resolve, record, schedule, conflicts); table `swiss_positional_pilot_draws` (migration 0142) with freeze trigger + idempotent result RPC; page `/admin/tournaments/positional-swiss-pilot` (synthetic entrants).
- Guard: `src/test/swiss-positional-draw.test.ts` (8–32, byes, progression, TBD labels, 10/15/24 rounds, scheduling conflicts). Live Club Champs untouched.

### 2026-10-14 — Per-match proposed slots for positional Swiss
- Symptom: Round 2+ showed only "Round window" per match.
- Finding: Riverside stage schedules save only roundDates; daily window (18:00–20:00), 30-min match length and courts live on `tournaments`; the score-based engine creates no Round 2+ rows, so nothing carried a time/court.
- Fix: `timeSlots`/`slotOnlyDraw` + `scheduleDraws` lay out PROPOSED per-match slots tournament-wide in the Riverside preview; pilot page gains per-match edit, clash checks and confirmed-only court reservations (`sbs:pswiss-<drawId>:` external ids).

- 2026-10-14 Swiss positional preview (Riverside pilot): proposed rounds stayed TBD because preview never projected saved results by design. Added read-only projection (winner→lower slot, loser→higher, only from completed saved matches whose players match the template pair) and games-won summary (3–1) in grid Result column. No engine/data changes.

### 2026-10-14 — Mark Game stuck on "Loading saved tournament score…", refresh shows empty setup
- Symptom: tapping Mark Game on a tournament fixture spun forever; a refresh opened the manual "select players" screen with nothing selected.
- Permissions checked: club_champs_matches / tournaments / tournament_rules / champ_marker_locks read policies allow club members and tournament officials; signed-in Riverside reads succeeded. Not a permission problem.
- Root cause (race): `MatchMarker` briefly rendered `MarkerSetup` before its loader set "loading". `MarkerSetup`'s deep-link prefill strips `source`/`matchId` from the address (synchronously when the match is already in its cached list). The address change cancelled `MatchMarker`'s loader (and its deadline) without resetting state → endless spinner; refresh then had a bare `/match-marker` URL → empty setup.
- Fix: `MatchMarker` shows the loading view (never `MarkerSetup`) while a tournament link is pending; a cancelled load resets to idle; the 20 s read deadline + Retry now applies to all clubs. Regression test in `src/test/marker-load-deadline.test.ts`.

## 2026-10-15 — Tournament page silently hid member actions without identity
- **Issue:** A member opening a tournament link without a resolved club context (or with a lost session) saw fixtures but no "Book court" / "Enter result" on their own matches — no warning, looked like the option was removed (reported via Kelsey, Uitsig).
- **Root cause:** `ClubChampsView` derives `myMemberId` from MemberContext, which needs the club context; without it every member action hides silently. Logged-out visitors are redirected to /auth, so the real-world case is a signed-in user with missing club context.
- **Fix:** `src/pages/ClubChampsView.tsx` — amber notice at the top of Upcoming Fixtures when the viewer has no member identity: logged-out users get a "Log in" link; logged-in users without a loaded member profile get guidance to open via their club's app/menu or re-login.
- **Verified:** Playwright mobile checks — logged-out redirects to login; Kelsey logged in with correct club sees Book court and no notice; logged in with missing club context sees the notice and no Book court. No data changes.

- 2026-10-15 — Tournament Games "Upcoming" list hid scheduled fixtures whose saved date had passed without a result (e.g. Uitsig Naude v Langeveld, 14 Oct), so they vanished from both Upcoming and Past. `src/pages/Tournaments.tsx` now keeps past-dated, unscored, non-bye scheduled fixtures in Upcoming with an "Overdue · no result" badge until scored or rescheduled. Court grid already renders past bookings (under the booker's name). All clubs.
- 2026-10-15 — Tournament Book court silently hid times that overlapped a player's own existing booking (Uitsig: Duane Rossouw's GoBook 18:00 booking pushed his match to 18:45). `ScheduleMatchDialog` now lists the players' clashing bookings for the chosen day and explains that overlapping times are hidden until that booking is cancelled. Applies to every tournament fixture at every club; no booking behaviour changed.

### 2026-10-15 — Draw notification modes (Automatic / Prompt me to send / Off)
- Per-fixture state on `club_champs_matches` (migration 0143) set by trigger when both players become known; Automatic sends in-app/email immediately (WhatsApp/SMS queued until an admin opens Tournament Management); Prompt shows `FixtureDrawNoticePrompt` with Send / Later; Off never sends or prompts. Existing round-level sends mark their fixtures notified. Dry-run verified in a rolled-back transaction.

## 2026-10-15 — Re-scheduling an existing round (timed <-> Play by date)
- No flow existed to change an existing round's scheduling after fixtures were drawn. Added `admin_set_round_play_by` / `admin_set_round_timed` (migrations 0144/0145), `src/lib/tournaments/round-scheduling.ts` and the Manage Tournament "Round scheduling" editor.
- Play by: deadline applied to round + open matches; only each match's own `champ:<t>:match:<id>` booking is cancelled and released holds restored; block and personal bookings untouched; pairings/results/players untouched. Schedule-change notice (`tournament_schedule_change`) only to players already draw-notified and only when draw mode is not Off.
- Timed: confirmed unscheduled matches placed in tournament hold slots via `self_schedule_champ_match`; shortages reported, never downgraded.
- Follow-up (same day): settings source is `beta_lifecycle.format_plan.stages[]`. Editor is per saved stage with "Save & Apply to Fixtures", "Refresh Fixtures & Log" (idempotent dry-run diff → review → apply) and approval-gated timed proposals (block slots first, then free court time; named/external bookings never used). Migration 0146 makes `admin_set_round_play_by` idempotent (only material changes notify), clears unbooked allocations, keeps players' own bookings in already play-by rounds. Riverside Mens A Round 2 rehearsal (rolled back): 3 open fixtures released, 4 completed kept, bookings unchanged, second run no-op.

### 2026-10-15 — Play by date round still showed TBD / proposed court-time (Riverside R2)
- Cause: `resolveFixtureSchedule` let the spec's original "fixed" stage rule win over a round later switched to Play by date; Swiss positional grid read only the spec/proposed slot plan.
- Fix: applied round rows (`scheduling_mode='self'` + `play_by`) are authoritative (`appliedRoundPlayBy`) in Upcoming headers/fixtures and the Progression grid/calendar (no court shown). No data writes.

### 2026-10-15 — Round scheduling panel stayed "Fixtures in sync" after in-place edits
- Cause: panel read saved settings once from the backend; builder round-card edits were invisible until remount, and timed date/court/time changes were never diffed.
- Fix: `RoundSchedulingEditor` diffs live fixtures against the builder's in-memory stages (stable stage ID, `stageSignature`), shows banner + "Round scheduling changed" toast (Apply / Not now); Apply saves that stage then reuses the reconcile/preview flow. `diffRound.outsideWindow` flags organiser allocations outside the new window; `proposeTimed` re-places them (approval required).

## 2026-10-15 — Uitsig Club Champs 2026 live round scheduling applied (owner-approved)
- Swiss stages (Mens B/C/D, Ladies A): swissRounds 6→5; play-by rounds R2 22 Oct, R3 29 Oct, R4 5 Nov, R5 12 Nov (empty round rows; pairings still generated progressively after each round).
- Ladies B/C R4/R5 moved to 5 Nov / 12 Nov (times/courts kept; no linked bookings).
- Ladies A one-sided R1 match marked bye/free win.
- Round 1 matches, results, bookings untouched. No notifications sent. Match Day guard trigger required a privileged session.

## 2026-10-15 — Linked booking ↔ Play-by match sync
- Backend trigger `sync_champ_match_from_linked_booking` (migrations 0147/0148): when a booking linked via `club_champs_matches.booking_id` is rescheduled, the match date/time/court follow; when cancelled/deleted, the match reverts to Play-by only. Decided matches, pairings, results untouched; never blocks the booking change. Applies all clubs/formats.
- Progression grid shows booked slot + retained Play-by. Bookings page asks which open match when member has several (explicit link, never inferred).
- Super Admin snapshot preview: simulated book/reschedule/cancel (in memory only).

## 2026-10-15 Live Swiss uses fixed-position maps
- `nextSwissRound` now pairs Round 2+ via `fixedPositionRound` (slot templates replayed from seed order); falls back to score-based pairing when the field is outside 8–32 or saved rounds do not match the template. Test: `src/test/swiss-fixed-live.test.ts`.

## 2026-10-15 Per-tournament GoBook block name + 35-min packing
- Courts & Dates has "Block booking name"; fixed rounds use only matching holds (merged across consecutive 45-min rows) and pass `p_fill_hold=false` (migration 0149) so games pack back-to-back. Server still recognises only names starting "Club Championship".

## 2026-10-15 Structure guide: one tournament default format
- Guide step shows a tournament default format selector; categories inherit it unless overridden. Cards show "Using tournament default" / "Override" with Reset. Applying a recommendation equal to the default stores no override (`src/lib/smart-builder/format-default.ts`). Existing saved overrides untouched.
- 2026-10-15: Paid/GoBook bookings can be explicitly linked to a champs fixture (link_booking_to_champ_match); court grid shows linked bookings and position placeholders.

## 2026-10-15 — Uitsig preview-only unified parent Progression & Log
- Inspection: saved `answers.subcats['Mens A']=['1','2']` and `playoffSync=true` identify the two children. Both structured main stages are round robin (three rounds each); the saved parent playoff override requests top-pool qualification, pairing later, placement style, one round. Both children reference the same deferred Final; no playoff fixtures, numeric qualification rule or feeder mapping exists.
- Preview-only Uitsig composition stacks both existing official rankings/matrices, upcoming fixtures and results under one Mens A selector with Progression / Log View tabs, plus one deduplicated deferred Final. No invented seeds, qualifiers, QF/SF, pairings or bracket games; all saved fixture IDs retained. Production hosts and other clubs retain their previous view.
- Verification: 24 focused tests passed; authenticated desktop (1440px) / mobile (390px), both tabs, all 12 unique fixtures (11 upcoming, 1 result), independent Mens B selection, no page overflow/runtime errors or row-write requests. Current preview build OK. Existing unrelated inline-standings source-string test still expects `embeddedChampId` where the page already uses `pilotLayout`; left unchanged.
- Blocker: actual shared playoff participants/feeder paths cannot be displayed until the organiser configures qualification/pairings and the deferred Final. No backend/flag writes, notifications, bookings, engine changes, native changes or publishing.

## 2026-10-15 — Owner-authorised Uitsig R50 knockout test-fee cleanup
- Identified 11 Uitsig-only unpaid, uninvoiced `NSP Knock out entry fee` rows at R50 each, created 14 October. No registration, wallet, payment or visitor-pass links; active Club Champs tournament and fees excluded.
- Removed the exact 11 fee IDs in one guarded data operation; added 22 counterbalancing ledger lines linked to original journal groups and 11 audit records naming the authorisation. Original journal entries retained; no real payments altered or refunds fabricated.
- Read-back: no matching fee rows remain; associated debtors and tournament-income net impact both zero. Signed-in Uitsig Members screen verified the supplied example member's balance R0 rather than R50. No application changes, hardware, messaging or publishing.

## 2026-10-15 — Approved Uitsig parent view publication
- Publishing did not expose the combined Men's A page because its display predicate explicitly rejected production hosts. Owner approved enabling and publishing; removed only the hostname restriction, retaining Uitsig scope and saved parent/playoff association checks. No tournament data, settings, notifications or bookings changed.
- Verification: 5 focused tests pass, build OK, signed-in 1280px/390px Progression and Log View each show 12 unique fixtures and one shared playoff without page overflow. Owner chose publication with the separate security findings left open.

### 2026-10-15 — Uitsig Club Champs RR rounds 3–5 packed into 20–21 Oct
- Symptom: round-robin R3–R5 fixtures all saved on 20/21 Oct despite weekly round play-by dates (29 Oct, 5 Nov, 12 Nov).
- Fix (data, owner-approved): 16 unbooked scheduled fixtures shifted by whole weeks into the week ending their round's play-by date; same weekday/time/court. Backup: `/mnt/documents/uitsig-rr-fixture-times-before-move-2026-10-15.csv`. No bookings, results or draw notices touched.
- Follow-up done: `planTimedSchedule` now plans each round inside its play-by week (test `one-round-per-week.test.ts`).

### 2026-10-15 — CSIR weekly event reminders reached fewer people and had no working Yes/No
- Cause 1: `sync_event_rsvp_to_instances` copies a series-level WhatsApp "No" onto every future occurrence; the reminder job skipped `declined`, so 8 of 12 Thursday Social invitees stopped getting reminders.
- Cause 2: reminders used `club_notice` (view-details link) with no `interaction`, so YES/NO replies were not recorded.
- Fix: reminders ask every occurrence invitee (invited/confirmed/declined) via `rsvp_question` with `interaction.kind = event_instance_rsvp` (target = instance id); `whatsapp-inbound` writes that reply to `club_event_instance_rsvps` for that occurrence only. Opt-outs still respected.

### 2026-10-15 — Planned Format stage planner pilot (Riverside)
Added compact per-category stage planner behind `tournament_stage_planner` (Riverside only). Plan saves are versioned and display-only impact preview; no apply-to-draw yet. Pre-existing failures: StepByStepBuilder tests lack QueryClientProvider (swissPilot hook), plus 9 unrelated suites.

### 2026-10-15 — Bar POS: card machine shown as online payment / "paid" too early
- Cause: customer "Swipe at the club" closed the tab as `closing` (same state as online card) so Counter Mode showed "Waiting for an online card payment"; cart swipe (`record_bar_terminal_sale`) inserted sales as `paid` before any terminal approval; customer saw "Thank you".
- Fix: tabs carry `settled_method` (online | terminal | cash) to both screens; terminal/cash orders stay `awaiting_terminal`/`awaiting_cash` until staff "Confirm card payment received" (`bar_counter_settle_tab`, row-locked, idempotent, records confirmed_by/at + `bar_tab_payment_events`). Staff "Declined / not paid" (`bar_counter_reopen_tab`, reason) and customer cancel (`bar_guest_cancel_counter_payment`) reopen the tab. Cart swipe now creates an awaiting tab. Online flow unchanged (provider verification only). Ledger posts only on confirmation.

### 2026-10-15 — Swiss odd fields: same player got the bye every round
- Cause: fixed-position (SportyHQ-style) template always gives the bye to the last slot, and a bye holder keeps its slot, so e.g. Uitsig Ladies group 6 (9 players) would give Kayla Randall the bye in every round. Live engine (`fixedPositionRound`), preview resolver (`resolveCategoryDraw`) and progression projection (`buildProposedSwissGrid`) all used the raw template.
- Fix: bye fairness in all three — if the bye slot's occupant already had a bye, the bye moves to the lowest slot whose occupant hasn't had one; that slot's opponent plays the old bye slot. Replay accepts both raw and adjusted saved rounds. Even fields unchanged. Test: `swiss-bye-fairness.test.ts`.

### 2026-10-15 — Riverside optional visual structure editor and format-message dismissal
- Added an actual Visual Builder entry on new Riverside preview drafts without selected players; React Flow projects canonical divisions, subdivisions, pools and ordered stages rather than creating another engine. Draggable toolbox, connector handles, editable inspector, layout persistence, validation and reversible Table View share explicit local Save Structure.
- Subdivisions default Group 1/2; pools default Pool A/B, with editable persisted pool names and estimates. Blank initial wizard placeholders are ignored when adding the first canvas division. Custom pool topology resizing is blocked rather than inferred. Format-help messages have a tested X close control.
- Synthetic authenticated Riverside walkthrough exercised toolbox drag/drop, actual connector dragging, node movement, pool rename, RR→Monrad planning, qualification, save, table switching, reload and editable settings; desktop/mobile screenshots captured, no mobile page overflow or browser errors. No backend mutation, fixture generation, bookings/results/payments/messages, Uitsig activation or publishing. Shared multi-path playoff mappings and editing existing tournaments remain outside this draft-only slice.

### 2026-10-15 — Owner-requested Riverside tournament pilot deactivation
- Removed only Riverside club_beta_features rows for tournament_structure_step and tournament_stage_planner, restoring the standard separate setup steps and hiding the experimental row/canvas editor. Existing canonical drafts and all tournament, fixture, booking, result, payment and notification data preserved.
- Shared tournament-view and Swiss switches remain enabled as in Uitsig; no other club settings changed. Configuration-only restoration takes effect on refresh without publication.

### 2026-10-15 — Retire old Riverside pilot before replacement
- Added a frontend retirement guard for Riverside's old structure/stage-planner flags, including stale cached enabled values. Standard setup remains the fallback; other clubs keep their flag behaviour.
- Retained canonical draft answers, adapters and readers for compatibility. No tournament, fixture, booking, result, payment, notification or backend records changed; no publication. Replacement card-based pilot is not activated by this cleanup.

### 2026-10-15 — Riverside replacement basic structure cards and separate review
See follow-up: owner approved live Riverside planning tests; initial preview isolation below describes the original delivery.
- Added independent Riverside preview/new-draft-only card structure, replacing What, Match format, Categories, Structure guide, Subcategories, Format overrides and Planned format. Reuses canonical StepAnswers adapters with explicit Save/Discard and dirty navigation protection; separate Structure review reuses the table editor with canvas disabled.
- Editable division names, independent discipline/eligibility, default/custom scoring, expected entries, Group 1/2 subdivisions and named Pool A/B; RR topology is expandable, format palette is draggable/clickable with dismissible help, Monrad is planning-only. Future saved stage plans remain intact. Period Stages & scheduling and weekend Dates/Courts/Playoffs remain separate. New tournament creation is intentionally blocked in this isolated pilot; no backend/live records or publication changed.
- Verification: 34 focused tests passed; authenticated synthetic Riverside card→review→edit pool count→save→reload readback passed with RR pools and Monrad, no created tournament, no runtime errors, 390px mobile no document overflow. Desktop/mobile screenshots checked. Scheduling step retained and pure preservation tested; full downstream scheduling submission not exercised. Wider rollout and real Monrad generation remain pending.

### 2026-10-15 — Approved Riverside live structure planning tests
- Removed the hostname restriction from the replacement card/review gate only. Riverside new drafts now qualify on production, club subdomains and preview; other clubs and existing tournaments remain excluded. The create/handover block remains unchanged; no backend data, fixtures, bookings, results, payments or messages changed.
- Extended regression tests to production and Riverside club hosts, existing tournament exclusions and Uitsig exclusions. Publication requested only after focused checks and security review.

### 2026-10-16 — Structure category label and example
- Renamed structure card badges and the add-format prompt from League to Category; added the owner's separate Men's Singles A/B category example above the cards. Presentation only; no saved settings or live records changed.

### 2026-10-16 — Planned match time 40-minute option
- Added 40 min to the structure card Planned match time choices (20/30/40/45/60) so a match can be planned between the 30- and 45-minute slots; the value still feeds the capacity calculator unchanged.
- Verification: authenticated Riverside structure screen shows all five options and selecting 40 min keeps it pressed; presentation only, no saved settings, fixtures, bookings or live records changed and no publication.

### 2026-10-16 — Member bar collection-ready alerts
- Existing counter ready RPC already inserts a per-item, deduplicated member notification; retained this authority and all order/payment data unchanged.
- Collection-ready foreground messages now remain until dismissed with an X, retain exact ready item quantities and offer View order. Existing chime retained with AudioContext cleanup; supported browsers vibrate. The notification-only push worker requests vibration/renotify for order alerts; phone permissions, silent mode and platform limitations still apply.
- Preview-only; synthetic presentation tests/browser checks send no real notification and operate no live order. Background/physical phone delivery remains unverified.

### 2026-10-16 — Member credit eligibility allowances
- Added a dynamically inherited R0 club credit default and individual overrides, editable only through club-scoped finance RPCs; each actual change audits old/new and effective amounts, actor, timestamp and scope. Members can read their allowance, never edit it.
- Finance → Member Billing → Settings → Member Credit sets the default; member statements edit overrides; My Account displays read-only allowance. No journal, fund, debt or payment changes.
- Reused `member_account_gate` for combined approved credit plus the existing active monthly, unsuspended mandate fee coverage. Booking RPC adds the minimum booking balance once and includes optional pending charges; booking trigger closes the prior client-only enforcement gap. POS debit switches and nonfinancial booking restrictions remain intact.
- Court-light/fee charges remain actual debt in the same ledger; no retroactive charge rejection or debt reduction. Recurring outstanding-plan financing retains its existing uncovered debt calculation: an eligibility allowance is not a repayment and cannot reduce the debt a plan finances.
- Not published; additive backend schema/rules are shared by preview and live, with zero defaults preserving existing allowances.
- Clarified Edit Member financial/billing field: blank inherits, R0 explicitly overrides, Club default helper and Use club default action clear to NULL; effective amount shows Default/Override. My Account reads Your credit limit beside the balance, with no editable control. Ordinary member-edit permissions unchanged.
- Validation: 64 focused tests and 29 isolated PostgreSQL checks pass (inheritance/reset/R0, audit, finance/guest/cross-club denial, pending charges, active/inactive/suspended plans and server booking boundary/alternative-owner guard); authenticated Riverside R0 no-op save/reload verified. Build OK. Selected-member browser paths remain unverified because the preview account resolves Unknown member and the Riverside picker returned no matching members; no live test records or financial edits created.

### 2026-10-16 — Swiss rounds field defaults to the recommendation
- The Swiss settings rounds field now holds a real number instead of an empty box: the organiser's saved choice when there is one, otherwise the recommendation, and the recommendation stays printed beside it.
- Typing expected players stores that same Swiss recommendation (about one round per doubling of the field, capped at players − 1) instead of the old round-robin count, so a 12-player draw no longer lands on 11 rounds.
- Local Save Structure writes the shown number into the draft snapshot for Swiss categories and capacity planning reads the same value; other clubs' wizard still requires an explicit entry. No fixture, draw or booking data is generated.
- Validation: 31 focused structure/Swiss tests pass; authenticated Riverside preview showed 5 rounds pre-filled with "(recommended: 5 for 12 players per draw)", a typed 7 kept its value, and Save Structure retained it. Preview only; nothing published.

### 2026-10-16 — Seeding step removed from the Riverside card-structure flow
- Seeding is chosen per category on the Tournament structure page, so the separate Seeding step (tournament-wide default plus per-category exception dropdowns) is no longer part of this pilot's flow; the remaining steps renumber and other clubs keep theirs.
- The seeding answer still reaches the draw plan: the structure page's per-category choice is saved into the draft's seeding overrides and the draw reads those per category, with the old tournament default only as a fallback. Categories left on "Decide later" still surface at the Confirm final format checkpoint.
- The summary's Seeding row now lists each category's choice and opens Tournament structure instead of the removed step.
- Validation: 17 focused tests pass (new step-list check); authenticated Riverside preview shows Type → Basics → Entries → Tournament structure → Structure review → How players join … Summary with no Seeding step, and the category card's seeding control present. Preview only; nothing published.

### 2026-10-16 — Swiss next-round games not in fixtures/draw
- Projected Swiss games (both players decided) only showed as previews. Now `auto-progress-tournaments` (fired on result save) creates each decided game via `create_decided_swiss_game` and books its planned slot with `self_schedule_champ_match`; they are normal fixtures (reschedule/result/mark/replace). Guards relaxed per game only under that server flag. Uitsig Men's C R2: 3 games created and booked.

## 2026-10-16 — Messaging screen: SMS channel switch made visible
- Problem: Uitsig had member messaging On (whatsapp_enabled=true) while sms_enabled=false. The master "Send messages to members' phones" switch reads On when either channel is on and sets both together, but the messaging tab rendered <SmsMessagingCard hideToggle>, so there was no visible way to turn SMS on or off on its own.
- Fix: ClubAdmin.tsx messaging tab now renders <SmsMessagingCard clubId={club.id} /> without hideToggle — the card's existing "Send SMS for this club" switch (wired to clubs.sms_enabled via its own save mutation) is visible; the tab alert text now says SMS can be turned off on its own. WhatsApp billing card keeps hideToggle (sender choice only; master switch governs WhatsApp).
- Guard: src/test/sms-toggle-visibility.test.ts asserts the SMS card is used without hideToggle and its switch is wired to sms_enabled.
- Verified: signed-in Uitsig messaging screen shows master On + SMS switch present and Off (live settings not toggled); focused test 2/2, tsgo clean, build OK. Preview only, not published.

## 2026-10-16 — Messaging section: WhatsApp and/or SMS channel selection
- Direction (Willem): the messaging section itself must let the club select WhatsApp and/or SMS; the single master switch that set both channels at once is removed.
- MessagingCard.tsx rewritten: two switches (aria-labels "WhatsApp messages" / "SMS messages") wired to clubs.whatsapp_enabled / clubs.sms_enabled; enabling WhatsApp still records whatsapp_opted_in_at/by. Badge On when either channel is on.
- ClubAdmin.tsx messaging tab: alert text updated; WhatsAppBillingCard and SmsMessagingCard both render with hideToggle (details only: sender, cost, usage).
- Guard: src/test/messaging-channel-selection.test.ts (3 tests) asserts both switches exist, the combined-set mutation is gone, and both detail cards keep hideToggle.
- Live: sms_enabled=true set for Uitsig on explicit request (read-back verified, WhatsApp unchanged); signed-in preview shows both switches On; build OK. Not published.

- 2026-10-16: Follow-up "Stage 2" categories are attached to their first stage as an all-continue, owner-approved stage (attachFollowUpStages in step-draw.ts) instead of a separate waiting division; Stage progress offers Start after the last Swiss round.


## 2026-10-16 — Swiss final standing column + separate Stage 2 progression log
- Problem: on a two-stage tournament (Swiss → round robin), Stage 2 games restart at round 1 and mixed into the Swiss progression grid, looking like 'rounds 4–6 of Swiss'; no visible final Swiss ranking.
- Fix: `buildSwissProgression` now exposes `configuredRounds`, `swissStageComplete` and per-row `swissFinalPosition` (Swiss-stage rounds only). `SwissProgressionPilotView` and `SwissCurrentPositionsTable` show a 'Final standing' column that locks (green) once the configured Swiss rounds are all complete. `ClubChampsView.swissStageFor` prefers the stage's own `swissRounds` over the format-plan timeline length. Matches are split by `tournament_stages.kind` via `stage_id`: the Swiss log shows only Swiss-stage games; later-stage games render as a second progression log below (`stage2-progression-<group>`), labelled 'Round robin' via new `stageNoun`/`formatNote` props.
- Tests: swiss-pilot-standings.test.tsx (final standing dashes → locked positions; follow-up stage doesn't block). Verified in Riverside preview on 'assasasa'. Preview only, not published.

## 2026-10-16 — Structure step: seeding button row + per-category placement option
- Request (Willem): category seeding as buttons in one row instead of a dropdown, with a "Placement option" (Snake vs Strength band) below it for RR / knockout / cross-league, explaining both.
- Change: new `CategorySeedingButtons` / `PoolPlacementButtons` (src/components/club-admin/CategorySeedingButtons.tsx) replace the Stage 1 and follow-up seeding dropdowns in ClubChampsTab. Placement option shows when the category has 2+ pools or is knockout/cross-league; per-category `leaguePoolPlacement` map (blank inherits tournament-wide `pool_allocation`), persisted in the version snapshot as `league_pool_placement` and included in the change key. All pool-split call sites (RR, Swiss, cross-pools, knockout sections, draw-board suggestion) now use `placementForLeague(gn)`.
- Tests: category-seeding-buttons.test.tsx (4 tests). Build OK. Preview only, not published; browser click-through of the structure step not done — user to verify in Riverside preview.

## 16 Oct 2026 — Two-stage progression display (Riverside preview)
- SwissPositionGrid: added a "Final standing" card at the right end of the grid, after the last round — Projected (current positions) until the stage's own rounds are complete, then Locked (green) with "these positions seed the next stage".
- ClubChampsView: follow-up stages of kind "pools" no longer render in the Swiss grid style; they render per pool in the Uitsig RoundRobinPilotView format (pool matrix with W/L/GF/GA/GD/Pts F-A/Rank, order of play, calendar), seeded from the final Swiss standings. Non-pools follow-up stages keep the Swiss-style log.
- Tests: swiss-pilot-standings.test.tsx +1 (grid card Projected/Locked); 11/11 pass; verified in Riverside preview on "assasasa" (1 final-standing card, 2 pool matrices). Preview only, not published.

### 16 Oct 2026 — Swiss Positional Preview showed rounds 2+ as "projected"
- Cause: buildProposedSwissGrid copied only saved Round 1; later rounds always used template projections.
- Fix: saved/decided games in any round are shown factually (players, W/L, score, time/court; block.saved=true); a fully saved round is marked created ("Real games · results as played"); partially saved rounds keep proposed slots only for undecided players. Tests: src/test/swiss-proposed-grid.test.ts.

### 16 Oct 2026 — Changing a later stage after the draw (assasasa RR -> knockout)
- Cause: Edit setup only saves wizard answers; the engine spec is append-only, so a generated Stage 2 could not change.
- Fix: server function replace_unplayed_structured_stage (manager-only, last stage only, refuses played/started/booked games, audited) + "Regenerate Stage 2" on Run stages (StructuredEnginePanel). assasasa: 30 unplayed RR games replaced by 4 quarterfinals from final Swiss standings. Open: Edit setup still does not push stage-type changes to the engine.

### 2026-10-16 — Play-off quarterfinals seeded 1 v 10 and dated before the Swiss stage ended
- Cause: the scheduled `auto-progress-tournaments` function ran a stale engine bundle (wins-only ranking, no Swiss Buchholz tie-break), so it auto-started the play-offs with players 9/10 in the top 8. Regenerate also copied the old stage's Swiss round dates, so quarterfinals landed on 29 Oct, before Swiss Round 3 (31 Oct), with no court bookings.
- Fix: rebuilt + redeployed the bundle (`bun scripts/build-auto-progress.ts`) — rebuild it whenever `src/lib/tournaments/` changes. `buildReplacementStage` now drops dates on/before the previous stage's last day (`laterStageSchedule`), leaving games undated until play-off days are chosen. Knockout draw seed labels derive from the draw position. Test: `src/test/replace-stage-dates.test.ts`.

- 2026-10-16: Play-off chain stages (kind "mapped") rendered as a round-robin grid in Progression & Log; ClubChampsView now draws them as the knockout bracket (QF/SF/Final by stage label), numbered by final Swiss position. Stages & scheduling now syncs play-off stages from structure Planned playoffs.

## 2026-10-16 Uitsig categories renumbered by setup re-save
- Combining Mens A 1/2 into one category in setup answers, then saving, renumbered live categories 8→7 (labels, scoring, league links, registrations division_choices shifted). Restored from tournament_snapshots backup. Fix: persistStepTournament refuses to change category count once games exist (assertDivisionCountLocked).

## 2026-10-16 Category league allocation override
- One-page Structure displayed a legacy multi-source “Combined competition” advisory although its source controls were hidden. Multiple league teams may feed an explicitly configured category without merging live divisions.
- Added opt-in “Admin can override” beside each category's league selections. Move/add/drop/import and pairing candidates honour the manual league exception; automatic league placement and self-entry remain unchanged. Previously placed players are never removed. Combined source intent stays independent; one-page Structure retains pool warnings but omits the unrelated multi-source advisory.
- Preview only; no live tournament, fixture, result, booking, permission or deployment changes.

## 2026-10-16 Uitsig Men's A parent/pool structure display
- Saved answers correctly retain Mens A with children 1/2 and eight total draw slots. Original structure flattened these children into separate category cards, misleading the organiser into merging positional live IDs.
- Added derived presentation-only parent/pool metadata for numbered round-robin children; Men's A has a single heading, two pool rows and total expected count. Original child IDs, labels and slots remain untouched, including on adapter round-trip. Existing-tournament rename/delete/duplicate controls are disabled to avoid renumbering live draws.
- 38 focused tests passed; authenticated Uitsig preview showed Men's A / 2 pools / 8 players, with 4 players per pool. No setup save or publication. Initial preview navigation surfaced “24 games given times and courts”; subsequent checks blocked generation/scheduling writes. That automatic navigation side effect was not part of this presentation change and its live impact has not been independently verified.

## 2026-10-16 Category setup safety locks
- Added Done & lock and Edit / unlock below structure categories. Locking saves current draft settings and collapses the category; its fieldset disables settings, duplicate and remove controls. Numbered pools share their parent's lock. Unlock preserves unsaved sibling edits and existing live-identity restrictions.
- Lock metadata remains in originalStructure within the existing saved answers flow; no new permissions, schema, fixtures or results logic. Each category can be completed independently even when another category's expected count is blank.
- 32 focused tests passed and preview build OK. Authenticated Uitsig preview tested changing a local count, locking both pools, disabled controls, reload and unlock. All writes blocked; reload used an isolated saved-answer response. Actual hosted persistence not exercised. No publication or live-data writes.

## 2026-10-16 Locked category viewing
- Moved locked-category Expand / Collapse controls outside disabled settings fieldsets. Double-clicking the category/pool heading toggles its view without unlocking; single-click opening remains unchanged for unlocked categories.
- Authenticated preview verified both Men's A pools using Expand, bottom Collapse, and two heading double-clicks; player inputs stayed disabled and Locked status remained. Seventeen focused regression tests passed; preview build OK. No publication; tournament writes blocked during checks.

## 2026-10-16 Format information visuals
- Single round-robin palette passed an invalid learning key, yielding an empty information dialog; normalized both legacy round-robin choices to the existing learning key.
- Added read-only progression-style teaching views: round-robin opponent matrix with selectable round and adjacent games; Swiss side-by-side round tables with positions, fictional names and results. No dates or court assignments, no real players or live engine changes.
- Eight existing focused tests passed. Authenticated preview verified both information buttons, Round 2 selection and closing, with tournament writes blocked; screenshots inspected and preview build OK. Not published.

## 2026-10-17 — Linked-family court booking authorization
- Confirmed QA finding 003f980c-05f1-5564-b94e-79656de4a8a6 against hosted function definitions and current code: email-linked selected members were rejected by both eligibility and the ownership trigger.
- Owner-approved forward migration 0171 adds `can_book_linked_member`: direct ownership or a verified authentication-email match plus the actor's own membership in the same club. No caller email, profile metadata, client storage, fee delegation or billing family group grants booking authority.
- Eligibility and the booking trigger share this authority. Ordinary inserts retain authenticated actor ownership, selected-member ledger/credit/recurring coverage, club checks and fail-closed behavior. Finance settings/editing are unchanged; courts-admin and platform administration remain separately authorized.
- Scoped adjacent-booking auto-merge to `club_member_id`, preventing one shared-login sibling from extending another's booking. Offline submissions reach the same server trigger without any authorization bypass.
- 39 focused tests passed, including 12 disposable PostgreSQL checks (authenticated-role insert/readback, forged-owner denial, unrelated/fee-delegate/cross-club/missing-session/unverified-email denial, R300/R20/R280.01 and recurring coverage) and 3 booking-hook attribution/merge regressions. Preview build OK.
- Authenticated path: UNVERIFIED through the real family UI/session. Local authenticated-role SQL checks are not an authenticated HTTP/UI walkthrough. Needs owner-selected ordinary parent account and explicitly approved Riverside test booking; monitoring finding remains unresolved. Guest eligibility denial verified locally; hosted guest mutation and native flows unverified. Migration changes shared hosted rules; no existing records, bookings, ledger entries, messages, hardware or publication changed.

## 2026-10-18 — Cross-device bar tabs and payment receipts needed manual refresh
 
- Customer open tabs were restored once but never polled; only customer-initiated counter payments had a timer. Counter boards waited 20 seconds and suspended polling in the background.
- Shared five-second read-only refresh now covers counter boards/orders and customer tabs, with focus, mobile resume and reconnect checks. Confirmed settlement shows a receipt and payment-received alert. Existing PIN/token authority and server settlement logic are unchanged.
- Verification: 21 focused tests passed (refresh lifecycle, reconnect, confirmed terminal/cash/online receipts, failure handling and PIN boundaries); isolated browser counter new-tab and customer card-receipt checks passed without reload or page errors. Preview build OK. No live orders, payments, hardware or publication; actual live settlement and physical-phone resume remain unverified.

## 2026-10-18 — Bundle costs missing from item list
- Added display-only bundle valuation from current component purchase-unit prices and separately from stock-unit averages, resolving parent stock and selling-option consumption. Lists and editable recipe previews recalculate without writing bundle cost fields or historical sale snapshots; missing components/costs remain explicit.
- Read-only aggregate checks found current prices on 235 stock items each in Riverside/Uitsig, but no stock averages set. Income statement costs derive from recorded sale movements; existing bundle consumption already records component movements, but missing averages yield missing sale costs. The screenshot's five individual sale rows were not attributed to a club/transaction by this investigation.
- 37 focused tests passed. Authenticated Riverside list/editor and quantity 4→8 preview changed R59.36→R118.72, then cancelled without saving. Preview build OK; no stock, sale, ledger changes or publication. Historical cost reconstruction requires a separately approved correction with defensible historical costs.

## 2026-10-18 — Cost of sales must be an account category
- Added nullable reporting classifications to custom accounts, exposed as Cost of sales — Bar / Shop in Category; named accounts retain normal Expense posting. Income statements resolve custom IDs and list account names under the respective gross-profit section, not general expenses. Legacy direct-cost roll-ups remain readable; no historical journals or accounts reclassified.
- Verification: 23 focused checks passed; eight optional PostgreSQL cost-report checks skipped. Authenticated Riverside Salaries dialog supports both categories and was cancelled without saving; preview build OK. Full saved-account-to-statement UI flow remains unverified because live financial writes were not requested. No publication, journal writes or existing-account reclassification.

## 2026-10-18 — Exit counter hidden after personal-PIN redirect
- Exit was guarded by `!code`, but every serving route now requires a QR code. Exit counter mode is available on the board and PIN screen, clears the local serving session/cache and returns to the customer menu. End shift still stays on the PIN screen. Neither action closes the bar or settles tabs.
- Verification: 15 focused tests passed; isolated browser exit→customer menu→PIN reentry verified, with cleared local identity and no page errors. Preview build OK; no live changes or publication.


## 2026-10-19 — Scheduled championship slot protection
- Gerhard/Jason's conflicting Court 1 booking on 20 Oct at 18:00 cancelled on explicit owner instruction; history retained and their fixture unscheduled through the authenticated unschedule RPC. Nico/Johann restored to their original Court 1 18:00 allocation, with guarded concurrent-edit checks and hosted read-back. Other recently changed fixtures untouched.
- Added server booking-write guard for scheduled championship fixtures without booking rows, using saved group/singles/doubles duration (35 minutes for Uitsig) instead of ignoring these allocations. Applies to INSERT and rescheduling UPDATE, normal bookings and tournament bookings, with no admin bypass. Own fixture identity and ownerless capacity holds remain allowed.
- Six disposable localhost PostgreSQL tests passed: occupied Court 1, full 35-minute interval, own fixture booking, other court, move rejection, privileged/authenticated rejection. No real test bookings, hardware actions or publication. Picker still reads booking rows only and may offer a slot the server rejects; authenticated UI rejection and concurrent cross-court participant writes remain unverified.


## 2026-10-19 — Uitsig championship slots restored to 45 minutes
- Explicitly scoped by Willem to Uitsig Club Champs 2026, not all tournaments. Synchronised live match duration, eight category durations, canonical original-structure duration map, guide estimate and both singles/doubles scheduling copies to 45. Did not run builder autosave/reconciliation or change scoring, stages, dates or results.
- On explicit six-game approval, used authenticated self_schedule_champ_match with 45 minutes and fill_hold=false, preserving date/court and stable booking IDs: 21 Oct two 19:10 -> 18:45, 20:20 -> 20:15; 22 Oct two 18:35 -> 18:45, 19:10 -> 19:30. All six accepted protected RPC checks and hosted read-back confirmed exact 45-minute intervals. Built-in in-app schedule notices were generated by existing RPC.
- Booking-grid interval now prefers linked saved tournament duration rather than mode of old booking intervals. Existing paid/GoBook bookings remain untouched. buildSlots previously silently substituted 30 for 45; it now preserves configured match intervals.
- 28 focused tests passed. Authenticated Uitsig Wednesday preview visibly shows 18:00/18:45/19:30/20:15 and correct relocated matches without 18:35/19:10/20:20 rows. Fixture slot-generation tested; full fixture-list picker UI not exercised. Backend data is live as explicitly requested; frontend not published. Web/PWA/native share these helpers; native package not rebuilt.

### 2026-10-19 — Court grid fell back to 30-minute rows (Uitsig)
- Cause: `useMyClub` cached the tenant club snapshot taken before the signed-in booking settings (slot length, open/last time) loaded; users without a membership in that club (e.g. Super Admin) kept the defaults → 30-minute rows mixed with 45-minute championship games.
- Fix: `mergeTenantClub` merges the live tenant club at render time (same club only). Test: `src/test/merge-tenant-club.test.ts`.
- 19 Oct 2026 — Thursday 20-minute grid rows: club_champs_matches fixture lookup was not club-scoped, so other clubs' tournaments (20/30-min durations) leaked into Uitsig's grid and fixtures-list slot pickers; fixture labels now filtered by champ.club_id. Also champsSlotStarts now excludes reserved holds already carrying a scheduled game, so occupied Tuesday slots are no longer offered. Tests: champs-slots 7, scheduled-champ-booking 13 pass. Not published.

## 2026-10-19 — Counter mode: member tabs without verification code
- **Change:** Opening a tab in counter mode now offers Member / Visitor. Member = search by name or number (bar_counter_search_members), tab linked to club_member_id (bar_counter_open_tab _club_member_id, opened_source='counter_member'). Visitor = name + phone as before.
- **Charge:** Member-linked tabs settle to the member account with one staff confirm (bar_counter_charge_member_account, verification_method='counter_pin') — no one-time code; the unlocked staff PIN session is the authority. Other tabs still use the member's own code (bar_qr_charge_guest_tab_member). Cash/card/online unchanged. Board now returns club_member_id; tab list shows a Member badge.
- **Verified:** build OK; member-counter-tab tests pass. Not published.

## 2026-10-19 — Member sees full bar/shop purchase history
- **Change:** The member's bar page history (was "Posted to my member account", bar_tab_entries only) is now "My purchases": a new my_bar_purchases RPC (auth-checked to the member's own club_members row) unions account charges with paid cash/card/online sales linked via the guest tab's club_member_id, operator_member_id or logged_by. Each row shows items, date, amount and a payment-method badge (On account / cash / card / online).
- **Verified:** build OK. Not published.

## 2026-10-19 — Shared Swiss opponent-history correction
- Later pairing review: approved 24-player R3 1–7, 2–8 through 6–12, repeated in the lower half. Added shared preferred-template adapter for fields with even halves; R4 rotates opposite-quarter opponents to keep the strongest quarter separated. No-repeat repairs remain within each half, and within opposite quarters through R4. Saved games, original R1–2 and schedule identities remain authoritative; uneven halves unchanged pending review.
- Wider-pattern verification: 26 Swiss suites / 271 tests passed, including exact R3 map, R4 quarter separation, constrained rematch repair and five-round engine/projection agreement. Preview build OK and local server bundle regenerated. No live fixture writes, service deployment or publication; future-result UI flow not exercised against live data.
- User confirmed one formula for all clubs, preserving rounds 1 and 2 and every saved fixture. Positional generation and proposed/court projections now share strict history-aware repair from round 3: preferred positions when legal, nearby alternatives otherwise, no silent repeat fallback. Incomplete later-round fields remain provisional until legal completion is known; confirmed matches remain fixed.
- Shared solver retains original score-group behaviour when no positional preferences are supplied. Court/time schedule identity is retained for adjusted pairings. Round robin, knockout, saved results, bookings and play-by values were not written or regenerated.
- Verification: 27 suites / 290 tests passed, including 18/24-player five-round no-repeat scenarios, first-two-round preservation, mixed-result generation/projection parity, locked saved games and impossible-draw refusal. Signed-in read-only Uitsig Men's B progress screen rendered saved Round 1 and projected Round 2 without page errors; future real result submission was not tested because it would write live data. Preview build OK; server bundle regenerated locally only. No database migration, live-data change, edge deployment or publication; database-level rematch enforcement remains a separate outstanding safeguard.

## 2026-10-19 — Uitsig unwanted Swiss Round 6
- Saved structured stages still contained swissRounds=6 despite approved five-round setup. Corrected only the four Swiss stages in Uitsig Club Champs 2026 (Mens B/C/D, Ladies A) to five and trimmed their unused sixth roundDates element; no fixtures/results/bookings changed, no messages or deployment.
- Hosted read-back: each Swiss stage has five rounds and five date entries, zero matches beyond Round 5. Signed-in Men’s C UI verified Round 5 and final standings, zero Round 6 headings.

## 2026-10-19 — Swiss grid standings card wording
- The Swiss progression card was headed "Final standing" while games were still unplayed (badge "Projected", note "Current positions · locks when Round N completes"). The heading now reads "Current standings" until the Swiss stage's own rounds are complete, then "Final standings" beside the existing "Locked" badge. Wording only: positions, ordering, saved games, results and bookings untouched.
- Verification: src/test/swiss-pilot-standings.test.tsx 11/11 passed — projected card asserts "Current standings" and no "Final standing"; locked card asserts "Final standings". Preview build OK. No live-data change, migration or publication.
- Follow-up (same day): the two "Final standing" column labels (Log View progression table and the Results-tab positions table) now read "Current standings" until the Swiss stage's own rounds are complete, then "Final standings". Same conditional wording as the grid card; positions and values unchanged. 3 suites / 31 tests passed; preview build OK; not published.

## 2026-10-20 — Restore screenshot championship assignments
- Owner reported missing fixtures beside still-active Court 2 personal bookings. Four upcoming fixture schedule fields and links had been cleared at 13:15 UTC on 19 October; no matching audit record established the initiating action. Existing booking cancellation/unlink paths can clear schedules, but the exact cause remains unconfirmed.
- Screenshot championship column corresponds to Court 3: restored Carel Ras / Mark Schickerling (20 Oct 18:00), Austyn Ras / Jenny Arnold (20 Oct 19:30), Richard Rilanco - Coetsee Snr / Berni la Grange (21 Oct 18:45), Manie Barnard / Lienke van Reeuwyk (21 Oct 20:15). Used Willem's authenticated link_booking_to_champ_match RPC to link the existing active Club Championships holds; all four returned success and hosted readback confirmed exact date/time/court and active links.
- Initial unauthenticated guarded data repair was rejected by the Match Day score-only trigger and made no changes; no security rule was bypassed or altered. Personal GoBook bookings, payments, deadlines, pairings and results unchanged. Nicole Hamer / Yolanda Coetsee is already completed following withdrawal and was not restored as an upcoming game. No publication or hardware action.
- Follow-up: checked both full screenshots. Restored four additional still-undecided fixtures cleared at the same 19 October timestamp using Willem's authenticated link RPC and existing active, unlinked holds: Nico Ras / Johann Snijder (20 Oct Court 1 18:00), Jarrod Cousins / Logan Kidson (Court 1 18:45), Damian Groenewald / Bradley Hunt (Court 4 18:00), Lisa van Reeuwyk / Lisa Rahman (Court 4 19:30). Preflight refused any changed/already-linked fixture. Adele du Rand / Berni la Grange and Nicole Hamer / Yolanda Coetsee remain completed withdrawal walkovers, not upcoming games; 21 Oct Court 1 18:45 now belongs to Andre Swart / Leon de Lange, so the older screenshot's E. Engelbrecht / L. Lange label was not reinstated. Personal bookings unchanged; no GoBook write, notification send, publication or hardware action.
- Persistence investigation: live admin_set_round_play_by cleared unbooked court allocations and organiser-created match bookings when applying deadlines, even during reconciliation. Round and fixture timestamps coincide across the 19 Oct 13:15 batch; this supports round-settings reconciliation as the clearing mechanism, but there is no actor audit proving who initiated it. Replaced that RPC to preserve every existing booking/link/allocation while changing deadlines; no automatic notifications added. Frontend dry-run matches this rule; 18 scheduling tests pass.
- Snapshot audit found eleven more future allocations lost in that batch. Restored through Willem's authenticated protected RPCs, retaining dates/courts and mapping old 35-minute positions to the approved 45-minute grid: Johann du Rand / Bernard Welters (21 Oct Court 1 19:30), AJ Barnard / Ulrich Strydom (22 Oct Court 3 18:45); seven games on 27 Oct and two on 3 Nov. No remaining undecided future game from the 16 Oct snapshot lacks its saved allocation. All 23 future linked fixtures have active 45-minute bookings; zero overlapping scheduled fixture pairs. Live unchanged-deadline reconciliation was exercised against a restored round and before/after allocations were identical, released=0. Frontend build OK; no publication or external hardware/provider calls. Existing self-schedule RPC notification gates remain authoritative.

- 2026-10-20: Treasurer (finance permission, not full admin) could not delete/reverse GL entries (RPCs checked is_club_admin only) or see member bar sales (bar_tab_entries SELECT admin-only). Migration 0207 allows finance permission on delete/reverse and bar/finance permission to view bar tabs.

## 2026-10-20 — Confirmed Swiss play-by pairings not bookable
- The automatic decided-game writer consumed court-occupancy projections, which deliberately skip applied self/play-by rounds and require planned court slots. Consequently confirmed next-round names could appear only as Projected, with no saved fixture for the booking action.
- Shared projection now separately emits confirmed play-by candidates, scoped to their own category/round deadline. The writer saves these through the existing protected create_decided_swiss_game RPC without calling the court-booking RPC. The fixture's round_id supplies its configured deadline to the existing booking controls. Saved games/participants remain excluded; scheduled candidates retain their existing planned-slot path.
- Verification: 6 suites / 51 tests passed, including synthetic Riverside writer creation/readback, participant booking permission, no automatic bookings, unresolved-player refusal, category deadline isolation and repeat-run idempotency. Server bundle regenerated locally; preview build OK. No live fixture repair, migration, function deployment, notifications, publication or hardware operation. Real player-session booking remains unverified until explicit release and repair approval.
- Approved live repair follow-up: projected confirmed candidates with the shared tested formula and added exactly 12 missing Round 2 fixtures (Mens B 2, Mens C 4, Mens D 6) in one bounded transaction using the existing per-game Swiss guards. Existing self-scheduled rounds currently have 29 Oct deadlines; copied those without changing any round. Explicit pending draw-notice state prevents automatic notification dispatch. No missing Round 3 candidate currently has two confirmed occupants. Marnus–Riaan readback shows scheduled/bookable fixture, 29 Oct deadline, no court/time/booking; authenticated administrator Log View shows the real Round 2 game as To play, not Projected. Six focused tests passed. Existing games, results and bookings were not updated; no deployment/publication/hardware action. Actual participant-session Book a court interaction remains unverified.

## 2026-10-20 — Swiss round count raised to five; setup-file repair
- Mens B, Mens C, Mens D and Ladies A Swiss stages set to five rounds in all three places the live draw reads the count (`tournaments.builder_spec` stage `swissRounds`, `tournament_stages.config.swissRounds`, `club_champs.swiss_rounds`), with Round 3 by 5 Nov and Rounds 4-5 by 12 Nov matching the existing `club_champs_rounds` timeline. Rounds 1-2 games, scores, courts and pools untouched; no fixtures created.
- The first write used a nested correlated jsonb subquery and replaced the `stages` array of divisions 3-6 with the whole eight-element divisions array. `swissStageFor()` then saw `kind !== "swiss"`, so those categories rendered classic/round-robin standings instead of the Swiss progression log. Repaired with a single-level `jsonb_agg(... ORDER BY ord)` write restoring the literal Swiss stage (swissRounds 5, aligned schedule); all eight divisions verified back to one stage each.
- Verified live as Willem (Super Admin): Mens B, Mens C, Mens D and Ladies A each show "Current positions" with "Round 5" / "of 5" and no pool matrix; Ladies B shows the Pool A / Pool B pool matrix. Ladies B pool switch (Yolanda -> Pool B, Jenny -> Pool A) applied through `admin_replace_champ_player` on six fixtures (audited, players notified), Liezel v Jenny restored as played 15-8, 15-10, 15-6, and the Court 35 27 Oct 18:45 slot re-attributed to Jenny. No publication, deployment or hardware action.

## 2026-10-20 — Ladies A exact owner chart (9 players)
- Symptom: owner supplied a five-round Ladies A Swiss chart and asked Ladies A to follow it exactly.
- Finding: group 6 has 9 entrants; byes are R1=9, R2=3, R3=2, R4=4, R5=5. Positions 6-9 had already met every other way, so the owner chose no Round 5 games for them; Round 5 shows 1v2, 3v4 and the bye only.
- Fix: new owner-approved display chart src/lib/tournaments/swiss-uitsig-ladies-a-chart.ts (eligibility guard: Uitsig club, this tournament, group 6, 9 entrants, 5 rounds) wired into buildProposedSwissGrid/SwissProgressionPilotView/ClubChampsView as exactLadiesAChart. Exact charts skip the strict "every slot appears" validation; saved games stay factual in Log/Calendar.
- Guard: swiss-uitsig-ladies-a-chart tests (chart rounds, byes, fail-closed guard, saved-game retention, default model unchanged). Display-only; no data writes, no publication.
---
## 2026-10-20 — Scan-to-pay member account charge for signed-in members
- Symptom: Nelspruit members logged into the app were asked for their membership number (and then a one-time code) when charging bar items to their own member account via the QR scan-to-pay page.
- Finding: ScanPay was deliberately identity-free — it hardcoded the signed-in member to null and required bar_qr_lookup_member + OTP for every account charge. The OTP charge RPCs (bar_qr_charge_member, bar_qr_charge_guest_tab_member) only accept member_bar_otps codes.
- Fix: startAccountCharge in src/pages/ScanPay.tsx now resolves the signed-in member (MemberContext) and confirms active membership at the SCANNED club; confirmed members charge directly via new RPCs bar_qr_charge_member_session / bar_qr_charge_guest_tab_member_session (drizzle/migrations/0221_bar_session_charge.sql), which verify auth.uid() owns the membership (user_id or shared family email) and write bar_tab_entries with verification_method 'session'. Decision logic is pure in accountChargeStart (src/lib/bar/member-tab-handoff.ts). Guests, QR-only users and tip-enabled clubs keep the number + one-time-code flow.
- Guard: scanpay-signed-in-charge tests (direct only for confirmed same-club membership; number flow otherwise). RPC gates verified: anonymous calls rejected, foreign membership rejected, no writes in tests. Positive-path charge not exercised (no live charges allowed).

## 2026-10-20 — Scan-to-pay: "or" divider between the two payment options
- Symptom: the member-account button and the card-online button read as one block, so it was not obvious they are alternatives (owner: "add OR between the 2 options").
- Fix: added a small muted "or" rule between "Charge tab to my member account" and "Pay tab online by card" on the open-tab card, and between "Add to my member account" and "Pay with card online" on the checkout card in src/pages/ScanPay.tsx. The divider only renders when both options are actually offered (account tabs and online payment enabled, and the membership-number panel is not open).
- Display-only: no charge, booking, setting or data change. Riverside preview verified the divider renders between the two buttons; build OK. Not published.

## 2026-10-20 — Optional signed-in member tips at account settlement
- Owner clarified: prompt for an optional tip only on Add to my member account, without member number/OTP, independent of the order-process switch. One serving person auto-selected; multiple serving names selectable. No tip remains available when no serving session exists.
- Added an account-settlement dialog and atomic session-authorized tip wrappers around existing basket/tab charge and tip-accounting engines. Serving staff are named active personal PIN sessions (unrevoked/unexpired), not all enabled PIN credentials. Tip debt remains separate and not payout-eligible until account payment under the existing lifecycle. Anonymous QR and counter paths unchanged.
- No live member charges, club-setting changes, payment-provider calls, hardware actions or publication. Synthetic verification recorded below.
- Verification: 46 focused tests pass (order process ON/OFF, optional R90 tip, no-tip R900 charge, no OTP, failed settlement retention, existing tab refresh). Disposable PostgreSQL checks use the real session charge/tip functions with synthetic support tables and product-journal stub: R900 + R100 debt once, rollback on invalid tip, revoked/foreign recipient rejection, repeated request safety, tab settlement once, account_due to earned after payment, private helper grants. Fictional dialog visually checked at 1280px and 390px; names selectable, optional tip/no-tip actions fit. Preview build OK. No real signed-in member purchase submitted; hosted end-to-end accounting remains unverified until permitted synthetic/live-flow testing.


- 2026-10-21 NSC doubles: "Sub not allowed" blocked Sherique Crafford (Double Troubles pair 3) subbing for another team. When a league allows more than one game a night, players from teams also playing that evening now count as allowed subs (doubles-sub-eligibility `fromPlayingTeams`).

### 2026-10-21 — Swiss round count: Structure vs running tournament (Riverside)
- Finding: "River side Club champs" Men's B (18) is 4 rounds everywhere (setup, live draw copy, legacy column empty); preview log shows 4. Men's A (24) is 5 in both. Real gap: Structure → live sync only read a category's own stage plan, so a category inheriting the tournament default never synced.
- Fix (Riverside only): sync resolves the value exactly as Structure shows it (own → parent → default); never below a round with games.
- Added Riverside "Round robin in final 3 rounds" for 5-round Swiss (`src/lib/tournaments/swiss-rr-finish.ts`, engine `nextSwissRound`). Tests: `src/test/swiss-rr-finish.test.ts`.

### 2026-10-21 — Reachable Riverside RR finish and automatic writer
- Missing toggle was on CardStructureEditor's bypassed markup; moved into the reachable original Structure category screen immediately below Category seeding. Adapter round-trips category RR options to stagePlans and draw spec; locks remain respected.
- Automatic progression uses decided-swiss's projection/writer, not only nextSwissRound. Both now read the configured option, use fixed Round-2 slots for grouped games, and keep remainder Swiss. Qualifying-repeat conflicts block rather than invent pairings; one/two/three-player remainders are rejected. Per-category saved stage mirrors sync alongside the live spec.
- Synthetic actual-writer regression saves 27 R3–R5 games for 18 players/3 groups, no repeats, retry duplicates, court bookings or scheduling-row changes. 379 focused checks passed before the final feasibility additions; authenticated existing Riverside desktop/phone toggle enabled with 3 groups using intercepted writes. Uitsig fixtures/data untouched; no duplicate site/tournament created.

## 2026-10-21 — Riverside AABB Division 3 Round 2 got timed court bookings in a play-by stage
- Cause: automatic Swiss next-round creation (`createDecidedSwissGames` → `create_decided_swiss_game`) only treated a round as play-by when a saved round row existed for that category. Division 3 had no saved Round 2 row (the "All categories" round lives in the stage schedule), so the projection planned court slots and the RPC inserted a new round with `scheduling_mode='club'`, then booked Courts 2/4.
- Fix: RPC now copies the stage's play-by deadline (roundDates/deadline) into new rounds and matches; projection falls back to the stage play-by deadline when no round row exists, so no court slot is planned. Auto-progress engine rebuilt and redeployed. 8 bookings cancelled, games reset to play by 31 Oct.

### 2026-10-21 · Riverside Swiss+RR standings moved into round track
- Removed the separate right-hand RR standings panel in the Swiss grid; live group standings now render as a compact column immediately after Round 5 in the same horizontal track (`SwissPositionGrid` `afterRounds`), with "View Standings →" / "← Back to Rounds" jump controls. Calculations, visibility (actual R3 activity) and Log View unchanged; standalone RR and normal Swiss unaffected.

### 2026-10-21 — Uitsig Club Champs 2026: Ladies C removed (data cleanup, authorized)
- Ladies C (g8) had no games/entries; its players and results already lived once in Ladies B (pools A/B). Deleted empty Ladies C category, stage and 5 rounds; removed g8/"Ladies C" and declined players (Nicole Hamer, Adele du Rand) from saved plan; Ladies B saved plan now mirrors live two pools. Single guarded transaction; all 87 games verified byte-identical before/after. Registrations/accounts kept. Backup JSON in private Files metadata (`.lovable/backups/uitsig-ladies-c-20261021T205838.json`).

## 2026-10-21 — Category with N pools (not separate categories)
- Problem: setup "Group" button created numbered subdivisions (e.g. Men's A › 1, › 2) that look like pools but are separate draws with separate playoffs (root of Uitsig Men's A split). Pool names edited in card/canvas editors never reached the saved draw; public page always showed "Pool A/B".
- Fix: button renamed "Subdivision"; setup warns when ≥2 round-robin subdivisions exist and offers a one-click "Make these N pools" (setup only, blocked once players are placed) via `src/lib/smart-builder/category-pools.ts`; pool-name inputs on pooled rows; draw spec carries pool names (`poolLabels`); saving refreshes existing pool labels without touching games; `ClubChampsView` shows saved pool names. Test: `src/test/category-pools-model.test.ts`.
- No live data changed. Uitsig Men's A migration is a separate, unapproved proposal.

## 2026-10-21 — Uitsig Men's A merged into one category (owner-approved live change)
- Men's A › 1 / › 2 (separate draws 1 and 2) became one Men's A with Pool A / Pool B (tournament_pools on the kept stage) and one shared play-off; › 2's division/stage/rounds removed after its 6 games were re-pointed to the matching kept rounds.
- Categories 3–7 renumbered to 2–6 across games, rounds, entries, registrations' choices, per-category settings, structured spec and saved setup plan; category count 7→6 (earlier stale 8→7 fixed first).
- Single guarded transaction: fingerprint of all 87 games identical before/after, fees 78 / R8,400 unchanged, no fee rows created. Backup under private documents (uitsig-mens-a-pools-2026-10-21).
- Note: match-day guard requires service-role context for admin re-pointing of games.

## 2026-10-21 — One category card for pooled round robins (structure screen)
- Finding: no live tournament (Riverside or any club) stores pools as separate numbered subdivisions any more; Riverside AABB "Mens A 2" is already ONE category with 2 pools. The duplication was UI-only: the structure screen showed no pool names/sizes for real pools, and legacy numbered pool slots each rendered a full settings card.
- Fix: the category card shows "N pools · X players" when collapsed and, inside the one expansion, editable pool-name boxes with per-pool player counts (default Pool 1, Pool 2; saved names kept). Legacy numbered slots render inside the first card only and inherit its settings on save (`mirrorPoolGroupSettings`). Pool names save as `league_pool_names` → stage `poolNames` (labels only; no players/fixtures/results touched).
- Tests: `src/test/category-pools-model.test.ts`; `card-structure.test.tsx` default name updated.

## 2026-10-21 — Swiss + round-robin finish opened to all clubs; pool card general
- RR-finish gates (setup switch, validation, draw spec, display, projected fixtures, auto-progress bundle source) no longer require Riverside; behaviour only activates when a category's `rrFinish.enabled` is set. Read-only check: only one Riverside tournament has it on, so no existing tournament changes. Riverside-only withdrawal/position-keeping and per-category Swiss round counts remain Riverside-gated.
- Single category card with named pools was already club-agnostic.
- Uitsig Men's A audit (read-only): already ONE division with 2 pools (merged 2026-10-21); any A1/A2 cards seen are from the unpublished frontend or a stale device copy. No migration needed.
- `auto-progress-tournaments` engine bundle rebuilt but NOT deployed (awaiting approval).

### 2026-10-21 — Swiss + RR finish preview crossed groups before Round 2 finished
- Symptom: Uitsig Men's C projected Round 3 paired positions 5/6 into the top four.
- Cause: `buildProposedSwissGrid` fell back to plain Swiss / fixed 18-player chart projections for Rounds 3–5 until Round 2 was complete.
- Fix: rounds 3–5 always use the fixed RR group plan (provisional from current standing until Round 2 completes). Live generation was unaffected (it only writes after the previous round completes). Test: `src/test/swiss-rr-finish-preview.test.ts` (3×4 and 4×4).

### 2026-10-21 — Controlled rollout safety hold (no deployment or data mutation)
- Full current suite: 423 files, 3421 tests; 3301 passed, 22 failed, 98 skipped. Historical isolated comparison reproduced 21 matching failures before horizontal layout at `3d31a8848295175df7edd925f4452a60b9374719`, and those same failures before pool UI (`2f064206c`) and all-club Swiss rollout (`adce80b13`). The remaining ScanPay failed-settlement-dialog test is intermittent and reproduced at the pre-pool baseline. No confirmed newly introduced test failure; baseline comparisons reran all currently failing files, not the entire historical suite.
- 60 focused RR/pool/play-by checks and 368 relevant Swiss/pool/scheduling checks pass. Fresh security scan has 30 previously user-ignored findings and no active findings; ignored findings unchanged.
- Authenticated localhost checks with production writes blocked: Riverside Division 3 has RR standings immediately after R5, working jump/back, no old side panel; Uitsig C/D show RR groups, with standings correctly absent before R3 activity. Men's A and Ladies B viewed without saving. No page errors or blocked fixture-write attempts.
- Hold release for safety review: checked-in auto-progress engine bundle predates the latest provisional RR projection correction; `pushStructureRoundsLive` still updates persisted stage-config mirrors only for Riverside; timed decided-fixture creation and booking use separate RPCs and retry recovery after booking refusal is not established. Scheduled handler selects active structured tournaments globally, so deployment cannot be treated as display-only.
- No app source fixes, publication, Edge Function deployment, fixture regeneration, migration, protected-category mutation or hardware action during this audit. Post-deployment and third-club checks remain pending because the owner explicitly required stopping on meaningful deployment risks.

### 2026-10-21 — Frontend-only publication assessed and withheld
- Owner explicitly allows provisional/projected R3–5 groups and pairings before R2 completion, subject to change, without provisional bookings or notices; existing projection behavior retained. Fifteen RR projection/display checks pass.
- Frontend-only does not guarantee display-only: manager tournament view mounts `StructuredEnginePanel` / `StageProgressPanel`, whose effects can attach planned playoffs, auto-progress, schedule and notify independently of the Edge Function. Opening setup can publish local answers when server answers are absent; changed serialized plans autosave and invoke fixed-stage reconciliation/timed scheduling (`StepByStepBuilder` lines 412–424, 694–720). Explicit Structure save also retains non-Riverside stage mirror inconsistency.
- Stopped under owner's material-risk condition. No application source changes, publication, service deployment or live tournament mutation. Live Riverside/Uitsig new-version verification cannot occur without release; attempted read-only setup browser check redirected to dashboard, so no setup verification claim. Existing published URL remains https://squashhub.lovable.app.

## 2026-10-22 — Club-sponsored items at the staff till
- Owner chose the signed-in staff till (not PIN counter mode) for barmen to ring up club-sponsored items, so admin no longer has to capture them afterwards.
- `CounterSaleDialog` gains a "Club sponsored (no charge)" action: same basket, reason required, each line posted via existing `bar_club_use` RPC (stock down, cost to "Stock club expense", never a sale). Non-stock basket items are blocked with a message. Build OK; no live test yet.
- Follow-up: the signed-in till sale screen is hardcoded off (`canSeeVisitors = false` on the Bar / POS page), so the sponsored action was unreachable. `CounterSaleDialog` now has a `clubUseOnly` mode (basket of stock products only, no customer/payment UI) opened from a new "Club sponsored — no charge" button on the Bar / POS page, gated by the Bar / POS permission (`useHasPermission("bar")`); the server RPC remains the enforcing authority. Verified signed-in at Riverside: dialog opens, Record stays disabled until a reason is entered, payment/customer UI absent; nothing submitted.

## 2026-10-22 — Pro-rata joining fee raised when a fee category is set; approval prompts for category
- Gap: admin assigning a fee category (MembersTab EditMemberDialog) saved the category but never raised the pro-rata club joining fee — only the member's own signup wizard did. Uitsig applications (Rehan Aziz, Yolandi Strydom, Oct 2026) had only the R200 registration fee.
- Fix: new `src/lib/joining-fee.ts` (`decideJoiningClubFee` pure decision + `ensureJoiningClubFee` idempotent writer). Idempotency: skips when any club/membership fee row exists, when billing-exempt, or when the category fee is zero; mirrors the wizard label and `computeJoinFee` pro-rata/full-fee rules (category due_month/due_day/pro_rate, joined_at as the join date).
- EditMemberDialog now calls it after saving a category. PendingApplicationsPanel: Approve no longer requires the applicant to have finished — when no category is set, the admin is prompted to pick one (saved, fee raised) before `review_membership_application` runs; applicants with a category get the same idempotent fee check on approval.
- Tests: `src/test/joining-fee.test.ts` (6 rules) + `src/test/joining-fee-ui.smoke.test.tsx` (import smoke). Not exercised end-to-end against the live database; no data changed.

## 2026-10-22 — Member "Available to spend" card; credit wording settled
- Owner wanted members to see what they may still spend (court/lights/bar), taking recurring payment arrangements into account, prominently on the dashboard.
- Added `src/lib/spend-summary.ts` (pure: allowance = recurring-plan fees + approved credit − owing, plus advance credit), `use-spend-summary.ts`, and `src/components/dashboard/AvailableToSpendCard.tsx` on the member home page; hidden when the club has nothing configured for the member.
- Wording (owner's choice): read-only member notice reads **"Club credit allowed: R…"** — not "Additional club credit allowed", not "Your credit limit" (`src/components/club-admin/MemberCreditControl.tsx`). Admin controls and the booking note already said "credit allowed" and were left unchanged.
- Owner confirmed the behaviour: a member whose available amount is negative may still book (the recurring arrangement covers it) — no change to the booking gate.
- Tests: `src/test/spend-summary.test.ts` (6 rules) + `src/test/member-credit-control.test.tsx` label test (15 pass together). Published to Riverside; owner verified the card there.

- 2026-10-22: member_account_gate referenced non-existent club_member_fee_payments.club_id for members with an active monthly mandate, so booking eligibility, bar account preview and the Available to spend card failed (e.g. Gordons Bay). Fixed by scoping fees via club_members.club_id (migration fix_member_account_gate_club_scope).
- 2026-10-22: Applicants could not see membership categories (RLS allowed only approved members or show_on_landing). Added policy letting signed-in users read active categories with annual_fee > 0; application form lists only those, with descriptions, and shows pro rata to next renewal + once-off registration fee, payable after sign-in.

## 2026-10-22 — Google sign-in now asks "is that you?" before treating someone as a member
- Read-only check (Nelspruit, Taylor Gower): her member row NSC362 was created 2026-08-24, her auth account only on 2026-08-30 by Google (`auth.identities` shows Google only, email confirmed at creation), and that account was linked onto the existing row. She never applied as a new member and was never asked for terms acceptance — proof that a Google login can land on an existing membership without any confirmation.
- Added `src/lib/google-identity-check.ts` (`decideGoogleIdentity`, `googleNameOf`, `isGoogleSignIn`) and `src/components/GoogleIdentityCheck.tsx`, mounted in `AppRoutes` for signed-in users. Once per account per club per browser session, a Google login that does not already own a membership row at the club is asked: "Wait — is this you?" when a member matches by name or email (answering no leads to "Don't you have another Google account?", which signs out and returns to the club sign-in screen), or "Is this a new membership application?" when nobody matches (answering yes sets `sh.open_membership_wizard` and `Dashboard` opens the fee steps). Email/password logins and already-linked members are never asked, and no answer ever blocks anyone.
- The member list is only read through the existing SECURITY DEFINER `check_member_duplicate_hint(_club_id,_name,_email,_phone)`, which returns at most five masked names/emails — no roster or contact details reach the browser.
- Tests: `src/test/google-identity-check.test.ts` (7 decision rules) and `src/test/google-identity-check-dialog.test.tsx` (5 dialog flows, mocking only contexts/router so the real dialog renders). Signed-in preview shows no prompt for a normal login and no page errors. Not published; no member, application or account data changed.

- 2026-10-22 Planned play-off bracket showed "Qualifier 1..8" after pools finished: Riverside AABB Mens A 2 stages all had pairing "Decide later" (no seeding rule), so no names could be mapped. A front-added stage now inherits a later stage/category pool pairing; undecided pairing is stated plainly; bracket shows live pool standings with connectors. Display only.
- 2026-10-22 AABB Mens A 2 pairing: saved setup holds "Decide later" on QF/SF/Final (format_plan and answers); likely lost when SF/Final were binned and re-created by the structure sync. Sync now carries a saved pool pairing to a newly added front stage.
- 2026-10-22 Play-off fixtures missing from Upcoming Fixtures (Riverside AABB Mens A 2): spec division kept stale "Decide later" deferredStages (SF/Final) and attachPlannedPlayoffs skipped any division with deferred stages, so later saves with QF+crossover never created stages/placeholders. Now replaced on explicit save (idempotent); new first stage starts only if its pools are finished; placeholder fixtures show "Awaiting qualification" with no actions. Note: 3 tests in playoff-progression.test.ts already failed before these changes.

- 2026-10-22: Tournament builder saves — one shared save pipeline (setup + play-off fixtures) for Stages & Scheduling, footer and Summary; Summary save previously skipped fixture reconciliation. Added "Save & update fixtures" bar beside play-off stages with unsaved indicator.
- 2026-10-22: Tournament-wide legacy Play-offs card (Position N bracket) showed Men's A 2 play-off rows under every category; structured tournaments now scope it to the selected category and skip categories with their own planned bracket.

## 2026-10-22 — Riverside AABB Ladies B hybrid group labels
- Read-only audit: saved main Swiss stage and stage mirror both have 18 entrants, five rounds, RR finish enabled/two groups. All nine R3 games completed; nine R4 games are saved, unscored, unbooked, no sent/pending draw notices. R4 group B is correctly Amelia–Sune and Hannelie–Donique; Megan–Tasha is a Swiss game, not a group game. No saved R5. No record correction needed.
- Root cause: saved grid labels came from all-entrant cumulative standings after R3; only RR rows were relabelled to their R2 positions, leaving Swiss Megan at 6 alongside fixed Hannelie at 6. Position-based pending-slot coverage consequently added an extra unresolved slot. Membership colors already used R2 identities, but labels/order contradicted them.
- Shared `hybridSwissTable` preserves R2 RR pairing positions and reranks only the residual cohort; qualifying-opponent points remain frozen against later RR results. Integrated page standings, progression model, saved grid, projected writer and structured generator; per-round position maps avoid stale map carry-over. Existing saved fixtures remain factual and never rewritten. Server engine regenerated locally only; deployment withheld.
- Regression coverage includes 18/two groups, source/projection parity R3–5, 18 players once per round, 12 unique internal RR matches, no Swiss rematches, frozen labels/colors, no duplicate pending rows and no ranking influence from other groups. Protected Uitsig charts and Men's A2 bracket tests retained. No hosted data changes or publication.

## 23 October 2026 — Uitsig duplicate member merge
- Owner-requested merge of duplicate Danie Naude records: kept #UITS3707 "Danie (kiepie) Naude" (Premium, registered login, R163 owed, ladder 89); retired #NSF0818 "Danie Naude" (Day, unregistered May-import, ladder 88, person SSA000899).
- Moved the active Northern Squash Association affiliation (NSF0818, nsa_team_sheet) and the SportyHQ profile to the kept record/person; deleted the duplicate's inactive NSA level-12 league registration, ghost club ranking-snapshot entry and six expired activation invites; marked the duplicate person `merged` with `merged_into_person_id`; deleted the #NSF0818 club_members row. Suspension/delivery audit history untouched.
- Verified read-back: one Danie Naude row remains in Uitsig; affiliation and SportyHQ attached to kept record; duplicate person status merged.

## 23 October 2026 — Income statement tips rows netted per person
- The Bar section of the income statement listed every "Tip income — Name" and "Less: Tips paid — Name" line. Now each person shows one default row "Tips — Name" with only the outstanding amount (received − paid); fully settled people are hidden. Expanding the row shows Received, Paid out and Outstanding.
- Change is display-only in `src/lib/finance/grouped-income.ts` (tips paid removed from allocated direct-cost rows and netted per person) and `src/components/club-admin/IncomeStatementTab.tsx` (expandable rows); division gross profit and totals are mathematically unchanged. CSV export shows the same net rows.
- Test added in `src/test/grouped-income.test.ts` (13 pass); verified live on Riverside (WP R75.30 received − R20.00 paid = R55.30 outstanding; Sonja R7.40). No data changed, not published.

## 23 October 2026 — Bar staff payroll (salaries + monthly tips payout)
- New "Staff" step in Bar / POS setup: monthly salary per counter-PIN person, club pay day (1–28), and the monthly payout run with review/adjust/confirm. Payout runs are prepared automatically at 06:00 Johannesburg on the pay day (pg_cron `bar-prepare-payroll-runs` → `_bar_prepare_payroll_runs`); nothing is journaled until confirmed.
- Confirming posts per person: tips as `bar_tip_payouts` method 'salary' (method CHECK widened from cash-only) with journal debit `bar_cost_of_sales` "Tips paid — Name" / credit `bank_current`, plus salary debit `bar_cost_of_sales` "Salary — Name" / credit `bank_current`. Tips are capped at each person's unpaid balance, matching the cash payout rule.
- Schema: `club_bar_settings.staff_payday`, `bar_staff_salaries`, `bar_payroll_runs`, `bar_payroll_run_lines` (RLS read = bar/finance permission; writes via RPCs `bar_set_staff_payday`, `bar_set_staff_salary`, `bar_confirm_payroll_run`; read model `bar_staff_pay_overview`). Migration `drizzle/migrations/0249_bar_staff_salaries_and_payroll.sql`.
- UI: `src/components/bar/BarStaffPay.tsx` wired into `HonestyBarTab.tsx` stepper; amount rules in `src/lib/bar/payroll.ts` with tests `src/test/bar-payroll.test.ts` (3 pass).
- Verified signed-in on Riverside: Staff step shows pay day setting and Sonja R7.40 / WP R55.30 outstanding matching the database; cron job active. NOT exercised: the automatic run creation and the confirm posting (would write real payroll/journal records — needs owner authorization). Not published.

## 23 October 2026 — Round-robin views use Swiss table format; pools combined per round
- `RoundRobinCleanView` round panels now use the Swiss grid's table format (Pos | Player | Day & time · court | Result, two-row match blocks, status pill, W/L + score), reusing the exported `WhenTag` from `SwissPositionGrid.tsx`. `ROUND_STATUS_VAR` maps RR round status to the same status colours.
- New `RoundRobinCombinedCleanView` / `RoundRobinCombinedPilotView` in `src/components/tournaments/RoundRobinPilotView.tsx`: when a category has more than one pool, every pool's matches for a round render in ONE shared round table with a colour-banded pool section row (`riverside-rr-band`, `data-rr-group`), and standings render in one shared table with a Pool column. Single-pool categories keep the original per-pool view unchanged.
- Wired in `ClubChampsView.tsx` `renderRoundRobinPilot` and the hybrid later-stage RR block (later-stage pools also combine). Display only — no fixture, result, or schedule writes.
- Tests: `src/test/round-robin-clean-view.test.tsx` (5 pass, incl. combined-table test asserting both pools in one table and no input mutation), `src/test/round-robin-view.test.tsx` (16 pass). Verified signed-in on Riverside AABB (Rounds 1–3 show Pool A green / Pool B amber in one table; standings show a Pool column). Preview only, not published.

## 23 October 2026 — Payroll pay day 1–31 + preparation fix; first Riverside test run confirmed
- Bug: `_bar_prepare_payroll_runs` failed with "column reference period is ambiguous" (local variable shadowed the column) — the nightly cron would never have prepared a run. Fixed in migration `drizzle/migrations/0250_bar_payroll_fix_and_payday_1_31.sql` by renaming variables and qualifying columns.
- Pay day now supports 1–31 (was 1–28): constraint, `bar_set_staff_payday` validation and the Staff step input/label updated; effective run day is `least(payday, last day of month)` in Africa/Johannesburg, so day 31 runs on 28/29 Feb etc.
- Test run on Riverside (owner-authorized): salaries WP R500 / Sonja R1 000, pay day 23. Preparation created the October run; confirmed through the Staff step UI. Books verified: per person, debit `bar_cost_of_sales` / credit `bank_current` for "Salary — Name" and "Tips paid — Name" (R1 000 + R7.40 Sonja, R500 + R55.30 WP); tip payouts recorded with method 'salary'; outstanding tips now R0.00 for both. History shows "October 2026 — confirmed 2026/10/23". Not published.

## 23 October 2026 — Live scorer no longer posts friendly/ladder/league games onto Club Champs fixtures
- Bug: `MatchMarker.tsx` saveResult auto-linked any saved game to a single unplayed Club Champs fixture between the same two members, ignoring `config.matchType` (MarkerSetup defaults to "friendly") — a casual friendly could complete the official fixture, move ranking points and release the court booking.
- Fix: new pure guard `mayAutoLinkChampFixture` in `src/lib/marker/champ-auto-link.ts`; auto-link now only when the game was explicitly set up as Club Champs / tournament (plus existing forfeit/doubles/member/club checks). Explicitly launched tournament games (`config.source === "tournament"`) are unaffected.
- Tests: `src/test/marker-champ-auto-link.test.ts` (6 pass). Not published.

## 23 October 2026 — Hourly staff pay, normal/special shifts and shared tips
- Added Per hour alongside monthly/per-shift pay, configurable normal opening (16:00 initial default), paid start/end logs, attendance history and reason-required corrections of unpaid/unallocated attendance.
- PIN entry prompts Normal/Special; normal pays from the later of entry/opening, special asks a start time and optional shared tips. Exit closes only that person's attendance; cash-up closes all participants across counters. Multiple shifts/day supported; overlapping staff attendance refused. Lost-connection/open logs are reviewed, not auto-ended.
- Shared special tips allocate proportionally to paid hours with deterministic cent rounding; unallocated tips withheld, original sale identity retained, balanced named income reclassifications appended. All staff/payroll/correction readers use the allocated-earnings view; payout triggers enforce unpaid balance. Zero-hour allocations exposed for management review.
- Payroll uses closed hours and a preparation cutoff, keeps adjustable totals, and posts EFT salary/tips only after confirmation. Migration 0252 plus management/review/history follow-up 0253 applied; generated types refreshed. Existing historical staff payments/tips unchanged.
- Verified 35 focused frontend checks and isolated PostgreSQL hourly pay, R120 6:2 tip split, duplicate closure, multiple shifts/day, personal exit, revoked session, foreign club and EFT override checks. Signed-in Riverside read-only Staff screen verified; fictional intercepted UI saved R60/hour, showed 6.50 hours/R390 and dated log, started special shared shift and recorded exit with no page errors. No hosted attendance or payout records created, no hardware/tournament writes or publication.

## 23 October 2026 — Editable payday review and no-payment month-end preview
- Added per-run hours/shift count, rate and total inputs alongside pay/tips. Quantity/rate recalculate pay; direct total edits change wages while retaining tips, preventing invented tip balances. Stored original and approved values on confirmation via migration 0254; underlying attendance and default staff rates unchanged.
- Run month end — preview uses existing read-only accrued hours/pay/tips, allows hypothetical checks and has no confirmation/preparation action.
- Verified 13 pure payroll tests, isolated PostgreSQL original/approved snapshots and unchanged default rate/EFT accounting, and signed-in fictional UI hours 8/rate 60/total 600 → pay 510; preview 10 hours → total 590 with no processing request or page errors. Preview build OK; no real payout or publication.

## 23 October 2026 — Multiple barmen on one counter
- Add barman verifies another personal PIN without ending the current person's attendance. Named serving choices select the original token and revalidate board/attendance; sale authority stays server-side. End shift closes only the selected person; confirmed device exit closes participants retained on that device. Existing shift joining, shared tips and all-counter cash-up remain unchanged; no schema or real financial changes.
- Verified 25 focused tests and fictional browser PIN entry, same-shift joining, Alex-attributed tab, serving selection and Blake-only shift end with no page errors; preview build OK. Hosted writes intercepted, no publication or real attendance/sales/payouts; physical PWA/native devices not exercised.

## 23 October 2026 — Shift-start failure reason hidden
- Screenshot shows a generic start failure. ShiftStartDialog discarded plain-object RPC error messages; preserve the actual server refusal rather than pretending the shift started. Hosted PIN unlock creates a fresh session and start refuses another session for an already-clocked-in person; this is a possible cause, not established for the screenshot. No relevant failed request in supplied telemetry; real attendance remains untouched pending retry evidence.

## 23 October 2026 — Explicit shared-counter shift ending
- End shift now asks which locally signed-in barmen to clock out, with Both barmen/All barmen and individual checkboxes; nothing ends until confirmation. Existing personal-PIN ending RPCs, cash-up and payroll unchanged. Successful individual endings are removed immediately so partial failures do not retry revoked sessions.
- Eighteen counter tests pass including one-person and both-person endings; fictional browser selection/confirmation leaves the other person serving with no page errors or hosted writes. Build OK, not published. Reported start refusal remains unresolved pending the actual retry message.

- 2026-10-23: Shift start refused ("already has an open shift") when a barman signed in again with a new counter session while their earlier attendance was still open (Riverside, Sonja). Fix 0255: start_shift now moves the open attendance to the new session; paid start/hours unchanged.

## 23 October 2026 — Explicit special-shift tip choices
- Replaced ambiguous split checkbox with own tips, hours-weighted sharing and equal sharing; joining retains the current shift's choice. Attendance history names the policy. Equal sharing preserves actual hours, distributes leftover cents deterministically and excludes staff without paid working time.
- Additive policy and PIN-authorised start RPC preserve legacy shifts and immutable allocations; existing cash-up, earning, review and EFT payout paths remain authoritative. No hosted attendance, sales or payouts created; no publication. Focused UI and isolated PostgreSQL checks cover all three policies.

## 24 October 2026 — Unsigned clubs must not receive new membership applications
- Public landing and club auth hide new-member signup/QR when the club has not signed its SLA; direct application links show a notice directing applicants to the club website or saved contact details. Second-club application controls use the same availability check. Existing login, imported-member activation and visitor flows remain available.
- Migration 0258 exposes only a public availability boolean, not signature/billing details; join and second-club writers refuse new applications, and signup skips new membership creation at unsigned clubs while retaining existing-record linking. Existing applications and SLA records are unchanged.
- Nineteen focused frontend tests and disposable PostgreSQL signed/unsigned signup, join refusal, second-club refusal and imported-member activation tests pass. Fictional browser checks verify direct-link refusal, hidden landing signup, retained login/activation and signed application form; no page errors, preview build OK. No real applications created or publication; shared backend safeguards are applied immediately. Clubs have no saved website field, so the notice uses existing contact details rather than inventing a website.

## 24 October 2026 — Ladies B fixture-list round labels
- Follow-up correction: owner latest setup screenshot specifies 22 October / 29 October / 5 November, superseding earlier stage dates. Audited stage and match play-by updates plus linked legacy-round overrides align all twelve fixtures, four per deadline. Saved round identities remain historical; display uses the approved three-round projection. Full protected-field fingerprint comparison passes, retaining four results and all bookings/dates/courts. Signed-in list verifies R1 22 Oct and R3 5 Nov; two 10 November allocations remain visibly flagged pending replacement-slot approval. Seven focused tests pass, preview build OK, no publication.
- Symptom: booking-list headings retained R4/R5 despite three configured RR rounds. Finding: pool progression already projected the complete four-player pools, but fixture lists read saved legacy numbers. Fix: reuse that pure projection for ID-to-round labels in both fixture lists. Guard: exact event/category/three-round scope; original fixture objects, results, bookings and deadlines remain unchanged. No hosted writes or publication.

## 24 October 2026 — Trial clubs may accept applications; Ladies B fixtures audited read-only
- Owner clarified active trials must accept applications, including Uitsig and St John's Harare. Migration 0259 extends the same public boolean to unexpired active/trial/trialing subscription records. St John's Harare has no subscription record, so its exact club ID is an explicit owner-approved exception without inventing a trial end date or marking its SLA signed. Existing SLA-signed clubs remain allowed.
- Ladies B structured setup has three RR dates (19/22/29 October), but all twelve unique saved pool fixtures retain legacy round numbers 1–5. The four screenshot fixtures are required unique opponents, not duplicate/obsolete games; two have 10 November bookings. No tournament, result, booking or deadline changed or deleted.

## 24 October 2026 — Ladies B: cancelled automatic 10 Nov slots; last raw round labels replaced
- Owner asked whether the two 10 Nov 18:00 slots were member-made and ordered them cancelled in favour of "By date 5 Nov". Finding: both slots (Elizane v Jenny Arnold, Court 1; Austyn Ras v Lisa van Reeuwijk pool partner, Court 4) were created automatically at draw generation on 13 Oct with booking_id NULL — no member booking and no linked court booking backs them. Guarded audited update cleared scheduled_date/time/court_id on exactly those two rows (match-day guard bypassed via service-role claims, only for these rows, results untouched); play_by remains 2026-11-05. Six external GoBook reservations on 10 Nov evening (18:45–21:00, courts 27/36) are not linked to any SquashHub match and were left untouched.
- Residual "Round 3 · Play by 29 Oct" symptom: member-facing surfaces that never see the builder spec (Bookings match picker, MyChampionships rows) labelled rounds from the saved legacy round_number. Fix: new pure helper `uitsigLadiesBRoundFromDeadline` maps this category's unique play-by dates (22 Oct→1, 29 Oct→2, 5 Nov→3), falling back to the saved number elsewhere; wired into both surfaces. Round-robin progression view re-verified: Round 2 shows 29 Oct, Round 3 shows 5 Nov, no 10 Nov slots remain.
- Four tests pass (incl. new deadline-mapping cases); preview build OK; no publication.

## 24 October 2026 — Remaining Ladies B Round 3 / 29 October heading
- Owner screenshot exposed an incomplete fix in Tournaments' grouped games list. Its round helper now prefers the resolved fixture deadline (including linked-round fallback) before pool projection or historical round number; this also works without complete pools. Exact tournament/category scope retained.
- Authenticated Uitsig live DOM verifies Lisa Rahman–Yolanda Coetsee now shares Round 2 / 29 October; no Round 3 / 29 October heading remains, Round 3 retains 5 November. Five focused tests and preview build pass. No saved fixtures/results/bookings or publication changed.

- 25 Oct 2026 — Ladies B Lisa Rahman v Yolanda Coetsee wrongly shown as Round 2 · 29 Oct: the legacy round-3 row (self, 29 Oct) overrode the fixture's confirmed 5 Nov deadline in `resolveFixtureSchedule`. For Uitsig Ladies B, a fixture's own confirmed deadline (22 Oct / 29 Oct / 5 Nov) now wins over legacy round rows on every surface; matches the progression table (R3 by 5 Nov). Tests added; no data changed.
- 25 Oct 2026 — Owner confirmed the corrected Ladies B display ("looks better now") and chose to publish now despite the pre-existing dompurify/jspdf supply-chain finding (unrelated to this fix). The verified round/deadline display fix was published to https://squashhub.lovable.app. No tournament, result, booking or deadline data changed by publication.

## 25 October 2026 — Visitors removed from court-booking pickers unless they hold a live pass
 
## 25 October 2026 — CSIR Thursday Social weekly invitations
- Three future confirmed attendees had identical September answer timestamps repeated through December. Reset only those copied future answers to invited, with organiser triggers suppressed; past attendance/newer replies unchanged. All six future occurrences now have 12 awaiting reply and zero confirmed/declined.
- Event detail and notification actions now read/write addressed instance attendance and counts; legacy weekly reminder notifications expose Confirm/Decline. Cards no longer fall back to old series attendance. Initial/change WhatsApp invitations target their exact occurrence. Self-join confirms only the next occurrence, not every future week.
- Reminder invitations now carry member/club/instance identity, exact occurrence links and both channel suppressions; email goes only through the explicit outbox (not also the generic notification email bridge). Reminder hours use the actual start instant. Migration 0262 enforces current event switches on event notifications and repairs a stale push-function destination. Reminders deployed; no test invitations sent.
- Current event settings verified: push/email ON, WhatsApp OFF (unchanged). Approved rsvp_question has no quick replies; actual WhatsApp buttons remain unavailable pending a separately approved button template. No provider template changed.
- 80 focused frontend checks and isolated PostgreSQL email/push/string-data gates pass; signed-in CSIR event detail shows 29 Oct, zero confirmed/12 awaiting and Confirm/Decline. Intercepted Confirm targets this occurrence only; no real answer submitted. Preview build OK. Physical push/email receipt not tested; frontend not published.

## Visitor picker details
## 25 October 2026 — Six-pool picked-player preview
- GW Double Open at Riverside retains six pools, 24 pairs, 48 registrations and no generated fixtures; flat Pick board was category placement, not a persisted one-pool draw. Added a read-only pool preview reusing reciprocal pair validation, combined ranking-point seeding and shared Snake allocation; missing partners/rankings show six pending pools, never guessed entries. Individual Rankings ordering now uses ranking points, not ladder.
- Saved event scope is Regional; regional ranking data is not available, so ranked allocation remains blocked rather than substituting club ladder. Ten board/preview plus thirty existing draw/pool checks pass; build OK. Authenticated saved setup read verified six-pool summary but navigation did not reach Pick. No hosted tournament writes, generation, notices or publication.

## Visitor picker details (continued)
- Owner rule (via WhatsApp screenshot): visitors must feature nowhere in court booking selection unless they hold an active, paid day / 3-day / month visitor pass. Symptom: Nelspruit's opponent picker listed 17 visitor member records (incl. "Visitor League 1/4") and the visitor dropdown listed the whole club_visitors registry regardless of passes.
- Fix: migration 0260 adds SECURITY DEFINER `club_bookable_visitors(club_id)` returning visitor-role members with a live pass (reuses `has_active_visitor_pass`: status active, inside valid window), gated to club members and admins; GRANTs to authenticated/service_role. Bookings.tsx visitor dropdown now reads this RPC instead of the club_visitors registry (empty state: "No visitors with an active pass."), and the opponent member picker skips visitor-role members not in the live-pass set via pure helper `isVisitorWithoutLivePass` (mirrors server decision; server remains authority). Free-text guest naming (member brings a guest, visitor fee) is unchanged.
- Verified: disposable active/expired passes at CSIR proved live-pass semantics; signed-in RPC call as owner returned only the active pass holder; authenticated browser check at Nelspruit shows none of the 17 visitor names in the member picker (admin Vian Crafford correctly remains) and the visitor dropdown shows the empty-pass message. 17 focused tests pass; preview build OK.

## 2026-10-26 AGM secret ballot
Added Communications > AGM voting: draft ballot, voter list, personal one-time links (/vote/:token), turnout, results after deadline with anonymous receipts. Uitsig 2026 ballot seeded as draft.

## 26 October 2026 — League info save blocked for members-permission holders
- Symptom (Nelspruit, edit member Zach Wiid): "League info: new row violates row-level security policy for table member_association_affiliations". Cause: club_members UPDATE allows `has_club_permission(auth.uid(), club_id, 'members')` holders (e.g. Raymond Gates), but member_association_affiliations policies only allowed the member themselves or `is_club_admin`, so the affiliation insert/update in MembersTab failed after the member row saved.
- Fix: migration 0265 adds SELECT/INSERT/UPDATE/DELETE policies on member_association_affiliations for members-permission holders, mirroring the club_members "Members-permission holders" policy. Existing member/admin policies unchanged; affiliation numbers remain permanent (never deleted by app flows).
- Verified signed in as Raymond Gates: upsert (as the app sends), update and read all succeed; Zach Wiid's affiliation (number 168, active) unchanged. Backend fix is live immediately; no frontend change or publication needed.

## 2026-10-26 — Joining fee no longer raised on member edit
- Removed the auto pro-rata joining-fee raise from the admin Edit Member save (MembersTab.tsx); it fired for existing members (e.g. Zach Wiid R1,925) who had no club-fee row. Genuine new-application approvals (PendingApplicationsPanel) still raise the joining fee.

## 26 October 2026 — Three new Uitsig members added + activation emails
- Added Melinda Marais (UIT0024), Christian Reeve (UIT0025), Elmien Brink (UIT0026) via the app's own Add Member flow (signed in as owner, Uitsig): Premium category, gender groups, +27 phones, 2026 club fee rows marked paid per owner instruction. Activation emails sent via Members > Activation links; comms_deliveries shows status sent, no errors; personal invite tokens valid 14 days.
- Ledger quirk found: trg_journal_fee_assessment posts the debtors/income pair on INSERT even when the fee row is inserted paid=true, while trg_journal_fee_payment_received only fires on a later paid false->true UPDATE — so admin-added members showed R2,500 owed. Posted the standard "Fee paid" settlement pairs (Dr bank_current / Cr debtors) for the three fee rows with the function's own idempotency guard; balances now R0, bank +R7,500. The trigger behaviour itself is unchanged (pre-existing; also affects some Champs entry fees marked paid) — candidate for a trigger fix on owner approval.

## 26 October 2026 — Member statement showed "No transactions" while loading
- Symptom (Nelspruit treasurer Rachel Gates): opening a member's account from Members (balance "i" → Club Finance statement) showed no transactions and zero values.
- Investigated signed in as Rachel on preview and the published site: her Treasurer permission role grants `finance`, the journal-entries request returns 200, and Zach Wiid's statement renders fully (Total Billed R2,120 / Payments R120 / Net R2,000, 4 rows). Not a permission/RLS issue.
- Actual cause: the statement renders `(journalEntries || [])`, so while the club's journal query is still loading it shows "No transactions for this member." and R0.00 totals — on a slow connection this reads as empty/broken.
- Fix (FinanceTab.tsx): while the journal query is loading, the statement shows "Loading statement…" instead of the empty state and zeroed totals.
- Verified signed in as Rachel: statement still loads correctly with all rows and totals after the change.

## 2026-10-26 — Uitsig new-member numbers and pro-rata fee correction
- Request (Willem): the three members added 26 Oct (Melinda Marais, Christian Reeve, Elmien Brink) must carry the spreadsheet member numbers (column E) and pro-rated Premium fees raised on their spreadsheet "Date of Entry".
- Data correction (no code change): member numbers set to UIT3864 / UIT3894 / UIT3895; joined_at set to 2026-09-16 (Marais) and 2026-10-06 (Reeve, Brink). Fee rows changed from R2,500 full-year to computeJoinFee pro-rata against the 1 Jan renewal: Marais R833.33 (4 months), Reeve and Brink R625.00 (3 months each), labels "Club Membership (Premium) — Pro-rated N months", paid_at backdated to join date.
- Ledger: original 26 Oct journal rows re-dated to join dates; balanced adjustment pairs appended (Dr membership_income / Cr debtors and Dr debtors / Cr bank_current) for the R1,666.67 / R1,875 / R1,875 differences. Verified net per member: debtors R0, bank and income equal the pro-rated fee.

## 26 October 2026 — AGM invitation test email
- Added a member-personalised AGM test sent either to the signed-in admin or the selected active club member; one recipient only, server-resolved addresses and existing club-admin authorization. Fixed React Email preview includes saved meeting details and document download links. Test buttons are deliberately inactive: no tokens issued, ballot opened or RSVP/vote changed. No schema changes or bulk sends.

## 2026-10-27 — Uitsig freeze lifted; certified RR-finish fixture generation; progression preview blanks unsettled names
- Willem lifted the Uitsig hard freeze (backup at /mnt/documents/uitsig-fixture-backup-2026-10-27): `isFrozenUitsigTournament`/`assertTournamentPairingWritable` in src/lib/tournaments/swiss-sequencing-policy.ts are now no-ops; freeze tests rewritten accordingly.
- Progression preview (swiss-progression-view.ts): Swiss/RR-finish preview slots whose players are not provably settled render TBD with no name (Andre Swart / Wynand Ras no longer appear in Men's C Round 3 while their Round 2 game is open). Verified in preview and on the published site (published same day).
- Partial generation (migration 0278, `tournament_swiss_partial_rounds` flag for Uitsig, auto-progress-tournaments engine): certified RR-finish blocks (a full 4-player group provably final) become saved play-by fixtures even while earlier rounds are open. First run created Men's C R3 (Justin v Eben, Kamfer v du Rand, by 5 Nov) and R4 (Justin v du Rand, Kamfer v Eben, by 12 Nov); second run created Men's C R5 (Justin v Kamfer, du Rand v Eben, by 19 Nov) after the R5 round rows were corrected from scheduling_mode 'club' to 'self' with play_by 2026-11-19 (Willem's decision; groups 2/5/6 R5 rows still 'club'-scheduled, left untouched).
- Known behaviour: DB trigger `a0_champ_auto_walkover_withdrawn` auto-completes a newly created fixture when a player is withdrawn — Men's B R3 Tarryn Faber v Brett Cousins was created and immediately recorded 3-0 (w/o) (Brett withdrawn). Not a bug, but surprising in logs.
- Men's D generated nothing (3 undecided Round 2 games — correct). Edge function requires the internal secret header and is idempotent (repeat runs create 0).

## 2026-10-27 — Men's C/D Round 3 settled fixtures generated
- Willem confirmed settled Round 3 positions should become bookable fixtures while unsettled positions stay open (backup at /mnt/documents/uitsig-fixture-backup-2026-10-27 still the recovery copy).
- Men's D (group 4): created 3 Round 3 fixtures due 2026-11-05 — Daniel Dalton van Zyl v Richard Rilanco-Coetsee Snr, Berni la Grange v Wynand Bouwer, Alex Heyns v Nico Grunewald. All six players verified to have completed Round 2; three other group-4 Round 2 games remain open (Van Diermen v Langeveld, Naude v Ayob, Heyns Jnr v Schlodder), so their positions stay TBD.
- Men's C (group 3): created the 5 remaining settled Round 3 fixtures due 2026-11-05 (Leon de Lange v Hennie Engelbrecht, Riaan van Wyk v Michelle Arpin, AJ Barnard v Izak Kamfer, Clayton Schlodder v Lienke van Reeuwyk, Riaan van Reeuwyk v Ulrich Strydom); Justin v Eben and Kamfer v du Rand already existed. Pairings 5v8 and 10v11 left open pending Andre Swart v Wynand Ras.
- Method: guarded direct insert mirroring create_decided_swiss_game (the RPC is service_role-only and the auto-progress edge function needs its internal secret); guard_swiss_round_progression validated round order, Round 2 completion and duplicates. Verified in preview signed in as Willem: both categories' Round 3 panels show the new fixtures as "Real games" with play-by 2026-11-05 and no PROJECTED labels.

## 2026-10-27 — Settled-pair certification: Men's D R3–R5 and Men's C R4–R5 fixtures generated
- Certification widened in src/lib/tournaments/swiss-progression-view.ts: a round-robin-finish block is certified when BOTH players' positions are provably final across every outcome of outstanding games (previously required the whole group of four settled). 19/19 focused tests pass (swiss-partial-generation, swiss-settled, decided-play-by, decided-play-by-writer).
- Men's D (group 4): created 5 fixtures via create_decided_swiss_game — R3 Coenraad Strydom v Lisa van Reeuwyk (play-by 2026-11-05); R4 Frans Schelhase v Richard Rilanco-Coetsee Snr and Berni la Grange v Kasavan Reddy (2026-11-12); R5 Daniel Dalton van Zyl v Frans Schelhase and Kasavan Reddy v Wynand Bouwer (2026-11-19).
- Men's C (group 3): created 4 fixtures — R4 Leon de Lange v Bernard Welters and Riaan van Wyk v Manie Barnard (2026-11-12); R5 Hennie Engelbrecht v Bernard Welters and Manie Barnard v Michelle Arpin (2026-11-19).
- After generation the pure projection returns zero further fixtures for both groups; unsettled pairings (Men's C positions 5/8 and 10/11 pending Andre Swart v Wynand Ras; Men's D positions pending three open Round 2 games) remain open with no fixtures.
- auto-progress-tournaments engine rebuilt (bun scripts/build-auto-progress.ts) and redeployed with the settled-pair rule.

## 2026-10-27 — GoBook balance shown in member convention (Willem)
- Court Manager reports debtor balances (negative = member credit); My Account and Bookings showed the raw sign (−298.36 instead of +298.36).
- `src/lib/gobook-member-balance.ts` inverts the sign for display only (raw GoBook value untouched); positive credit renders green (`text-success`), owing red, zero neutral.
- Tests: `src/test/gobook-member-balance.test.ts` (4) — verified live on CSIR My Account: Lights Account R298.36 in green.

## 2026-10-27 — Nelspruit Court 2 league scoring entry restored
- Court 2's current LG001 v LG006 scorecard had one completed rubber and status setup, with no submission or totals lock. UpcomingFixturesTab incorrectly treated any saved summary points as a final result and disabled entry for Court QR devices/non-admin members.
- Partial setup/draft scores now retain Set up and mark game; past and submitted/confirmed/completed results retain correction restrictions. No RLS, result, lineup or fixture changes.
- Verified actual NSC Court 2 link (court database ID 10) opens the unfinished rubber's doubles scorer on phone and tablet; existing position 2 scores preserved, no test points or results saved. 26 focused fixture/device/access tests pass; build OK.

## 2026-10-28 — Member bar page simplified for signed-in members
- ScanPay (/s/:code) no longer shows the guest "Member of…? No login needed" prompt, the membership-number strip text, or name/phone tab fields to a signed-in active member of that club; their tab opens in their own name and is labelled "My tab", with a single "Add to my tab" action. Guests and counter mode unchanged. Tests: scanpay-signed-in-member-ui.test.tsx.
- Follow-up: HonestyBar selections stay local automatically; opening My Tab in self-service mode posts the selection to the existing unpaid shared tab and navigates to existing club-enabled payment choices. Removed the empty-tab opening button and member ScanPay empty-tab prompt. Staffed orders remain explicit. Removed signed-in app Club sponsored action; personal-PIN Counter action unchanged. No backend or live-data edits; frontend preview only.
- Counter shortcut now appears only for a confirmed signed-in scanned-club member or a locally named PIN session. Direct Counter links retain personal-PIN entry and server validation; account login never bypasses PIN. Pure account/PIN visibility tests added; no backend changes.
- Red member-credit banner reworded as a warning only ("Your member account doesn't have enough available credit to settle this. You'll need to pay by card or another payment method available at the club.") — it no longer reads as an instruction to pay by card now, and members can still keep selecting items. Shared constant in `src/lib/account-charge-gate.ts`, so the member bar page and club-admin preview both change together.
- Signed-in member bar page (HonestyBar) tiles no longer stay marked as selected: tapping a product adds one to the open tab and confirms with a toast ("X added to your tab", then "2× X on your tab" with a stable toast id), with no ring, count badge or remove-one control left on the tile; the tab count/total stays visible on the My Tab button and items are adjusted there. Scope is the logged-in member bar page only — Counter mode, staffed orders and the QR/poster page are unchanged. Tests: honesty-bar-selection.test.tsx.
- Online tab card payment could appear stuck: after the bank confirmed, the member often never returned from the hosted payment page, and the tab view only re-read its own row — so a paid tab kept showing "awaiting payment" until someone tapped Cancel card payment (Leigh Holing, NSC, 28 Oct: paid 12:09, settled 12:20). The ScanPay tab auto-refresh now also calls `bar-card-verify` (tab token authority, cancelled=false) while a tab is `closing`/`online`, so the gateway is asked every 5s and the screen settles itself once the bank confirms. Unpaid checkouts still auto-release after 15 minutes as before. Tests: scanpay-signed-in-member-ui.test.tsx; build OK.

### 2026-10-28 — Uitsig Men's A planned play-offs never attached
- Cause: `attachPlannedPlayoffs` matched the saved play-off plan using `poolLabels[0]` ("Pool A") instead of the category label ("Mens A") for multi-pool round-robin categories, so Men's A was silently skipped while single-label Ladies B attached.
- Fix: fall back to the division's own category label when the first pool label has no planned play-offs (`src/lib/smart-builder/step-draw.ts`); regression test in `src/test/attach-timeline-playoffs.test.ts`.

### 2026-10-28 — Structured play-offs after a multi-pool round robin collapsed to one ranked list
- Cause: `buildPlayoffChain` read the pool count only for `kind:"pools"` mains; a `round_robin` main always got `pools:1`, so the saved crossover pairing ("A1 v B2, B1 v A2") degenerated to seeded 1 v 4 / 2 v 3 fed by pool 0 only (Ladies B, Uitsig Club Champs 2026 — its saved semifinal mapping would have excluded Pool B entirely).
- Fix: round-robin mains now take their pool count from `poolMembers.length` (`src/lib/smart-builder/playoff-chain.ts`); regression tests in `src/test/rr-main-playoff-crossover.test.ts` (mapping, cross-pool resolution, winners-fed final, one-group fallback). 3 pre-existing failures in `playoff-progression.test.ts` (cross-league doubles ties) reproduce without this change and are untouched.
- Live data: Ladies B's already-saved semifinal mapping was corrected in place (guarded SQL: refuses if real games/bookings exist) and its two provisional rows relabelled "Pool A #1 v Pool B #2" / "Pool B #1 v Pool A #2". Men's A has no attached stages yet — its re-save now derives the correct crossover.

### 2026-10-28 — "Pool games" heading covered structured play-off games
- Cause: structured play-off rows carry round numbers 901+, which the "By round" list treats as "no round" and drops into the pool-games bucket (`src/pages/Tournaments.tsx`).
- Fix: `isStructuredPlayoffGame` (`src/lib/tournaments/round-plan.ts`) routes structured-stage play-offs into a "Play-offs" group (paced knockout rounds and legacy stage-label groups unchanged); test `src/test/structured-playoff-heading.test.ts`.

- 2026-10-28: Uitsig Men's A play-off bracket showed A1 v B1 / A2 v B2 because an older Play-offs-step "placement" style overrode the saved Semifinal crossover timeline in `plannedPlayoffBracket`. A saved Quarterfinal/Semifinal stage now takes precedence (display only); tests in planned-playoff-bracket.test.ts.
- 28 Oct 2026 — Bar tab: removed an accidentally selected 2x Sparkling Water (R20) from Andre Visser's open Nelspruit tab via direct row delete; stock restored through bar_stock_apply (audited correction). Open-tab totals recompute from bar_visitor_sales.

### 2026-10-28 — Chairman financial view-only
- Recognises elected Chairman and legacy/new role assignments; retains non-financial administration and financial read access. Club Full Admin/custom grants do not bypass canonical-table financial guards or transaction/approval/payroll action guards. Self-role changes and removal of own permission identity are blocked.
- Finance, fee, banking, chart, tournament payment and payroll controls use server-derived financial access. Existing session-owned bar payments retain a private transaction-local exception. Manual recurring collection/renewal/cancellation handlers verify caller and club before service writes/provider actions; scheduled service calls and owner self-service cancellation remain separate.
- Applied 0295–0298 and deployed six affected financial functions. No live balances/entries were changed; frontend not published.
- Validation: 36 focused tests passed including isolated PostgreSQL read/insert/edit/delete restrictions, unchanged R100 entry and tournament Paid denial. Signed-in platform-admin Riverside finance rendered. Authenticated Chairman path: UNVERIFIED (available session is platform Super Admin); provider payments and native hardware unverified. Security linter reports existing broad findings, not cleared by this scoped change.
