# Gordon's Bay R20 booking balance — Katya Fulton

**Confirmed from her records:** Katya has made two recurring payments (R133.33 × 2 = R266.66), but neither was applied to her membership fee — the R1 600 fee still shows fully unpaid, and her court light charges (R301.99) quietly consumed the money she paid. So per the correct logic her carryable membership debt is R1 600 − R266.66 = **R1 333.34**, her booking requirement is **−R1 313.34**, and her actual balance is **−R1 635.33** — she is short because of the unpaid lights (R301.99) plus the R20 buffer, not because of the membership.

## Answers to the questions

**1. Was "3D-Secure Verification Failed" our fault?** No — that screen comes from her bank's card verification during the payment. Her bank declined to verify the card; nothing in the app caused it. Her R20 payment attempt this morning (11:03) never completed, so no money arrived and nothing was credited.

**2. Her R20 bank transfer.** She paid R20 by manual EFT instead, but did not log it in the app, and there is no proof of payment — so nothing is credited and we do not treat it as received. It would only show once the club loads its bank statement and matches it.

**3. Why is the amount listed twice under My Account?** One row is real, one is a duplicate:
- **Family Plan — R1 600/year** is her actual fee category.
- **Monthly club fees — R1 600/year** is a built-in fallback row that is always added for members whose own category isn't flagged for recurring payments. Hers IS flagged, so the fallback should not appear — and it then copies her outstanding total (R1 600), which is why the same amount shows twice. Fix: only add the fallback row when the member has no eligible category of their own.

## The final rule (as agreed)

For a member on an active monthly arrangement, the amount they may carry (the "allowable negative") is:

**total family/membership fees for the season − payments already made** — plus the club's floating balance on top.

- Katya with son added: R1 600 + R120 = **R1 720** total fees; two payments of R133.33 made → may carry **R1 453.34**.
- Booking allowed while her balance owing is at most **R1 453.34 + R20 float**; anything beyond that (e.g. unpaid court lights) must be settled.
- The monthly recurring charge keeps running as normal; each successful payment reduces what she carries.
- The recurring amount itself should ideally be increased to cover the R120 (R1 720 ÷ 12 = R143.33) — see fix 6.

## Kailash's R120 family fee — and increasing the monthly payment

- **No R120 fee was raised.** Kailash has no fee rows at all, even though the "Member of family" category (R120/year) exists and is active. Adding a family member does not currently raise the R120 fee — that is a gap to fix (raise it on the primary payer's account, per the family billing rule).
- **It counts as carryable anyway.** Once raised, the R120 sits as an outstanding family fee and — because she is on a monthly arrangement — she does not have to pay it upfront to book; it just adds to what the arrangement must cover.
- **Can the monthly amount be increased?** Not by editing. Her card authorisation is capped at exactly R133.33/month (R1 600 ÷ 12, day 25) — that cap is what she approved with her bank. To charge more (R1 720 ÷ 12 = R143.33), she must authorise a new recurring payment at the higher amount; the old one is cancelled at the same time. We can make this a smooth "increase monthly payment" action instead of a manual cancel-and-redo.

## What the code actually does today — three problems

**A. The requirement never moves (main bug).**
In `src/lib/booking-balance-gate.ts`, when what she owes (R1 635.33 — R1 600 membership + R35.33 court lights) is more than her unpaid fees (R1 600), the allowance is bumped up to match what she owes. The result: she is short exactly R20 forever. Every rand she pays lowers her balance owed AND her allowance by the same amount, so the R20 shortfall never clears. That is why it "feels unnecessary for R20" — paying it genuinely changes nothing.

**B. A wallet top-up gets swallowed by her old fee.**
When a member tops up, the system immediately pays their oldest unpaid fee with it (`supabase/functions/_shared/wallet-auto-settle.ts`). Her oldest unpaid fee is the R1 600 membership, so even a successful R20 top-up leaves her floating balance at zero — still blocked. The floating balance must be protected: only money above the club's buffer goes onto old fees.

**C. Gordon's Bay's membership fee type isn't recognised.**
The allowance looks for fees typed "membership"/"club_membership". Gordon's Bay membership fees are typed "club", so they are not counted at all.

## Proposed fixes (nothing changed yet)

1. **Recurring payments settle the membership fee first.** When the monthly charge succeeds, apply it to the membership fee immediately — so the unpaid fee always equals the annual amount minus payments made. Katya's two payments get applied retroactively (fee drops from R1 600 to R1 333.34).
2. **Booking gate** (`src/lib/booking-balance-gate.ts`): allowance = annual membership fee − payments already made (active monthly arrangement → all outstanding fees); drop the bump-up that re-allows her full balance; recognise "club" membership fees; show the member: what they owe, the floating balance required, and the exact amount to pay now.
3. **Wallet auto-settle** (`wallet-auto-settle.ts`): keep the club's `min_booking_balance` in the wallet; only sweep the excess onto old fees.
4. **My Account** (`src/components/PaymentMethodsCard.tsx`): show the fallback "Monthly club fees" row only when the member has no recurring-eligible category of their own — removes the duplicate.
5. **Family fee on adding a member**: raise the "Member of family" fee (R120) automatically against the primary payer when a linked family member is added.
6. **Increase monthly payment**: when a family's fees grow, offer a one-tap "increase monthly payment" that authorises a new recurring payment at the new amount and cancels the old one on activation.
7. Add regression tests for the "pays R100 → requirement moves from −1580 to −1480" scenario.

## For Katya today (only on your word)

- Nothing to approve: no proof of the EFT, no logged payment — she stays blocked until money is confirmed.
- Her unfinished R20 card attempt can be cancelled so it cannot double up later.

## Technical notes

- Katya: club_member `04b1e11b…`, owes R1 635.33, active monthly arrangement R133.33 on day 25, failed R20 session `c5437b70…` (status `processing`).
- Gordon's Bay: `min_booking_balance` = 20.
- Gate rule after fix: allowed if `owing − unpaid_membership_fees ≤ floating balance`; arrangement members get all unpaid fees as allowance.
