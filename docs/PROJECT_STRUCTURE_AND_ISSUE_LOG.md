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
