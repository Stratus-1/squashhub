## Goal

Restore the original model: **platform base rates in ZAR (R6 / R5)**, with a per-club billing currency. Only clubs whose currency is USD (e.g. Riverside) see and are invoiced in USD; ZAR clubs see and are invoiced in ZAR; other currencies use FX from ZAR.

## What I got wrong last time

I hardcoded USD everywhere — Super Admin fee structure, club Subscription tab, participation card, SLA copy, Home pricing, and the billing edge functions. That flipped every club to USD instead of only the international ones.

## Fix plan

### 1. Super Admin → Fee structure (`SuperAdminSubscriptions.tsx`)
- Restore ZAR as the **base** platform rate: `saas_rate_zar_monthly` (R6), `saas_rate_zar_annual` (R5), `saas_min_charge_monthly/annual`, `saas_intl_uplift_pct`, `saas_fx_usd_per_zar`, `saas_fx_eur_per_zar`, `saas_fx_locked_at`, `saas_fx_review_due`.
- Bring back the ZAR + USD/EUR side-by-side rate inputs and the FX-lock UI.
- Labels back to "R" for ZAR base; USD/EUR shown as derived.
- Restore `SUBSCRIPTION_CURRENCY = "ZAR"`, `SUBSCRIPTION_SYMBOL = "R"`, ZAR-based defaults for the plan editor.
- Currency totals grid keeps supporting mixed ZAR/USD/EUR (it already does).

### 2. Club → Subscription tab (`SubscriptionTab.tsx`)
- Default currency back to `ZAR` in `fmtMoney` and `outstandingCurrency`, so a ZAR club sees "R…". Invoices already carry their own `currency` field, so a USD-invoiced Riverside row still renders "$…" — no logic change needed there.

### 3. Club Participation card (`ClubParticipationCard.tsx`)
- Use `useClubCurrency()` to drive the displayed rates:
  - ZAR club → "R6 / R5", "R0.60 / member / year" savings, ZAR estimate.
  - USD club → "$0.35 / $0.30", "$0.60" savings, USD estimate.
  - Other → show ZAR base + note "Invoiced in {clubCurrencyCode} at platform FX rate".
- Keep the 150-member cap + estimated monthly / annual block, but compute in the club's currency.
- Fee-commence note and SLA links unchanged.

### 4. SLA copy (`SquashHubSlaContent.tsx`)
- Revert to ZAR primary wording (R6.00 monthly / R5.00 annual / R60 per year / R12 savings), with the existing note that international clubs are invoiced in USD/EUR at platform FX.

### 5. Home page (`Home.tsx`)
- Revert pricing labels and FAQ back to "From R5" primary, with the secondary "≈ $0.42 USD • €0.38 EUR" line reinstated.

### 6. Billing edge function (`run-subscription-billing/index.ts`)
- Restore ZAR-base logic: `saas_rate_zar_*`, `saas_intl_uplift_pct`, `saas_fx_usd_per_zar`, `saas_fx_eur_per_zar`, `fxRateFor`, `resolveBillingCurrency`, `convert`, and the `clubCurrencies` map. Per-club invoice `currency` returns to being derived from the club's currency (ZAR default, USD/EUR converted).
- `stitch-pay-platform-invoice` and `platform-stitch-test-payment`: default currency back to `ZAR`, R-labelled test-payment strings.

### 7. Data repair migration
Only touches platform-settings / plans / open invoices, not paid history:
- `app_settings`: put ZAR rate keys back (R6 / R5 / R0 min / cap 150 / 0% uplift / FX rows blank for admin to fill).
- `subscription_plans`: Standard Monthly `price_per_member = 6.00`, Standard Annual `price_per_member = 5.00`, `minimum_charge = 0`, currency `ZAR`, descriptions back to Rand wording.
- `platform_subscription_invoices` where `status IN ('draft','open','issued')`: recompute using each club's currency (ZAR default; USD for Riverside) and the restored rates. Paid/settled invoices are left untouched.
- `club_subscriptions.amount_due` recomputed in the club's own currency.

## Confirmation before I start

Two things to confirm so I don't over-reach:

1. **Riverside is the only USD club today** — correct? If there are others, I'll pick them up via `clubs.currency = 'USD'` automatically, no hardcoding.
2. OK to touch **only unpaid** platform invoices (draft/open/issued) when recomputing? I'll leave any `paid` invoice history exactly as-is.

Reply "go" (with any tweaks) and I'll ship it.
