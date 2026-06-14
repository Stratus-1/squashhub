## Goal

Make it safe and simple for any club admin to correct member-related transactions (fee billings, payments, top-ups) and ordinary bank/cash transactions, while always keeping the double-entry ledger in balance.

## Guiding principles

1. **Never edit a posted journal entry leg in isolation.** Every action operates on a full `journal_ref` group (both/all legs together) so debits = credits always.
2. **Prefer reversals over destructive deletes** for anything older than "today" — keeps an audit trail. Same-day mistakes can be hard-deleted.
3. **One simple admin UI**, three verbs: **Edit**, **Reverse**, **Delete**. No raw account pickers in the common path — admin chooses a transaction *type* and the system posts the correct legs.

## Transaction types the admin sees (plain English)

| Type | What it does behind the scenes |
|---|---|
| Bill a member for a fee | Dr Debtors / Cr Income (membership / league / national) — also inserts a `club_member_fee_payments` row marked unpaid |
| Record a member payment | Dr Bank or Cash / Cr Debtors — marks matching fee(s) paid; surplus posts to Member Credit |
| Member top-up (credit) | Dr Bank or Cash / Cr Member Credit |
| Refund to member | Dr Member Credit (or Debtors) / Cr Bank or Cash |
| Write-off / discount | Dr Discount Expense / Cr Debtors |
| Bank / cash transaction (non-member) | Existing "Enter Transaction" flow, unchanged |

The existing "Enter Transaction" button stays. We add a **"Bill / Charge Member"** quick action inside the Member Statement dialog and on Members tab.

## Per-row actions in Member Statement

Each debtors-affecting row gets a small action menu:

- **Edit** — opens the same dialog used to create that type, pre-filled. On save: delete the old `journal_ref` group + linked `club_member_fee_payments` row (if any), then post a fresh group. Wrapped in an RPC so it's atomic.
- **Reverse** — posts an opposite-sign group dated today, description prefixed `Reversal of …`, linked via a new `reverses_journal_ref` column. Original stays visible.
- **Delete** — only allowed when:
  - entry is dated today, AND
  - no downstream dependency (e.g. a payment that already settled the fee).
  Otherwise the button is disabled with a tooltip "Use Reverse instead". Deletion removes the full `journal_ref` group + the matching fee row.

Same actions appear on the Journal tab for non-member entries (Edit / Reverse / Delete bank or cash transactions).

## Safety rails

- All mutations go through a single Postgres RPC (`admin_modify_journal(journal_ref, action, payload)`) that:
  - Verifies `is_club_admin`.
  - Loads the group, checks debit = credit on the new payload.
  - For edits/deletes, also updates/removes the linked `club_member_fee_payments` row when `fee_payment_id` is present.
  - Writes an `ledger_audit_log` row (who, when, action, old json, new json).
- UI shows a confirmation modal summarising the *net* effect ("This will reduce member X's outstanding balance by R250 and increase Bank by R250"). Admin clicks Confirm.

## Schema additions (small)

- `club_journal_entries.reverses_journal_ref uuid null` — points to the original group when this entry is a reversal.
- New table `ledger_audit_log` (club_id, journal_ref, action, actor_user_id, before_json, after_json, created_at) with RLS for club admins read-only, service_role write via RPC.

## UI changes

- `FinanceTab.tsx`
  - Member Statement dialog: add per-row 3-dot menu → Edit / Reverse / Delete.
  - Journal tab: same per-row menu for entries the admin can touch (non-system entries).
  - New shared `<EditTransactionDialog>` driven by transaction type so admins don't see GL account names unless they expand "Advanced".
- New `Bill Member` quick action in Member Statement header (charges a fee with date + amount + category).

## Out of scope for this pass

- Bulk re-syncs (existing "Recalculate GL" button stays).
- Multi-currency, period locks (can add later as a "Close month" feature).

## Technical notes

- Files touched: `src/components/club-admin/FinanceTab.tsx`, new `src/components/club-admin/EditTransactionDialog.tsx`, new `src/components/club-admin/BillMemberDialog.tsx`, one migration adding the column + audit table + `admin_modify_journal` RPC.
- All deletes/edits are wrapped in the RPC for atomicity; client never issues raw deletes on `club_journal_entries` for groups it didn't just create.
