# Bank Statement Import & Reconciliation

Add an **Import Statement** action next to *Enter Transaction* on the General Ledger, available when a bank/cash account is selected. It opens a guided dialog: upload → map columns → review & allocate → post.

## 1. Import the statement (any format)

- Accepts CSV, TSV, semicolon files, Excel (.xlsx/.xls), OFX/QIF, or a plain paste from the bank's website.
- Auto-detects delimiter, date format (incl. dd/mm/yyyy), and whether amounts are one signed column or separate debit/credit columns.
- If headers aren't recognised, a small **column mapping** step lets the admin point at Date / Description / Amount (or Debit + Credit) / Balance.
- The statement is stored so the same file can't be imported twice, and so the reconciliation can be reopened later.

## 2. Reconciliation screen

One row per statement line, with a running count of *Matched / To allocate / Ignored*, and a summary of statement total vs posted total.

Each line is auto-classified into one of:

| State | Meaning |
| --- | --- |
| **Already in books** | Matches an existing ledger entry — will not be posted again |
| **Ignore** | Card/gateway settlement (Stitch, Yoco payouts) — income already recorded per transaction |
| **Suggested** | App guessed the account (e.g. bank charges, electricity, rent) — admin can accept or change |
| **Needs allocation** | No confidence — admin picks the account (and optionally a member) |

Admins can override any state, bulk-select rows, and allocate a whole selection at once.

### Duplicate detection

A statement line is treated as already-recorded when an existing `bank_current` journal entry has the same amount and a **date within a configurable window (default ±7 days)** — because the admin may have captured the payment on a different date to the bank. Member EFT fee payments, once-off card payments and recurring collections are all covered by this. Closer date + matching member/reference ranks higher; ties are shown for the admin to confirm rather than auto-linked.

### Ignore rules

Built-in patterns for gateway settlements (Stitch, Yoco, "SETTLEMENT", "PAYOUT") default to Ignored, since the individual card payments and their gateway fees are already in the ledger. The ignore list is editable per club.

### Learn-once allocation

When an admin allocates a line (e.g. "FNB FEE" → Bank Charges), a rule is saved from that description pattern. Every other line in the same import with a similar description is instantly re-allocated the same way, and future imports pick it up automatically. Rules are visible and removable.

## 3. Opening balance

If this is the club's first statement for that account, the dialog offers to set the statement's opening balance as the account's opening balance (using the existing opening-balance posting so nothing double-posts). On later imports it instead checks that the statement's opening balance agrees with the ledger and flags a difference.

## 4. Posting

"Post N transactions" posts all allocated lines in one balanced batch through the existing `post_journal` path (Dr/Cr the chosen account against the bank account), links each journal line back to its statement line, and marks matched/ignored lines as reconciled. Re-opening an import shows what was posted; posting is idempotent.

---

## Technical notes

- New tables: `bank_statement_imports` (club, account, filename, period, opening/closing balance, hash, totals), `bank_statement_lines` (date, description, amount, state, matched_journal_ref, allocated account/member), `bank_recon_rules` (club, pattern, account, ignore flag). RLS: club admins/treasurer only, with GRANTs; `service_role` for jobs.
- Parsing + classification live in `src/lib/finance/bank-import/` (`parse.ts`, `match.ts`, `rules.ts`) as pure functions with unit tests — no parsing logic in components.
- UI: `BankStatementImportDialog.tsx` in `src/components/club-admin/`, opened from `FinanceTab.tsx`'s ledger view; reuses the existing chart of accounts and `postJournal` helper.
- Duplicate matching runs against `club_journal_entries` for the selected account within the statement period ± the tolerance window.
