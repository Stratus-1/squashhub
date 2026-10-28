# Chairman: financial view-only access

## Requested result
- Chairman retains full non-financial club administration.
- Financial statements, balances, banking information and reports remain viewable.
- Chairman cannot create, edit, delete, reverse, approve or process financial entries, payments, billing or payroll.
- Treasurer and other authorised finance staff retain their existing access.

## Changes
1. Recognise both the assigned Chairman permission role and elected Chairman office, scoped to the active club.
2. Separate financial viewing from financial changes. Chairman restrictions take precedence over club-level Full Admin and custom financial grants; platform Super Admin remains separate.
3. Secure financial changes at their actual write boundaries, including fees, banking, account adjustments, tournament payment confirmation and payroll—not only the Finance page.
4. Keep reports, statements and their drill-down available; remove financial change controls for the Chairman and show the role as financial view-only in Permissions.
5. Prevent the Chairman from granting themselves financial write access through role or permission editing.

## Technical details
- Existing legacy permission helpers and newer capability checks both need the same rule; do not turn on the newer permissions system as part of this change.
- Preserve club-scoped read policies while denying financial writes through table policies and server-validated actions, including existing full-admin bypasses.
- Preserve member self-service payments and automated provider callbacks; the restriction concerns club administration, not the Chairman paying their own account.
- No financial transactions or balances will be modified during deployment or testing.

## Verification
- Test financial read access and denied create/edit/delete/reverse/approval/processing requests using isolated records and a Chairman session.
- Verify Treasurer write access, other Chairman administration, club isolation and prevention of self-granted financial privileges.
- Check the visible Chairman statement/report workflow and disabled financial actions; report any authenticated checks that cannot run.
- Update the issue log and architecture rules. Do not publish without a release request.