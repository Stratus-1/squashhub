# Edit paid tips without undoing a cash-up

## What changes
- Add a **Tips paid to [staff name]** amount field to the cash-up’s **View / edit** window.
- Allow corrections to existing paid-tip entries using positive amounts only. Require a reason before saving.
- Keep **Save changes** separate from **Undo this cash-up**: editing will retain the cash-up, its shift dates, sales and counted cash.
- Recalculate the expected cash and difference immediately so the correction is visible before saving.
- Initially allow paid-tip corrections only on the latest cash-up, protecting already-closed later shifts. Notes retain their existing editing behaviour.

## Accounting safeguards
- Correct the staff payout record and staff’s outstanding tip balance together.
- Record balanced adjustment entries rather than erasing the original accounting entries. Keep the old and new payout amounts in the audit history.
- If the cash-up difference was already written off, adjust that write-off consistently with the corrected payout while preserving the counted cash.
- Keep Undo server-authorised, latest-only and reason-required; ensure it reverses the corrected accounting exactly once.

## Verification
- Test a correction to positive R56, reject negative R56 and zero for an existing paid-tip entry, and verify reason and permission checks.
- Test retries, staff balances, balanced accounting, existing write-offs and Undo after a correction using disposable test records.
- Check the signed-in edit window with fictional records; do not modify Uitsig’s restored R56 payout or R230 cash during testing.
- No publication or live cash-up correction is included.

## Technical details
- Add dedicated authorised read/correction functions for the cash-up’s existing deterministic payout IDs; do not infer editable ownership merely from payout dates.
- Reuse the existing cash-up transaction lock and staff-row lock, with an expected-original amount to detect conflicting edits.
- Preserve existing admin-update behaviour for notes and counted amounts. Refresh cash-up reports, staff balances and finance summaries after a successful correction.