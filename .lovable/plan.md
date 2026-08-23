# Fix billing-frequency persistence

## Implementation
- Replace the two-step client save with one authorised backend operation that atomically validates and persists the canonical club billing option and aligns the current baseline cycle without changing historical invoices.
- Make the selector update immediately, surface backend failures, and refresh every query that displays club billing frequency so the badge, summary, reload, and new sessions agree.
- Keep SLA acceptance read-only for billing frequency and preserve preferred payment method behavior.
- Make invoice scheduling consume the same canonical option and add shared regression coverage for monthly, six-monthly, and annual periods/discounts.
- Verify the affected club’s persisted values and live UI, append the root cause/fix to the project issue log, and leave production unpublished.

## Technical details
- Canonical field: `public.clubs.sla_billing_option` (`monthly`, `biannual_upfront`, `annual_upfront`).
- Backend RPC will authorize club finance/admin and platform admins, update the canonical value, synchronize only the latest baseline cycle, and record an audit entry.
- Existing invoices remain immutable; future invoices derive cycle and period length from the canonical club field.
