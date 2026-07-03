
# Member Suspension for Arrears

Introduce a "suspended" state for members whose fee accounts are in arrears beyond club-defined thresholds. Suspended members can log in, view their account, and pay — but cannot book courts, open doors, join leagues, or use any club-billable feature.

## 1. Admin rules (Club Admin → Finance / Membership Rules)

New settings block on the club (persisted on `clubs` or a new `club_suspension_rules` JSON column — small enough for `clubs`):

- **Enable auto-suspension** (toggle)
- **Grace period** — days after fee due date before arrears count (e.g. 30)
- **Amount threshold** — suspend when outstanding balance ≥ R X (e.g. R500)
- **Age threshold** — suspend when any unpaid fee is older than Y days (e.g. 60)
- **Debit order exemption** — do not suspend members with an active `stitch_mandates` row (status `active`)
- **What gets blocked** (checkbox list): court bookings, door access, league signup, challenges, event RSVPs, bar tab
- **Grace message** shown to member on dashboard
- **Manual override** — admin can force-suspend or force-clear on any member row

## 2. Data model

- Add `suspension_status` (`active` | `warning` | `suspended` | `manual_hold`), `suspension_reason`, `suspended_at`, `suspension_cleared_at` to `club_members`.
- Add `club_suspension_rules jsonb` to `clubs` (or dedicated table if it grows).
- Nightly edge function `evaluate-member-suspensions` (cron) recomputes status per member using the rules + `club_member_fee_payments` + `stitch_mandates`. Also runs on-demand after any payment via a DB trigger or invoke.
- Audit trail in `club_journal_entries` or new `member_suspension_log`.

## 3. Enforcement (single source of truth)

- New hook `useMemberAccessGate()` returns `{ suspended, reason, outstanding, allowedActions }` derived from `activeMember` + `club_members.suspension_status`.
- Gate points:
  - `Bookings.tsx` — disable slot clicks; show banner "Account suspended — settle R X to book".
  - `DashboardOpenDoorCard.tsx` — hide/disable tile.
  - `LiveSessionBanner.tsx` door prompt — suppress.
  - Challenge/league/event/tournament CTAs — disable with tooltip.
  - Server-side belt-and-braces: RLS policy or edge-function check on `bookings` insert and on `fluss-trigger` / `shelly-door` invoke (reject if suspended).

## 4. Member UX

- Persistent red banner on Dashboard: "Your account is suspended. Outstanding: R X. Pay now to restore access." → deep-links to `/account#fees`.
- MyAccount and fee-payment flows remain fully functional.
- On successful payment that clears the threshold, trigger re-evaluation and toast "Access restored".
- Warning state (approaching threshold) shows an amber banner but keeps access.

## 5. Admin UX

- New "Suspensions" section in Club Admin → Finance: list of suspended/warning members, outstanding amount, days overdue, mandate status, quick actions (Suspend, Clear, Send reminder).
- Badge on member roster rows.

## Technical notes

- All new tables/columns need `GRANT` + RLS scoped by `club_id` and `has_role`.
- Server-side check is mandatory — client gating alone is bypassable.
- Reuse existing `DebitOrderPromptCard` copy patterns and `member_credit_transactions` for balance math.
- Suspension evaluation must respect `account_delegations` — a delegate paying clears the principal's status.

## Open questions

1. Should suspension be **per-club** only, or also propagate to league eligibility (block from being picked in fixtures)?
2. Do we want an **automatic email + push** on state change (warning → suspended → cleared)?
3. Should the door remain openable for **exit** even when suspended (safety), or is the door entry-only?
