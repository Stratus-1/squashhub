## Goal
Wire **Stitch** (stitch.money) as a payment option for clubs, supporting:
- **One-off payments** — PayByBank (instant EFT) + Cards via Stitch's hosted LinkPay checkout
- **Recurring monthly dues** — DebiCheck mandate + scheduled collection

Mirrors the existing Yoco architecture so the rest of the app (fees, ledger, tournaments) keeps working unchanged.

## What changes

### 1. Gateway registry (UI)
Add Stitch to `src/components/club-admin/BankingTab.tsx` GATEWAYS list with these fields:
- `client_id` (Stitch client ID)
- `client_secret` (sensitive)
- `merchant_payer_reference` (short ZA-bank-safe ref shown on customer statements)

Setup instructions panel (like the Yoco one) pointing to https://stitch.money → Dashboard → API Credentials.

Test-payment button reusing the existing "R10 test" flow when `gateway === "stitch"`.

### 2. Database (one migration)
- `stitch_payment_sessions` — mirrors `yoco_payment_sessions` (club_id, club_member_id, user_id, amount, purpose, fee_ids, champ_registration_id, status, stitch_request_id, stitch_redirect_url, method `paybybank|card`, completed_at). RLS: user sees own rows; service_role full.
- `stitch_mandates` — DebiCheck mandates per `club_member_id` (status, stitch_mandate_id, max_amount, frequency, next_collection_date, authorised_at, cancelled_at).
- `stitch_collections` — each scheduled debit-order pull (links mandate → fee_ids, status, attempted_at, settled_at).
- All public-schema tables get the standard `GRANT` + `ENABLE RLS` + policies block.

### 3. Edge functions (new)
- `stitch-create-payment` — auth user, validate, mint a Stitch OAuth token (cached short-lived in-memory), create a LinkPay request for `amount`+`method`, insert session row, return `redirect_url`.
- `stitch-verify-payment` — called by frontend on return, polls Stitch GraphQL for status, finalises session (mirrors `yoco-verify-checkout`: writes `member_credit_transactions`, marks fees paid, handles tournament registrations, handles partial payments).
- `stitch-webhook` — public endpoint Stitch hits server-side for async settlements (HMAC-verify the body signature, idempotent claim using same `update where status != completed` pattern).
- `stitch-create-mandate` — initiates a DebiCheck mandate authorisation flow, stores `stitch_mandates` row.
- `stitch-collect-mandate` — pulls a scheduled debit against an active mandate (called by the existing `reminders`/cron pattern or a new monthly cron).

All use Stitch's OAuth2 `client_credentials` against `https://secure.stitch.money/connect/token` and GraphQL at `https://api.stitch.money/graphql`. Credentials read from `club_secrets.payment_gateway_credentials` keyed by `client_id` / `client_secret`.

### 4. Client helper
`src/lib/stitch-checkout.ts` mirroring `yoco-native-checkout.ts` (return-URL builder, redirect opener that breaks iframe, pending-session localStorage).

### 5. Frontend hookup
- BankingTab: register the gateway + test button.
- `MyAccount` fee-pay flow and tournament register card: when `club.payment_gateway === "stitch"`, call `stitch-create-payment` instead of `yoco-create-checkout` (small switch wrapper).
- Recurring dues: add a "Set up auto-debit" button on member fees screen → calls `stitch-create-mandate`. Active mandates shown with cancel button.

## Technical notes (skip if non-technical)
- Stitch LinkPay supports both PayByBank and Cards through one redirect, with a `paymentMethods` filter — we pass the user's chosen method per session.
- HMAC signature header on webhooks is `X-Stitch-Signature` (HMAC-SHA256 of raw body using `client_secret`).
- DebiCheck mandates require buyer phone + ID number; we collect these in the mandate setup dialog (already on `club_members.id_number`).
- Cron for `stitch-collect-mandate` reuses the existing `pg_cron` pattern (monthly on day 1 at 06:00 SAST).

## Scope split
- **This PR**: registry entry, DB tables, `stitch-create-payment` + `stitch-verify-payment` + `stitch-webhook`, client lib, BankingTab test button, switch in MyAccount/Tournament card.
- **Follow-up PR**: `stitch-create-mandate`, `stitch-collect-mandate`, mandate management UI, monthly cron.

Splitting because the recurring flow needs separate KYC on Stitch's side (DebiCheck contract) — clubs can start with one-off payments today and enable recurring once approved.

## Out of scope
- Switching existing Yoco payments — Stitch is added side-by-side, clubs pick one in BankingTab.
- Refunds UI — Stitch refund API exists, can be wired later from the payments admin screen.
