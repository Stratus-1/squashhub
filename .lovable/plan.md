# Recurring payments: club controls + paying off outstanding balances monthly

## What the club admin gets (Payment gateway settings)
Shown only for gateways that support recurring payments (PayFast card, Stitch debit order):
- **Allow recurring payments** on/off switch. Off = members never see the recurring option.
- **Allowed periods**: tick the choices members may pick, e.g. 3 / 6 / 12 months (also 2, 4, 9, 10 available). Members only see the ticked ones.
- **Allow recurring payment of outstanding balances** on/off, with:
  - **Allowed from** date and **Allowed until** date (outside this window members can't start a new one; existing ones carry on).
  - **Maximum months** to pay off the balance (e.g. 6).
  - Optional minimum outstanding amount before the offer shows (e.g. R200).

## What the member sees (My Account)
- If they have an outstanding balance and the club's window is open:
  - **No recurring payment yet** → "Pay your R1 800 outstanding monthly": pick a period (only the club's allowed ones, capped at the maximum), see the monthly amount, activate.
  - **Already on a recurring payment** → "Add outstanding balance to my monthly payment": pick the period; shows current monthly amount, extra per month, new total and the month the extra ends. After that it drops back to the normal amount.
- The existing dashboard prompt card uses the same rules (hidden when the club has it switched off or the window is closed).

## Member message template (all clubs)
A new "Pay your outstanding balance monthly" template added to Member Communications for every club (email, WhatsApp, SMS, in-app), with step-by-step instructions: open My Account → Payments → "Pay outstanding monthly" (or "Add to my monthly payment") → choose months → confirm card/debit order. Merge fields for name, outstanding amount, allowed periods, closing date and a button straight to My Account. Nothing is sent automatically — the admin sends it as a campaign (e.g. Nelspruit to members with a balance).

## Safeguards
- Outstanding-balance plans are separate from the once-off/top-up flow (existing rule), and never touch other clubs.
- Monthly collections settle the oldest outstanding fees first; the extra amount stops automatically once the chosen months are done or the balance is cleared early — never over-collects.
- Stitch debit orders have a bank-approved maximum; if the new total is higher, the member is asked to re-approve before the increase starts. PayFast card plans update without re-approval.
- Every setting change and every plan change is audited.

## Technical details
- Club settings: new columns on `clubs` (or a `club_recurring_settings` row): `recurring_enabled`, `recurring_allowed_months int[]`, `arrears_recurring_enabled`, `arrears_from`, `arrears_until`, `arrears_max_months`, `arrears_min_amount`; gateway capability map in `src/lib/club-payments` decides where the section appears (BankingTab).
- Arrears on mandates: new `mandate_arrears_plans` table (mandate_id, club_id, member_id, total, monthly_extra, months_total, months_charged, status, dates) with GRANTs + RLS (member own rows, club finance/admin). Validation server-side via RPC `start_arrears_plan` (checks toggle, window, allowed months, max, outstanding amount); edge functions `payfast-create-mandate` / `stitch-create-mandate` enforce allowed months too.
- `payfast-charge-mandates` and `stitch-queue-collections` add active plan instalments to the charge, increment `months_charged`, close the plan on completion or zero balance; idempotent per charge date.
- UI: `PaymentMethodsCard.tsx` (period select from club list, new arrears panel), `DebitOrderPromptCard.tsx` gating.
- Template seeded to all clubs with the existing comms template copy approach; new action key for My Account payments.
- Tests: period filtering, window/max validation, monthly instalment maths and plan closure. Issue log updated. Not published.
