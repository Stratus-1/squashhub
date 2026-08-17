# SquashHub — Project Structure, Issue & Fix Log

> **Purpose.** This is the canonical reference for *how the system is wired* and *what has already
> gone wrong and how it was fixed*. Before debugging anything in this project, search this file
> first. If a fix is recorded here, re-apply the recorded approach — do not re-invent it, and do
> not undo it.
>
> **Maintenance rule.** Every time a production issue is diagnosed and fixed, append an entry to
> §4 using the `Symptom → Finding → Fix → Guard` format. Never delete old entries; mark them
> `SUPERSEDED` if a later fix replaces them.

Last updated: **17 August 2026**

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

**Hard constraint:** Express returns depend on the exact whitelisted tenant host. Append
`?redirect_url=` using the club subdomain (for example `gb.squashhub.co.za`), never the apex or
`www` host. Body-level redirect fields are ignored by Express.

---

## 4. Issue log

Format: **Symptom → Finding → Fix → Guard.** Newest first.

### 2026-08-17 · Bar checkout returned 404 before payment
- **Symptom:** A QR bar customer reached a **404 page not found** before the card-payment form opened.
- **Finding:** `bar-card-pay` appended the branded success URL as `redirect_url` to Stitch's hosted
  link. For this club's Express link, that query parameter invalidated the hosted checkout URL.
- **Fix:** Bar checkout now opens Stitch's returned hosted URL unchanged. The original Scan-to-Pay tab
  remains open, verifies the payment independently, and displays the branded thank-you screen.
- **Guard:** Bar purchases are a standalone flow: never append return or redirect query parameters to
  their hosted payment URL. Do not copy the member top-up return strategy into Scan-to-Pay.

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
`src/lib/club-payments.ts`. Never append query params to Stitch Express links (404).
