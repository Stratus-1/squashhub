
# Stitch Express Rebuild

Stitch confirmed our account is on **Stitch Express** (card-based recurring), not the Enterprise API. The current code uses Enterprise concepts (`PaymentAuthorization`, debit-order mandates, bank-app approval, Enterprise UUIDs) which is why mandates hang in `pending` and no webhook arrives. This plan rips out the Enterprise flow and rebuilds on Express Subscriptions, plus fixes the onboarding form.

## What Express gives us (and what we lose)

- **Payments**: hosted card checkout on `express.stitch.money`, 3DS auth, `payment.paid` webhook.
- **Recurring**: Express **Subscriptions API** — scheduled card charges, customisable frequency/amount, tokenised card on file.
- **Lost**: bank-app-approved debit orders. Members will authenticate a card once (with 3DS) instead of approving in their banking app.

## Scope

### 1. Onboarding form (unblock now)
- Fix the edge-function error on Submit in `StitchOnboardingCard.tsx` / `stitch-onboarding-submit`.
- Add **Save Draft** button next to Submit — persists all fields to `stitch_onboarding_drafts` (table already exists) so admins can return later. Auto-loads existing draft on mount.
- Keep both emails on Submit: club contact + `admin@stratsol.co.za` (already wired).

### 2. Replace one-off payments (Enterprise → Express)
- Rewrite `stitch-create-payment` to call Express `POST /payments` (card-hosted checkout) instead of Enterprise PaymentInitiation.
- Rewrite `stitch-verify-payment` and `stitch-webhook` to consume Express `payment.paid` / `payment.failed` events and Express ID format.
- Delete `stitch-collection-webhook`, `stitch-queue-collections`, `stitch-submit-collections` (debit-order batch collection — not supported on Express).
- Update `src/lib/stitch-checkout.ts` and call sites (`MyAccount`, `stitch-pay-platform-invoice`, `platform-stitch-test-payment`, member fee payments, bar tab, visitor sales) to use the new Express flow.

### 3. Replace mandates with Express Subscriptions
- Rewrite `stitch-create-mandate` → `stitch-create-subscription`: creates an Express Subscription (initial card auth + schedule).
- Rewrite `stitch-cancel-mandate` → `stitch-cancel-subscription` using Express API.
- Delete `stitch-mandate-webhook`; extend `stitch-webhook` to handle `subscription.charged`, `subscription.failed`, `subscription.cancelled`.
- Update `DebitOrderPromptCard`, `DebitOrdersPanel`, `SubscriptionTab`, `PaymentMethodsCard`, `run-subscription-billing`, `evaluate-member-suspensions` — user-facing copy changes from "Debit order" to **"Recurring card payment"**.

### 4. Database migration
- `stitch_mandates` → rename semantically to represent card subscriptions (keep the table, add `subscription_id`, `card_last4`, `card_brand`, `card_expiry`; deprecate `mandate_reference`, `bank_account_*`).
- `stitch_payment_sessions`: add `express_payment_id`; keep old columns nullable for historical rows.
- No destructive drops — current mandates are all `pending` (broken), so they get marked `cancelled_reason='migrated_to_express'`.

### 5. Secrets & config
- Express uses a different client id / secret pair from Enterprise. If existing `STITCH_CLIENT_ID` / `STITCH_CLIENT_SECRET` are Enterprise creds, we'll need Express credentials from the Stitch dashboard (`express.stitch.money`) — I'll prompt via `add_secret` when we hit that step.
- New webhook URL to register with Stitch Express: `…/functions/v1/stitch-webhook`.

## Technical notes

- Express base URL: `https://api.express.stitch.money` (per `express.stitch.money/api-docs/quickstart`).
- Auth: client-credentials OAuth (same pattern as Enterprise but different token endpoint + audience).
- Webhook signatures: Express uses HMAC-SHA256 with the webhook secret — update `_shared/stitch-signature.ts` accordingly.
- ID format changes → all lookups keyed on `stitch_*_id` columns will be re-populated on new records only.
- Member-facing copy: "Approve in your banking app" → "Enter card details" everywhere.

## Out of scope

- Migrating already-active Enterprise mandates (none are active — all pending).
- Multi-currency; Express is ZAR-only for us.
- Refactoring unrelated billing tables.

## Rollout order

1. Onboarding fix + Save Draft (unblocks banking page today).
2. Request Express credentials via `add_secret`.
3. Rebuild payments (one-off) end-to-end + webhook.
4. Rebuild subscriptions + billing worker.
5. DB migration + UI copy pass.
6. Delete dead functions (`stitch-*-collections`, `stitch-mandate-webhook`, `stitch-collection-webhook`).
