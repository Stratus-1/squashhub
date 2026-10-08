# Bar and Shop: "Allow member account to go into debit" (plan only)

## What the club admin gets
In Club Admin > Bar, a small "Member account charging" card with two separate switches:
- Bar: Allow member account to go into debit
- Shop: Allow member account to go into debit

Both start ON for every existing and new club, so today's behaviour is unchanged until an admin deliberately turns one off. Only club admins (or members with the Bar permission) can change them; changes are logged with who/when/old/new.

## What happens when a switch is OFF
When an item from that division is put on a member account (member app My Tab settlement, admin POS, counter tablet, QR Scan & Pay), SquashHub works out the member's balance **after** the purchase and checks it against the same rule court bookings already use:

```text
current owing   = member's account balance (positive = owes, negative = prepaid credit)
allowance       = unpaid fees covered by an active monthly recurring payment arrangement
                  (no arrangement -> allowance 0)
projected owing = current owing + purchase total
allowed if      projected owing - allowance <= 0
```

- Prepaid credit is spent first; a purchase is fine as long as it does not push past the allowance.
- A member with an active recurring arrangement may carry the debt that arrangement covers, exactly as for bookings - not every negative balance is refused.
- The booking "minimum float" is NOT applied to bar/shop (it is a booking-specific buffer). See Point to confirm.

If refused: nothing is posted, no stock moves, the tab stays open. The member/operator sees:
"This would take [name]'s account to R X owing, beyond what their account allows (R Y). Pay by card, or top up the account first." with buttons Pay by card and Top up (only those methods the club has enabled).

## Mixed carts and split payments
- Each line belongs to a division (bar, shop, or a club-added division; club-added divisions follow the Bar switch unless configured otherwise).
- If any line in the account portion belongs to a division whose switch is OFF, the whole account portion is checked against the rule. Lines paid by card/cash are never checked.
- Split payment (part card, part account): only the account portion counts toward the projected balance. Card part must succeed first; if the account part is then refused, the card part stands and the remaining lines stay on the tab.

## What does not change
- Existing transactions and balances are never recalculated or reversed.
- Card/cash/EFT purchases, guest tabs, stock engine, journals, prices.
- Court booking rules and their own float setting.
- POS member selection: unchanged (search/number/QR lookup work as now). The check runs only at the moment of charging.
- OTP / PIN approval: unchanged and still required first. Order is: identify member -> OTP/PIN approve -> balance check -> post. A refused check after OTP does not consume extra OTPs beyond today's behaviour; the operator can switch to card without re-approving.

## Race conditions
The check runs inside the same backend transaction that posts the charge, locking the member's row first, so two simultaneous purchases (e.g. phone + counter) cannot both slip under the limit. The on-screen pre-check is only a friendly preview; the backend is authoritative.

## Tests
Pure rule (shared with bookings):
1. R100 prepaid credit, R60 purchase -> allowed (ends R40 credit).
2. Zero balance, R30 purchase, no arrangement -> refused (shortfall R30).
3. Zero balance, switch ON -> allowed (current behaviour).
4. R200 arrears, no arrangement, R10 purchase -> refused.
5. R500 unpaid fees under active arrangement, owing R450, R40 purchase -> allowed; R60 purchase -> refused (crosses by R10).
6. R50 credit, R50 purchase -> allowed (exactly zero).
7. Suspended arrangement -> allowance 0.
Division handling:
8. Bar OFF / Shop ON: shop item on account allowed, bar item refused.
9. Mixed cart with one bar line while Bar OFF -> whole account portion checked.
10. Split payment: card part excluded from projection.
Backend:
11. Refusal posts no tab entry, no journal, no stock movement.
12. Two concurrent charges near the limit -> only one succeeds.
13. Non-admin cannot change the switches; other clubs' settings unaffected.
14. Booking gate tests still pass unchanged (shared formula).

## Point to confirm
- Booking float: should bar/shop ignore the booking "minimum balance" buffer (proposed), or also require it?
- Club-added divisions: follow the Bar switch (proposed), or get their own switch each?

## Technical details
- Current state read: court gate is `src/lib/booking-balance-gate.ts` (`computeBookingGate`, client-side, used by `Bookings.tsx`/`MyAccount.tsx`). Owing = sum(debit-credit) on `debtors`+`member_credits`; allowance = unpaid `club_member_fee_payments` (own or `paid_by_member_id`) only when an active, unsuspended monthly `stitch_mandates` row exists. Code is authoritative (its header comment about membership fees always counting is stale and will be corrected).
- Account charges today: client inserts into `bar_tab_entries` (`HonestyBar.tsx` ~204, `HonestyBarTab.tsx` ~1274) and RPCs `bar_qr_charge_member`, `bar_qr_charge_guest_tab_member`, `bar_counter_add_to_tab`/`bar_counter_settle_tab`. OTP via `BarOtpDialog` / `member_bar_otps`.
- Migration: `club_bar_settings` gets `bar_allow_member_debit boolean default true`, `shop_allow_member_debit boolean default true` (plus audit row on change). No backfill needed.
- New SQL `member_account_gate(_club_member_id, _extra numeric)` mirroring `computeBookingGate` with buffer 0, returning owing/allowance/projected/shortfall; TS `computeBookingGate` exported formula reused by a new `computeAccountChargeGate` so one formula serves both.
- Enforcement: BEFORE INSERT trigger on `bar_tab_entries` for member-account entries (sums the statement's account lines per member via a per-transaction check after `SELECT ... FOR UPDATE` on `club_members`), plus explicit checks in the charge RPCs, raising a structured error code `ACCOUNT_LIMIT` with shortfall; client maps it to the dialog. Stock and journal posting happen after the insert, so a raised error rolls everything back.
- UI: settings card in `HonestyBarTab`; refusal dialog shared by `HonestyBar`, admin POS, `BarCounter`, `ScanPay`.
- Docs: rule line in `src/lib/AGENTS.md`, issue log entry. No publishing.
