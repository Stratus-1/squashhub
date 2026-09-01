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
