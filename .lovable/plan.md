# Annual Renewals — Invoice Generation & Auto-Send

Adds an **Annual Renewals** tab to Club Admin → Finance for generating next-cycle membership invoices on demand, plus two cron jobs that keep things flowing automatically.

## 1. Schema additions (migration)

Extend `club_member_fee_payments` (the existing ledger row stays the single source of truth — no new table):

- `invoice_number` text — sequential per club, e.g. `NSC-2027-00042`
- `invoice_issued_at` timestamptz — when the invoice was generated
- `invoice_due_date` date — actual renewal date (computed from `member_fee_categories.due_month`/`due_day`)
- `invoice_send_date` date — `invoice_due_date − clubs.fee_reminder_days_before` (e.g. 1 March − 14 days = **14 Feb**)
- `invoice_email_sent_at` timestamptz — set when the email goes out
- `invoice_email_status` text — `pending` | `sent` | `failed`

Add `next_invoice_seq` integer on `clubs` for the per-club running counter.

## 2. Invoice content rules

For each generated invoice row:
- **`fee_label`** = `"Renewal Fees {YYYY} — {fee_category.name}"` (e.g. `"Renewal Fees 2027 — Pensioners"`).
- **`amount`** = `member_fee_categories.annual_fee` (always full annual fee — pro-rate only applies to mid-year self-registrations, not annual renewals).
- **`season_year`** = the year of `invoice_due_date`.

Pass-through national body fees (NSA Levy, SSA) and league association fees are **not bundled here** — those continue to flow via their existing auto-seeding triggers. This tab only handles the club's own annual membership renewal fee.

## 3. Generation function

DB function `generate_member_renewal_invoices(p_club_id uuid)`:

For every active `club_member` of the club with a `fee_category_id`:
1. Compute next `invoice_due_date` = next future occurrence of (category.due_month, category.due_day).
2. Compute `invoice_send_date` = `due_date − clubs.fee_reminder_days_before`.
3. Look up existing row for `(club_member_id, fee_type='renewal', season_year)`:
   - If exists & **paid** → skip.
   - If exists & **already emailed** → skip.
   - If exists & pending unsent → refresh amount, label, dates (regenerate).
   - If missing → insert with `invoice_number = next sequence`, `invoice_issued_at = now()`, `invoice_email_status='pending'`.

Returns `jsonb`: `{ created, updated, skipped_paid, skipped_sent }` — surfaced in a toast.

## 4. UI — new "Annual Renewals" tab

`src/components/club-admin/FinanceTab.tsx`: add `TabsTrigger value="renewals"` after Remittances. New component `RenewalInvoicesTab.tsx`:

- Header row: title left, **Generate / Regenerate Invoices** button top-right.
- Summary chips: Total upcoming · Pending send · Sent · Paid.
- Table (next 12 months window):
  Member · Fee Label · Amount · Invoice # · Due Date · Send Date · Status (Pending / Sent / Paid) · Email Sent
- Filter chips: All / Pending Send / Sent / Paid.
- Per-row actions: **Send Now** (manual override that bypasses send_date check) and **View Statement** (opens existing dialog).

## 5. Email cron — daily send

Edge function `send-renewal-invoices` (scheduled via `pg_cron` daily 07:00 SAST):
- Pull rows where `paid=false AND invoice_email_status='pending' AND invoice_send_date <= current_date`.
- Render via `send-transactional-email` using a new template `membership-renewal-invoice.tsx` (member name, club name/logo, invoice #, line item, amount, due date, club bank details from `club_secrets`, payment gateway link if configured).
- Update `invoice_email_sent_at = now()` and `invoice_email_status='sent'` on success, `failed` on error.

## 6. Generation cron — monthly safety net

`pg_cron` job on the **last day of every month at 02:00** calls `generate_member_renewal_invoices` for every active club, so no upcoming renewal is missed even if the admin never clicks the button.

## 7. Technical notes

- All policies follow existing `is_club_admin_or_permitted(auth.uid(), club_id, 'fees')` pattern.
- Invoice number sequence increment is atomic via `UPDATE clubs SET next_invoice_seq = next_invoice_seq + 1 RETURNING …`.
- Regeneration is non-destructive: paid invoices and already-emailed pending invoices are never modified.
- Uses existing `clubs.fee_reminder_days_before` (already configurable on Fees tab) — no new setting.
