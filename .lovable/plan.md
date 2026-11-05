# GoBook Lights top-up

## What members see
- On **My Account** and in the **GoBook section on Courts**, only for GoBook-connected clubs and only for members linked to GoBook (the same members who can already see their Lights balance).
- Button: **Top up your Lights account**. Members who aren't linked to GoBook don't see it.
- Enter an amount, choose any payment method the club allows (Card, EFT, Member account credit).
- Confirmation screen like GoBook's: club, the member's **GoBook name and the Court Manager membership number GoBook holds for them** (not SquashHub's member number), "Payment for: Lights", amount, reference, plus a required tick: "I confirm this is my GoBook account". GoBook warns that a payment to the wrong account can only be reversed by the club in Court Manager.
- The payment is always sent with the member's linked **GoBook client ID**, never a membership number. SquashHub member numbers can differ from Court Manager numbers (e.g. CSIR), so the client ID is the safe choice. GoBook then credits whichever Court Manager account that GoBook profile is linked to.

## How the money is recorded
- On the member statement: a **Lights top-up** credit, followed by a matching **Lights sent to GoBook** line, so the account nets to zero. The money is never counted twice.
- **Card:** sent to GoBook only after Stitch/PayFast confirms the payment.
- **EFT:** stays pending until the treasurer approves the payment as usual, then it is sent to GoBook.
- **Member account:** the member's existing credit is used. If the club's arrears/spending rule doesn't allow it, the top-up is blocked.
- Lights only. POS and Subscription are never offered.

## GoBook status
- Each top-up has a unique reference (e.g. SH-…) and is sent once, even if the provider calls us twice.
- SquashHub checks GoBook's status: Paid → Posted (shown as "Posted to Court Manager"). If the status is **Cancelled** (e.g. "Member not on club list"), the club admins are told and the transfer line is reversed. The member keeps the credit in their SquashHub account so the club can refund or re-send it.

## Technical details
- New table `gobook_lights_topups` (club, member, amount, method, status, reference, gobook_payment_id, gobook_status, cancellation reason, journal links). RLS: the member can see their own top-ups, club finance staff can see their club's.
- `gobook-api` new actions: `lights_topup_create` (checks the member's saved GoBook client link, creates the pending row), `lights_topup_submit` (internal, idempotent POST `/Financials/MakePayment` with accountName "Lights", `clientId` only — `membershipNumber` is never sent, unique reference), `lights_topup_status` (GET `/Financials/Payment`).
- Payment hooks: the existing card settlement (Stitch/PayFast) and the treasurer approval of EFT call the submit step for rows tagged as lights top-ups. The member-account path does the debit and submits in one action.
- A scheduled status check updates rows that are still Paid until they show Posted or Cancelled.
- Tests: Lights-only account name, no submission before payment is confirmed, one submission per reference, Cancelled reverses only the transfer line.
- Available to all GoBook clubs, following the existing GoBook connection switch.
