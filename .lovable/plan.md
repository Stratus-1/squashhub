# Nelspruit opening balances (as at 26 Sep 2026)

## Accounting treatment (recommendation)

These amounts are money members already owed under the old system. The income was earned before SquashHub, so it should **not** be credited to Membership Income again — that would inflate this year's income by ~R90k of old fees.

Correct entry, per member, one journal batch dated 26/09/2026:

```text
Dr  Debtors (Accounts Receivable)   – member's outstanding amount   (tagged to the member)
  Cr  Opening Balance Equity          – same amount
```

- Members in credit (e.g. Eunice -R550, Johann -R664, William Mitchell -R1,000, Lucas -R5) are posted the other way (Cr Debtors / Dr Opening Balance Equity) and show as "CR" on their account.
- Total Debtors after posting = sum of member lines in the report, i.e. the club's opening accounts receivable.
- Each member also gets one visible line on their statement: "Opening outstanding balance (as at 26/09/2026)" so the member card and statement agree with the ledger.

If you would rather see it as Membership Income anyway, I can do that, but I advise against it.

## Clean-up before posting (Nelspruit only)

Remove old/test transactions that are causing wrong negative balances — mostly duplicate "Club Membership pro-rated" and "Registration Fee" charges and old imported wallet rows (e.g. Francois Vosloo, Shamiso & Malvern Tavarwisa, Taylor Gower, James Paterson, Mia Briel, Ane van Wyk, Janco Duvenage, Gerhard Coetzer, Mike Brueton, Mimi-Mari du Plessis, Rentia Breuton, Karen Musica, Armandt Visser), plus their matching unpaid fee rows and ledger lines, so no orphan entries remain.

**Kept untouched:**
- All Family Doubles / FUN-Raiser Stitch, Yoco and EFT payments and entry fees.
- Riaan's credit (R260 — confirm below).
- The extra visitor fee (R50 on Visitor income).
- Honesty bar sales and top-ups after go-live.
- Any previous opening-balance entries are replaced, not doubled.

Before deleting anything I'll save a full backup of every removed row so it can be restored.

## Matching report names to members

Match each report name to a Nelspruit member (e.g. "Umar Akojee" → Umar Akoojee, "Reinhard Grobler." → Reinhard Grobler). Any name I can't match confidently is listed for you, not guessed.

## Rows that are not members (need your decision)

- **TUCK SHOP SALES  -R90,754.70** — this is the old bar cash account, not a person. I plan to leave it out.
- **Squash Rush R6,060** and **Du Toit - Smuts Prokureurs R7,500** — businesses (sponsor/supplier?). Leave out, or create them as non-member debtors?

Note: the report's grand total (-R188.64) includes the tuck shop line; member-only total is roughly +R90,566.

## Checks after posting

- Every member's balance on the members list equals the report.
- Debtors in the ledger = member total; ledger stays balanced.
- Family Doubles payments, Riaan's credit and the visitor fee still show.
- A short reconciliation list sent back to you. Nothing published.

## Technical details

- Deletions scoped to `club_id` = Nelspruit, only rows dated before go-live and not matching the keep-list (tournament_entry, Stitch/Yoco/EFT top-ups linked to the FUN-Raiser, visitor_income, Riaan's credit).
- Backup to a private table/JSON before delete.
- Posting via the balanced `post_journal` RPC (debtors with member_id / opening_balance_equity) plus one `club_member_fee_payments` row "Opening outstanding balance" (unpaid) or a wallet credit for members in credit.
