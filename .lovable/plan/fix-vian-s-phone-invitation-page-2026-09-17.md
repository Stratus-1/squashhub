# Fix Vian’s phone invitation page

## Goal
Make existing tournament invitation links open reliably on phones without changing or regenerating any invitation, registration, pairing, or payment data.

## Changes
- Keep invitation validation public and server-authoritative, including rejection of invalid, revoked, or expired invitations.
- Remove the service-worker update deadlock that lets an installed phone app keep serving the older invitation page after the fix is published.
- Keep invitation routes network-only and preserve the exact invitation path through refreshes and app updates.
- Apply the behavior generically to every tournament invitation, not only Vian’s link.
- Record the cause and permanent guard in the project issue log.

## Validation
- Confirm Vian’s current Family Doubles short code still resolves to his existing paid registration without modifying it.
- Test the published invitation route in a fresh browser and simulated stale-service-worker state.
- Run focused PWA/invitation tests and check the production build result.

## Scope limits
No changes to invitation tokens, tournament registrations, pairings, payments, tournament rules, or access permissions.
