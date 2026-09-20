# Gordon's Bay R20 booking balance — what happened to Katya

## The short answers

**1. Was the "3D-Secure Verification Failed" our fault?** No. That message comes from her bank's card verification step during the payment. Her bank declined to verify the card; nothing on our side produced or caused it. The payment she started this morning (R20, 11:03) is still sitting unfinished — it never completed, so no money reached the club and nothing was credited to her.

**2. Her R20 bank transfer.** She did the R20 as a manual bank transfer instead. The app cannot see a manual transfer until the club loads its bank statement and matches it, so as far as the app is concerned she still has nothing on her account — hence no court access.

## How the R20 rule works today at Gordon's Bay

- Gordon's Bay requires a R20 floating balance on top of whatever a member owes, before a booking is allowed.
- Katya owes R1 635.33 — R1 600 family membership (raised 6 August, still unpaid) plus court light charges since then, less two recurring card payments of R133.33.
- She does have an active monthly recurring arrangement.

## Three real problems in that logic

**A. A member who owes anything can never satisfy the R20.**
The rule says "whatever you already owe is allowed, but you must have R20 on top". In practice, each time it checks, it re-reads what she owes and re-allows exactly that amount — so paying R20 lowers what she owes by R20 and lowers the allowance by R20 at the same time. She is short exactly R20 forever, no matter how many times she pays. This is why it "just feels unnecessary for R20": the R20 genuinely never clears.

**B. Her top-up would be swallowed anyway.**
When a member tops up their wallet, the system immediately uses the money to pay off their oldest unpaid fee. Her oldest unpaid fee is the R1 600 membership. So even a successful R20 top-up would go straight onto the membership and leave her wallet at zero — still blocked.

**C. The membership allowance does not recognise Gordon's Bay's fee type.**
The allowance is meant to forgive outstanding *membership* fees. It only looks for fees typed "membership"/"club_membership". Gordon's Bay membership fees are typed "club", so they are not recognised at all.

## Proposed logic (nothing changed yet)

1. **Floating balance means wallet credit, not a moving target.** A member passes if the balance they have *available* (credit, ignoring forgiven membership debt) is at least R20. Paying R20 must actually clear the requirement.
2. **Protect the floating balance from auto-settlement.** A wallet top-up should only be swept onto outstanding fees above the club's floating-balance amount; the buffer itself stays in the wallet so the member can book.
3. **Recognise all membership fee types**, including "club", as forgivable debt when a member is on an active monthly arrangement.
4. **Clear wording when a booking is blocked**: what they owe, what the floating balance is, and exactly how much to pay now.

## Immediate options for Katya (say the word)

- Credit her R20 manually against the bank transfer she made, so she and the boys can get onto court today.
- Cancel the unfinished R20 payment attempt so it does not double up if it later completes.

## Technical notes

- `src/lib/booking-balance-gate.ts` — the grandfathering block (`if (currentOwing > planAllowedDebt) planAllowedDebt = currentOwing`) makes `shortfall` permanently equal the buffer; the membership filter matches only `membership` / `club_membership`.
- `supabase/functions/_shared/wallet-auto-settle.ts` — sweeps the full top-up into unpaid fees; needs to retain the club's `min_booking_balance`.
- Katya: club_member `04b1e11b…`, Stitch session `c5437b70…` (R20 topup, `paybybank`, status `processing`), active mandate `18e2d429…`.
