# Hourly staff pay and shift logs

## Staff settings and monthly pay
- Retain Monthly salary and Per shift; add Per hour with a rate for each counter-PIN person.
- Add a club-level normal opening time, initially 16:00 and adjustable by management.
- Show dates, paid start/end times, hours, rate and calculated pay since the previous confirmed payout. Support several shifts on the same day.
- Prepare monthly payouts as before, including outstanding tips. Management can override pay and must confirm before any EFT payment is recorded under Bar cost of sales. No real payout will be tested.

## Starting and ending work
- After personal PIN verification, offer Normal shift or Special shift.
- Normal paid time starts at the later of actual entry and that day's configured opening time. Opening at 15:00 or 15:30 with a 16:00 opening logs paid time from 16:00.
- Special shifts require a paid start time and offer a Split tips switch. A future chosen start does not accrue time early; backdated attendance requires management correction rather than staff self-entry.
- Leaving counter mode closes only that person's attendance. Cash-up closes everyone's attendance on that shared shift, across counters; a later entry starts a new shift.
- Prevent overlapping paid attendance for the same person. Preserve unfinished logs for management review rather than inventing an end time after a lost connection.

## Shared tips
- Split tips only when explicitly enabled for a special shift.
- Allocate that shift's tips in proportion to each participant's logged paid hours, including people who leave earlier or join later.
- Finalise allocations when cash-up closes the shift, before cash-tip payouts are offered. Exclude unsettled shared tips from payable balances until allocation is complete.
- Preserve original sale/server attribution and an audit trail of allocations. Round to cents while preserving the exact total; a zero-hour shift needs management review.
- Keep ordinary-shift tips unchanged. Existing earned tips, payments and historical shifts are not retroactively reallocated.

## Technical implementation and checks
- Add club-scoped shift/attendance/allocation records with explicit grants, protected access and PIN-derived staff identity. Reuse the existing payroll and tip accounting paths.
- Enforce timing, closure, non-overlap and allocation rules on the backend; retries must not create duplicate hours, tips or payments.
- Update all outstanding-tip readers and payout guards together so the Staff step, cash-up and books agree.
- Add focused synthetic tests for the 16:00 opening examples, hourly pay, two shifts in one day, simultaneous staff, weighted tip shares, cash-up closure, overrides and permission boundaries.
- Verify the complete flow with fictional Riverside records only. No live staff attendance, financial records, Uitsig tournament data, hardware operation or publication.