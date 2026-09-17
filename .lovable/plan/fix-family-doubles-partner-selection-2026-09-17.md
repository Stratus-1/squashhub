# Fix Family Doubles partner selection

## What will change
- Stop the partner lookup from starting before the invitation owner has completed the required identity check.
- Refresh the lookup when the verification value changes, instead of keeping the failed anonymous result.
- Show a clear retryable error rather than an indefinite spinner or empty list.
- Preserve the rule that only players invited to this doubles event can be selected.
- Record the fix in the project issue log.

## Technical details
- Update the tournament invitation page and shared doubles partner picker only.
- Do not change tournament registrations, pairings, payments, database schema, or invitation recipients.
- Verify with focused tests and the preview diagnostics.
