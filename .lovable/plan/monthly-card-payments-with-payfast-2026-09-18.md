# Monthly card payments with PayFast

Give PayFast clubs (starting with Uitsig) the same monthly-instalment option that Stitch clubs already have: a member agrees once, their card is saved securely at PayFast, and the club then collects an equal amount each month against their fees.

## How it will work for members

In **My Account**, under payment methods, every member sees a "Pay monthly" option (not only those on debit-order fee categories).

1. The member picks how many months to spread over (the amount per month is worked out from what they owe, and can be adjusted).
2. They choose a day of the month for the payment.
3. They are taken to PayFast once to enter their card and authorise the arrangement.
4. On return the arrangement shows as Active, with the monthly amount, the day, and a Cancel button.

Each month the payment happens automatically — no club approval step. If a payment fails, the member and the club admin see it, and it is retried a limited number of times before the arrangement is flagged.

## How it will work for the club

The existing **Finance > Debit Orders** panel becomes gateway-aware and shows PayFast arrangements alongside Stitch ones, with a column saying which gateway each uses. Admins can see each month's collections, the result, and cancel an arrangement.

Successful collections post to the club's books exactly like a normal PayFast payment today: fees marked paid, credit applied, no double-counting if PayFast sends the notice twice.

## Fees table

Nothing changes structurally. The existing per-category "debit order eligible" flag keeps working for Stitch, but the monthly PayFast option is offered to all members regardless, per your decision.

## Technical notes

**Approach:** PayFast tokenisation (`subscription_type=2`, ad-hoc). The first authorisation is a normal PayFast checkout that returns a card token; monthly charges are then made by us calling PayFast's ad-hoc charge API with that token. This mirrors the Stitch mandate + queued-collections model and keeps the amount under our control, rather than handing a fixed schedule to PayFast.

**Data:**
- Reuse `stitch_mandates` (it already has a `gateway` column) for PayFast arrangements; add `payfast_token`, `next_charge_date`, `months_total`, `months_charged`.
- Add `gateway` to `stitch_collections` so both rails share one collection ledger.
- Grant SELECT on every new column in the same migration (column-level grants are enforced on these tables).
- RLS: same policies as today — member sees own rows, club admins see their club's rows.

**Edge functions (new):**
- `payfast-create-mandate` — builds the signed tokenisation checkout, inserts a pending mandate row, returns the redirect URL.
- `payfast-itn` (extend) — on a tokenisation ITN, store the returned `token`, activate the mandate, settle the first instalment through the existing `settlePayfastSession` path.
- `payfast-charge-mandates` — daily job: finds mandates due today, creates a `stitch_collections` row, calls PayFast ad-hoc charge (signed, timestamped headers), settles on success, records failure and retry otherwise. Idempotent per mandate per due date.
- `payfast-cancel-mandate` — cancels at PayFast and marks the row cancelled.

**Scheduling:** one daily cron at a fixed hour calling `payfast-charge-mandates`. Daily is the least frequent cadence that can honour a member-chosen debit day; maximum delay is under 24 hours.

**Frontend:**
- `PaymentMethodsCard.tsx`: remove the `paymentGateway !== "stitch"` block; branch setup/cancel calls by gateway.
- `DebitOrdersPanel.tsx`: query both gateways, add a gateway badge, hide the approve action for PayFast rows.
- `club-payments.ts`: add mandate helpers next to the existing PayFast checkout helpers.

**Tests:** signature/ad-hoc payload building, due-date selection and idempotency of the daily charge job, and settlement not double-posting on a repeated ITN.

**Rollout:** built against Uitsig's saved PayFast credentials in sandbox, then one small real monthly arrangement as the first live test. No publish without your say-so.
