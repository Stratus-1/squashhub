# "Available to spend" on the member dashboard

## What the member sees
A prominent card near the top of the member home page (above My Stats), for the active club only:

```text
Available to spend            R 245.00
Balance: R55 owing  ·  Credit allowed: R300
Court booking: OK (min R20 needed)
[Top up]   [View statement]
```

States:
- **Green, "Available to spend R X"**: money (or allowed credit) left to use.
- **Amber, "Nothing available"**: available is R0 or less. Shows "Top up at least R Y to keep using the bar".
- **Booking line**: if the club has a minimum for court bookings (like Gordon's Bay R20), shows either "Court bookings OK" or "Top up R Y to book a court". Hidden when the club has no minimum.
- **Bar line**: shown only where the club stops members charging the bar or shop to their account. Otherwise the bar never blocks them, so we don't warn.
- A small "How is this worked out?" link opens a breakdown: balance, recurring payment allowance, credit allowed, booking minimum.

## The single rule (same as today's booking and bar checks)
```text
allowance  = unpaid fees covered by an active recurring payment + credit allowed (club default or member's own amount)
available  = allowance − amount owing        (amount in credit counts as extra)
booking OK = available ≥ club booking minimum
```
This reuses the exact maths already enforcing bookings and bar charges, so the card can never disagree with what actually happens at the till or the booking screen.

## Where it applies
- Every club, shown only to the member themselves (and to family accounts they can switch to).
- Linked family/delegated accounts: shows the account of whichever member is selected.
- Recalculates after payments, bookings and bar charges (on refresh and when returning to the app).
- If the figure can't be loaded, the card is hidden. It never blocks anything.

## Rollout
Build and check at Riverside first with a test member covering four cases: in credit, owing with a recurring payment, using credit allowed, and below the booking minimum. Then roll out to all clubs. Nothing published without your go-ahead.

## Technical details
- New read-only backend function `member_spend_summary(_club_id, _club_member_id)` returns `current_owing, mandate_allowance, credit_allowed, available, min_booking_balance, booking_shortfall, bar_gated, shop_gated`. It's composed from the existing `member_booking_eligibility` and `bar_account_charge_preview` logic and `member_credit_settings`. It's club-scoped, and callers may read only their own member rows or the delegated or family rows they can access (same authorization as the existing RPCs). No writes.
- Pure `computeSpendSummary` in `src/lib/account-charge-gate.ts`, built on `computeBookingGate`. Tests in `src/test/spend-summary.test.ts`: credit balance, mandate allowance, member override beats default, R20 minimum shortfall, no minimum hides the booking line, and gated vs ungated bar.
- `useSpendSummary` hook (React Query key `member-spend-summary`, invalidated alongside the existing `account-booking-gate`/`bar-account-charge-preview` keys).
- `AvailableToSpendCard` in `src/components/dashboard/`, inserted in both Dashboard layouts before `MyStatsCard`. Uses semantic tokens, readable in dark and light, 13px density.
- Update AGENTS.md (one rule: the spend summary reuses the booking and bar gate formula), plus the issue log.

## Questions to confirm (defaults assumed if not answered)
1. Should "Available to spend" include the recurring payment allowance, or only real credit plus credit allowed? Default: include it, matching what the bar and booking checks allow.
2. Should Top up go to the existing account top-up/payment page? Default: yes.
