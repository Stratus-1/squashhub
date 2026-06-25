
# Stitch Recurring Debit Orders

Build monthly/recurring debit collection on top of the existing Stitch one-off integration. Members authorise a mandate once from **My Account**; the club then auto-collects on schedule with an admin approval window. A dashboard prompt nudges eligible members to switch.

## 1. Concepts

- **Mandate** = member's standing authorisation to debit them. Lives in `stitch_mandates`. Rail is either `debicheck` (bank-app authenticated) or `eft_debit` (digital signature).
- **Collection** = one debit attempt against a mandate. Lives in `stitch_collections`. Links back to a fee record, has `due_date`, `status` (queued → approved → submitted → paid/failed).
- **Eligible fees** = any `member_fee_categories` row admin has flagged `recurring_enabled`, plus ad-hoc admin-pushed items (bar tab, league entry, NSA/SSA national body fees).

## 2. Database (migration)

- `stitch_mandates` — `id, club_id, member_id, gateway, rail, max_amount_cents, frequency, debit_day, status, stitch_mandate_id, auth_url, authorised_at, cancelled_at, last_collection_at, consecutive_failures, suspended_at`
- `stitch_collections` — `id, club_id, mandate_id, member_id, fee_payable_id, amount_cents, due_date, status, approval_required, approved_at, approved_by, submitted_at, settled_at, failed_reason, stitch_collection_id, retry_of, attempt_number`
- `member_fee_categories` — add `recurring_enabled bool`, `recurring_rails text[]` (allowed rails), `recurring_debit_day int`.
- `club_members` — add `access_suspended_at timestamptz` (driven by 3 consecutive failures).

Standard GRANTs + RLS: members see own rows; club admins see club rows; service_role full.

## 3. Edge functions

- `stitch-create-mandate` — `{member_id, fee_category_id, rail}` → Stitch GraphQL `clientPaymentAuthorizationRequestCreate` (DebiCheck) or `userInitiationRequestCreate` (EFT). Stores `pending` mandate, returns `auth_url`.
- `stitch-mandate-webhook` — flips mandate to `active` / `failed` on Stitch events.
- `stitch-cancel-mandate` — member or admin cancels.
- `stitch-queue-collections` — **daily pg_cron**. For each active mandate, finds outstanding eligible fees due in next 7 days, inserts collections as `queued` with `approval_required=true`.
- `stitch-submit-collections` — **daily pg_cron**. Submits `approved` rows whose `due_date <= today` via `paymentInitiationRequestCreate`. Auto-approves anything older than 2 days that admin didn't touch.
- `stitch-collection-webhook` — settle/fail handler. Failures: retry at +2 then +5 days; after 3 fails marks mandate failed, suspends member access, notifies both parties.

## 4. Member UI

**My Account → "Payment methods" section** (primary entry point):
- Active mandates: rail badge, amount cap, next debit date, **Cancel** button.
- Per debit-eligible fee category: **"Set up monthly debit order"** → rail picker (only if admin enabled both) → redirect to Stitch auth → return handler hydrates UI when webhook confirms.

**Pay-now buttons** on outstanding fees (bar tab, league entry, NSA/SSA levy):
- If member has an active mandate, show **"Debit my account"** alongside card.

**Dashboard prompt** (new `DebitOrderPromptCard`):
- Shown when member has (a) no active mandate **and** (b) outstanding fees in a debit-eligible category totalling ≥ R100.
- Copy: *"Switch to monthly debit order — never miss a fee again."* with **Set up** (→ My Account section) and **Not now** (snoozes 30 days via localStorage key `sh.debit.prompt.dismissedUntil`).
- Auto-hides once a mandate becomes active.
- Mirrored on `DashboardDesktop.tsx` and `Dashboard.tsx` between the existing fee/availability cards.

## 5. Admin UI (BankingTab → new "Debit Orders" sub-tab)

- **Mandates table**: member, rail, amount, status, next due, actions.
- **Pending approvals**: queued rows in 2-day window — bulk-approve / edit / skip.
- **Collection history**: filterable; failed rows show reason + retry schedule.
- **Settings** per fee category: toggle Eligible, allowed rails, debit day of month.

Admin never initiates a mandate on a member's behalf (Stitch rule — only the account holder can authorise at their bank).

## 6. Failure & suspension

- `public.check_member_access_suspension(member_id)` — called by booking + court-access edge functions.
- Suspended members see a banner: *"Your debit order failed — please update payment to restore access."* Auto-clears when any outstanding collection settles.

## 7. Scope coverage

Eligible fee sources (via admin's category toggle):
- Annual membership (12-way split or single yearly debit)
- Monthly recurring (court hire, locker)
- Outstanding bar tab / ad-hoc — admin pushes one-off collection against existing mandate
- League / tournament entry fees
- Association & national body fees (NSA, SSA) via existing `national_body_fees` → `club_fees_payable` pipeline

## 8. Secrets

Uses existing `club_secrets.stitch_client_id` / `stitch_client_secret`. Add per-club `stitch_webhook_secret` (generated on first mandate) for webhook signature verification.

## 9. Out of scope (follow-up)

- Pro-rata for mid-month signups
- Variable-amount debits (DebiCheck supports it; UX complexity)
- Bulk import of legacy debit orders from another provider

## Rollout

1. **PR 1** — DB migration + `stitch-create-mandate` + mandate webhook + My Account Payment methods section (test mandates end-to-end).
2. **PR 2** — `stitch-queue-collections`, `stitch-submit-collections`, collection webhook, cron schedules, admin Debit Orders tab.
3. **PR 3** — Failure/retry/suspension wiring + member banner + booking gate + Dashboard prompt card.
