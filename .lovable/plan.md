# Independent visitor passes (day / 3-day / monthly)

A visitor who is in town for a while can register at a club, buy a pass, pay for it, and then book courts themselves for as long as the pass is valid. This is separate from the existing "a member brings a guest" flow, which stays exactly as it is.

## A) What exists today (inspected)

- **Visitor sign-up** (`ClubAuth.tsx` → `register-visitor-user`) creates a login, a profile and a `club_members` row with role `visitor`. No fee, no pass, no expiry.
- **Visitor booking permission** is a single club switch, `visitors_can_book` (all-or-nothing, forever).
- **Two visitor amounts exist today:**
  - `clubs.visitor_booking_fee` — member brings a guest (Gordons Bay R20, Nelspruit R50). Untouched.
  - `clubs.visitor_self_booking_fee` — what a visitor pays when they book a court themselves (Gordons Bay R40, Nelspruit R0). This is a *court fee per booking*, not a pass fee.
- **Fees** live in `member_fee_categories` (name, amount, `active` on/off, due date, billing period). Charges are raised as `club_member_fee_payments` rows; a database trigger automatically posts the double entry (owing vs income) and picks the income category from the fee type.
- **Ledger / My Account** already exists for any `club_members` row, visitors included.
- **Court fee for visitors** is charged today *after* the slot has passed, into the account-credits table, by `charge_visitor_booking_fee`.
- **Booking balance gate** (`booking-balance-gate.ts`) already blocks bookings when someone owes too much.

### Assumption that needs your nod
Requirement 2 says remove the visitor fee from the Visitors page, but requirement 7 still needs a per-booking court fee for visitors. So: the pass prices move to Fee Structure, and the existing R40/R0 amount stays alive as the **visitor court fee**, edited on the Courts booking-rules card next to the guest fee — not deleted, not silently turned into a pass price. No club's money changes.

## B) Schema and settings changes

- `member_fee_categories.visitor_pass_kind` — `day` / `three_day` / `month`, null for normal fees.
- Seed three rows per club (every existing club and every new one): **Visitor Day Pass**, **Visitor 3-Day Pass**, **Visitor Monthly Pass**, amount 0, `active = false`. `active = false` means "not offered"; `active = true` with amount 0 means a deliberate **free pass**. No prices invented.
- New table `club_visitor_passes`: club, visitor member, pass kind, fee row, amount, status (`pending_payment`, `pending_approval`, `active`, `expired`, `cancelled`), valid from/until, approved by/at, timestamps. GRANTs + RLS: a visitor sees only their own, club admins see their club's.
- `clubs.visitor_pass_requires_approval` boolean, default false.
- New income account **Visitor Fee Income** added to the ledger account list so pass revenue reports separately.
- Fee-to-ledger trigger extended: fee type `visitor_pass` posts to Visitor Fee Income.

## C) Activation and expiry rules

- A pass becomes **active** only when: the charge is fully settled (or the pass is configured active at 0), **and** admin approval is either off or granted.
- `valid_from` = the moment it activates. `valid_until` = +24 hours (day), +72 hours (3-day), +1 calendar month (monthly). All stored as timestamps, compared server-side against `now()`.
- Booking rights end the instant `valid_until` passes; a scheduled/expiry check flips status to `expired`.
- A new pass can be bought on the same visitor record — no duplicate person.

## D) Accounting

- Raising a pass charge: **owing (debtors) up / Visitor Fee Income up** — posted by the existing fee trigger, not by new hand-written entries.
- Payment: handled by the existing payment settlement path (bank/clearing up, owing down) — no new payment code, so retries stay idempotent.
- Court booking fees stay separate lines with their own description, distinct from the pass line.
- Admin rejection does **not** delete anything: the pass is marked cancelled and a reversal/credit is raised through the existing journal reversal helper, leaving the audit trail.

## E) Server-side entitlement

- `has_active_visitor_pass(member_id)` database function; the booking insert policy for visitor-role members requires it, so a visitor cannot bypass the UI by calling the API directly.
- Approval state and validity window are both checked in the database.
- Only rows with role `visitor` are affected — full members are never treated as visitors.

## F) Court fee at booking time

- An active pass grants the right to book; the club's visitor court fee still applies.
- For a visitor, the fee must be covered before the booking is confirmed (checked against their account balance using the existing gate), and it posts as its own ledger line.
- The "member brings a guest" fee logic is untouched.

## G) UI

- **Visitor registration**: pass options with live prices read from Fee Structure, validity, "free" or "payment required", approval notice, and after activation "Visitor pass active until …".
- **My Account** (visitor): pass charge, payment, and court-booking charges as separate lines.
- **Visitors admin page**: pass fee amounts become read-only with a link to Fee Structure; new list of active / pending / expired passes; approve / reject actions for pending ones.
- **Fee Structure**: the three pass rows appear with the other fees, priced and switched on there.

## H) Tests

Unit tests for the validity-window maths and the entitlement decision (paid day/3-day/monthly, free configured pass, unconfigured pass, awaiting approval, expired, renewal). Plus build and the full existing suite.
