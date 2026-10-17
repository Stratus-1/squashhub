# Restore court bookings for linked family members

## Confirmed issue
The family profile selector allows a parent to choose an email-linked child, but the current balance-check function and booking ownership trigger reject that child when the child does not belong directly to the parent's login. Both restrictions are present in the current project and hosted backend. An aggregate read found four linked family membership rows affected by the ownership restriction; no member details were exported.

This is a permission-boundary repair, not a reason to remove balance checks or trust the selected profile. Implement only after this plan is approved.

## What will change
- Restore booking for legitimately linked family profiles within the active club.
- Keep the signed-in parent recorded as the booking actor and the selected child recorded as the playing member. Do not reassign the child's login or merge their identity.
- Check the selected child's own financial eligibility, including approved credit, qualifying recurring coverage and the club's required booking balance.
- Keep fee-sharing delegations limited to viewing and paying fees; they must not grant court-booking permission.
- Reject unrelated members, cross-club selections and attempts to substitute another booking owner.
- Leave existing bookings, financial records, visitor restrictions, administrator privileges and device actions unchanged.

## Technical approach
1. Introduce one narrowly scoped server-side family-booking authorization helper. Derive the actor from the validated session, require the actor's own membership in the same club, and validate the existing shared-email relationship against the verified authentication email rather than caller-supplied email or client storage. Review explicit family-group relationships separately; do not automatically turn billing-package membership or fee delegation into booking rights.
2. Use that helper in `member_booking_eligibility` and `enforce_booking_credit_allowance`. Keep credit calculation server-side and preserve finance-only editing. Avoid widening the general financial-settings RPC unnecessarily; retain its existing authorized fee-reader behavior.
3. Require the booking's `user_id` to match the authenticated actor for non-administrator submissions, while permitting an authorized family `club_member_id` in that club. Preserve narrowly scoped existing administrative paths and service jobs.
4. Review booking insert/update policies and all active insert paths together, including queued bookings. Apply only the changes required for the same family authorization contract. Do not introduce fail-open behavior in the browser.
5. Add a forward-only migration with explicit function privileges; do not rewrite the already-applied migrations. Update architecture rules and the project issue log.

## Verification and safety
- Extend the existing financial/booking suites with isolated PostgreSQL checks for parent → unclaimed child, parent → separately linked child under the approved shared-login relationship, own-member bookings, unrelated-member denial, cross-club denial and forged owner denial.
- Assert child-account attribution and concrete credit maths: R300 credit with an R20 minimum permits otherwise-eligible owing of R280, but rejects R280.01; preserve recurring fee coverage.
- Confirm fee-only delegation alone cannot book and that missing/invalid sessions cannot gain family permission.
- Exercise the real signed-in booking submission and read it back through the UI in an isolated environment or an explicitly approved Riverside test slot. Never operate lights/access hardware, send real member messages or create production test bookings without approval.
- If no suitable ordinary parent account or isolated test environment is available, report authenticated family booking as unverified rather than mark the finding fixed.
- Inspect fresh error signals and run the focused suites. Resolve monitoring finding `003f980c-05f1-5564-b94e-79656de4a8a6` as fixed only after the repair and relevant checks pass.

## Deployment boundary
No publication or live-data edits are included. The backend is shared by preview and the live app: applying the authorization migration changes the rule for both, even without publishing frontend code. Approval of this plan authorizes that bounded rule repair, not fixture, ledger or hardware changes. Preserve web/PWA/native behavior; native-specific flows remain unverified unless separately exercised.