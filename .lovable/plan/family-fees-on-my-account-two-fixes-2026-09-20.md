# Family fees on My Account — two fixes

## What's wrong now

Looking at Katya Fulton's account at Gordons Bay:

1. **The R120 for Kailash isn't in her running balance.** The R120 fee was raised correctly and it *is* booked as a fee owing — but it sits on Kailash's own account, with Katya only recorded as the payer. Her "Net amount owing" and her account statement are built purely from charges booked against her own name, so the R120 never appears there. She can't settle it from her own account.
2. **"Family total for the season: R1 840" is wrong.** It should be R1 720 (R1 600 + one R120 son). The card counts everyone in the family list — including Katya herself, the primary — and charges R120 for each, so the primary is counted twice.

## Fix 1 — family fees show on the payer's account

Treat a family member's fee exactly like one of Katya's own fees on her account:

- Her account statement gains a line per family-member fee she is the recorded payer for, named clearly, e.g. **"Kailash Fulton — Additional Family Member  R120,00"**, dated when it was raised.
- That amount is included in her net amount owing, so "Pay R1 635,33" becomes **R1 755,33** and one payment clears the lot.
- When she pays, the payment settles the family member's fee and clears it from both accounts.
- On Kailash's own account the fee still shows, but marked **"billed to Katya Fulton"** and excluded from his own amount owing — so the same R120 is never demanded twice.

No change to the accounting books: the charge stays booked against the member it belongs to, so club income and member-balance reports stay exactly as they are. This is about which account the member is asked to settle it from.

## Fix 2 — correct family total

Count only the *additional* people, not the primary: total = primary fee + R120 × number of additional members. Katya's card will read **R1 720**. Same correction anywhere else the combined total is shown (the "Increase monthly payment" prompt uses the same figure, so the suggested new debit order amount will be correct too).

## Technical notes

- `src/pages/MyAccount.tsx`: the ledger query reads `club_journal_entries` for `club_member_id = me`. Add a second read for debtor entries whose linked fee row has `paid_by_member_id = me` (and exclude own-account entries where someone else is the payer). Net owing and available cash derive from the same lines, so both follow automatically.
- `src/components/family/MyFamilyCard.tsx`: `activeCount` includes the primary row; exclude the primary member before calling `combinedFamilyTotal`.
- `src/components/PaymentMethodsCard.tsx`: the `familyTotalAnnual` query needs the same exclusion.
- Payment/settlement path (`club_member_fee_payments` settle RPC) already supports paying another member's fee via `paid_by_member_id`; verify it's reachable from the payer's Pay/Top-up flow.
- Add tests for the corrected total and for payer-linked statement lines appearing once only.
- No schema change and no publish until you ask.
