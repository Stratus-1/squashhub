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
