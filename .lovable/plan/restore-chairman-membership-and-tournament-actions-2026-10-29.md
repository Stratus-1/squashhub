# Restore chairman membership and tournament actions

## Confirmed issue
The current live chairman restriction rejects automatic membership fees and tournament entry fees. It also rejects changing a member's fee category and confirming an entry as awaiting payment. Later banking exceptions do not resolve these paths.

## Changes
- Allow the chairman to add and approve members and assign their fee category, while retaining existing club approval, family consent and identity protections.
- Raise only the configured membership and registration fees associated with those actions. Preserve existing proration and duplicate-charge safeguards.
- Allow the chairman to accept their own fee-paying tournament entry and use the existing personal payment or member-account process.
- Keep manual billing, corrections, marking fees paid or waived, refunds, journals and other financial administration locked.
- Preserve other clubs' permissions, all saved fixtures/results and existing financial records; do not backdate or automatically bill existing members.

## Technical approach
- Add a new migration rather than changing previously applied migrations.
- Use narrow, server-authorized action boundaries for automatic fee creation and its linked accounting entries. Validate club scope, membership authority or personal entry ownership before permitting writes; restore any transaction-local exception afterward.
- Update member-add/approval callers only where needed to use those boundaries. Do not grant a general fee-table or journal-write exception to the chairman.
- Adjust the registration guard to distinguish legitimate self-entry and canonical fee linking from administrative payment/waiver changes.
- Document the boundary in the architecture rules and issue log.

## Verification
- Add and run disposable-database regressions for member creation, category assignment, approval, self-entry and configured fee creation, including duplicate retries.
- Assert continued rejection of cross-club writes, other people's personal payment actions, manual fee changes, paid/waived status changes and journal writes.
- Verify the member-add/approval and self-entry screens with an authorized chairman session and disposable test records. Never test against a real tournament draw or alter existing member balances.
- Apply the verified server change to the shared database; report separately whether any changed screens still require publication.