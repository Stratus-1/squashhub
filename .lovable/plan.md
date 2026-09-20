# Gordon's Bay R20 booking balance — Katya Fulton

## Answers to the questions

**1. Was "3D-Secure Verification Failed" our fault?** No — that screen comes from her bank's card verification during the payment. Her bank declined to verify the card; nothing in the app caused it. Her R20 payment attempt this morning (11:03) never completed, so no money arrived and nothing was credited.

**2. Her R20 bank transfer.** She paid R20 by manual EFT instead, but did not log it in the app, and there is no proof of payment — so nothing is credited and we do not treat it as received. It would only show once the club loads its bank statement and matches it.

**3. Why is the amount listed twice under My Account?** One row is real, one is a duplicate:
- **Family Plan — R1 600/year** is her actual fee category.
- **Monthly club fees — R1 600/year** is a built-in fallback row that is always added for members whose own category isn't flagged for recurring payments. Hers IS flagged, so the fallback should not appear — and it then copies her outstanding total (R1 600), which is why the same amount shows twice. Fix: only add the fallback row when the member has no eligible category of their own.

## The recurring-payment logic, as it should work (your description)

A member on a monthly arrangement may carry their outstanding membership fees, but must hold the club's floating balance (Gordon's Bay: R20) on top:

- Nothing paid yet: owes R1 600 → needs at least **−R1 600 + R20 = −R1 580** on the account to book.
- Paid R100: outstanding R1 500 → needs at least **−R1 480**.
- The requirement drops by exactly what they pay.

## What the code actually does today — three problems

**A. The requirement never moves (main bug).**
In `src/lib/booking-balance-gate.ts`, when what she owes (R1 635.33 — R1 600 membership + R35.33 court lights) is more than her unpaid fees (R1 600), the allowance is bumped up to match what she owes. The result: she is short exactly R20 forever. Every rand she pays lowers her balance owed AND her allowance by the same amount, so the R20 shortfall never clears. That is why it "feels unnecessary for R20" — paying it genuinely changes nothing.

**B. A wallet top-up gets swallowed by her old fee.**
When a member tops up, the system immediately pays their oldest unpaid fee with it (`supabase/functions/_shared/wallet-auto-settle.ts`). Her oldest unpaid fee is the R1 600 membership, so even a successful R20 top-up leaves her floating balance at zero — still blocked. The floating balance must be protected: only money above the club's buffer goes onto old fees.

**C. Gordon's Bay's membership fee type isn't recognised.**
The allowance looks for fees typed "membership"/"club_membership". Gordon's Bay membership fees are typed "club", so they are not counted at all.

## Proposed fixes (nothing changed yet)

1. **Booking gate** (`src/lib/booking-balance-gate.ts`): drop the bump-up that re-allows her full balance; allowance = outstanding membership fees (active monthly arrangement → all outstanding fees); recognise "club" membership fees; result shown to member: owe, required floating balance, and the exact amount to pay now.
2. **Wallet auto-settle** (`wallet-auto-settle.ts`): keep the club's `min_booking_balance` in the wallet; only sweep the excess onto old fees.
3. **My Account** (`src/components/PaymentMethodsCard.tsx`): show the fallback "Monthly club fees" row only when the member has no recurring-eligible category of their own — removes the duplicate.
4. Add regression tests for the "pays R100 → requirement moves from −1580 to −1480" scenario.

## For Katya today (only on your word)

- Nothing to approve: no proof of the EFT, no logged payment — she stays blocked until money is confirmed.
- Her unfinished R20 card attempt can be cancelled so it cannot double up later.

## Technical notes

- Katya: club_member `04b1e11b…`, owes R1 635.33, active monthly arrangement R133.33 on day 25, failed R20 session `c5437b70…` (status `processing`).
- Gordon's Bay: `min_booking_balance` = 20.
- Gate rule after fix: allowed if `owing − unpaid_membership_fees ≤ floating balance`; arrangement members get all unpaid fees as allowance.
