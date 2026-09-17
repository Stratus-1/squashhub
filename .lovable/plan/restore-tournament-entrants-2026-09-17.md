# Restore tournament entrants

## Goal
Show the existing paid/registered players on normal member tournament pages again without changing any registration, pairing, payment, or invitation data.

## Changes
- Replace the circular tournament-entry visibility checks with the existing protected tournament-access function.
- Apply the correction to both registration rows and published draw-entry rows so Family Doubles and 2026 Club Champs load consistently.
- Preserve access for the host club's members, tournament organisers, and legitimate cross-club entrants; do not broaden anonymous access to member details.
- Record the regression and safeguard in the project issue log.

## Verification
- Confirm Family Doubles still has 8 paid registrations and Club Champs 2026 still has 71 paid registrations.
- Test the normal signed-in member page and verify player names/counts render instead of zero/blank.
- Confirm unauthorised users do not gain access and run the database security checks.
