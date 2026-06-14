## Goal
Restructure the Club Admin → Finance section so the Journal tab shows everything, the per-account filter moves to its own tab, and admins can pull a per-member statement.

## Changes — `src/components/club-admin/FinanceTab.tsx` only

### 1. Journal tab — show ALL entries
- Remove the "Filter account" `<Select>` from the Journal toolbar.
- Render the unfiltered `journalEntries` list (drop `filteredEntries`).
- Keep all other toolbar buttons (Reconcile / Resync / Opening Balances / Reset / Enter Transaction).

### 2. New tab — **"By Account"**
- TabsTrigger placed right after `Journal`.
- Same table layout as Journal, but with the account dropdown at the top (re-using existing `accountFilter` state and `CHART_OF_ACCOUNTS`).
- Dropdown groups options by category (Income / Expense / Asset / Liability) so "Tournament Income", "Bar Sales Income", etc. are easy to find.
- Empty state when no account selected: "Select an account to view its transactions."

### 3. New tab — **"Member Statement"**
- TabsTrigger placed after `By Account`.
- Top toolbar: searchable member `<Select>` (re-use `members` from `useClubMembers`); date range left as a TODO note for later (user said "we will sort out the date selection later on").
- Body for the selected member:
  - **Summary header**: 3 small cards
    - Total Billed (sum of `debit` where `account = 'debtors'`)
    - Total Paid (sum of `credit` where `account = 'debtors'`)
    - Outstanding Balance = Billed − Paid (red if positive, green if ≤0)
  - **Transactions table** — every `club_journal_entries` row where `club_member_id = selected`, ordered by `created_at` desc, columns: Date · Description · Account · Debit · Credit · Running Balance (debtors only).
- Empty state when no member chosen.

### 4. No DB / migration / business-logic changes
- Reuses existing `club-journal-entries` query data; no new fetches needed.
- No edits to fee posting, reconciliation or any other flow.

## Out of scope
- Date filters on the member statement (deferred per user).
- PDF export / printing.
- Any backend changes.
