# Journal entries, member journals and member credit transfers

Three new finance actions. Each one uses the club's existing ledger, so reports, the Member Statement and My Account pick them up automatically. Existing balances are never changed by switching this on.

## 1. General journal entry (Club Admin → Finance)
- A new **Journal entry** button next to **Enter Transaction**.
- Lines: account (every standard and club-made account), debit or credit amount, and a description per line. There's also a date, a reference and a reason for the whole entry.
- **Save** only turns on once total debits equal total credits. A running "Difference" shows what is still missing.
- No bank or cash movement unless the treasurer chooses a money account on a line.
- Mistakes are fixed with the existing **Reverse** action, never by editing or deleting.
- Admins and people with Finance permission can post. Chairman stays view-only, as today.

## 2. Member journal (credit or charge a member's account)
- In the same form, when a line uses **Accounts Receivable** or **Member credits**, a **Member** picker appears and is compulsory.
- A ready-made choice, **"Member did work for the club"**, fills the lines for you:
  - Debit Maintenance (or another expense the treasurer picks)
  - Credit Accounts Receivable, against that member
  - Result: the member owes less, or goes into credit. The expense shows on the Income Statement.
- The reverse works too, e.g. charging a member for damage: debit Accounts Receivable for the member, credit an income account.
- The line shows on the member's statement and My Account with the description you typed.

## 3. Member-to-member credit transfer
- **Who can start one:**
  - A member, from My Account → **Transfer credit**
  - An admin or treasurer, on a member's behalf from the Member Statement
- **Steps:** pick the receiving member (same club only), enter the amount and add a note.
- **Limit:** the amount can't be more than the sender's available credit. This is checked again when the transfer is accepted.
- **The receiving member** sees an in-app notice and a **Transfer waiting** card on My Account, then presses **Accept** or **Decline**.
- **Only Accept moves the money:**
  - credit leaves the sender's account
  - credit lands on the receiver's account
  - anything the receiver owes is settled from it straight away
  - no income, expense or bank movement
- **Sender cancels / expiry:** the sender (or admin) can cancel while it's pending. Pending transfers expire after 14 days.
- **Admin overview:** a "Credit transfers" list under Finance shows pending, accepted, declined and cancelled transfers.
- **Messages:** in-app only, with no automatic email or WhatsApp. This follows the existing rule on automatic messages.

## Not changed
- Enter Transaction, bank reconciliation, fees, bar and payment flows.
- Every existing member balance.

## Technical details
- Journal: a new security-definer RPC `admin_post_journal(club_id, date, reference, reason, lines, request_id)`.
  - Checks: finance/admin permission, `chairman_financial_write_allowed`, a balanced total and at least 2 lines.
  - Accounts: standard `gl_account` or club `custom_account_id` only. Each member line needs a member of the same club, and only debtors / member_credits lines may carry a member.
  - Safe to repeat with the same request id. It reuses `post_journal` (which already auto-settles prepaid credit) and writes a `ledger_audit_log` row (type `manual_journal`).
- Form: account choices come from a new pure helper beside `transaction-accounts.ts`, with tests for the balance and member-line rules. The "Member did work" template is display-only prefill.
- Transfers: a new table `member_credit_transfers`.
  - Columns: club_id, from_member_id, to_member_id, amount, note, status pending/accepted/declined/cancelled/expired, requested_by, decided_by, timestamps and journal_ref. Plus GRANTs and RLS (sender, receiver, admins/finance of that club).
- Transfer RPCs:
  - `request_member_credit_transfer` (sender's own member or admin/finance; available credit = member_credits credit balance minus debtors balance, must be ≥ amount)
  - `respond_member_credit_transfer` (receiver's own member only; Accept re-checks credit under a row lock, then posts Dr member_credits sender / Cr member_credits receiver through `post_journal` so the receiver's debts auto-settle)
  - `cancel_member_credit_transfer`
  - Expiry is applied when the transfer is read or acted on; no new scheduled job.
- My Account and the admin Member Statement already read these accounts, so both show the new lines without separate code.
- Tests: balanced/unbalanced journal, member required on AR lines, transfer over available credit refused, accept moves credit exactly once.
