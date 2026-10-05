# Let existing SquashHub members apply to a second club

## What changes for the person
At the moment, when someone who already belongs to one club (say Riverside) signs in on another club's page (Nelspruit), the only option they get is "Register as a visitor". After this change they will see two choices:

- **Apply for membership at Nelspruit**: a full new-member application.
- **Register as a visitor**: stays exactly as it works today.

**Warn and confirm:** if they choose to apply, a confirmation box appears before anything is created:
> "You're already a member of Riverside. Applying to Nelspruit creates a separate Nelspruit membership. Nelspruit's joining fee and membership fee will be added to your Nelspruit account, and the club must approve you. Your Riverside membership, fees and history stay as they are."
> [Cancel] [Yes, apply to Nelspruit]

Nothing is created until they press Yes.

After confirming, they go through the same Nelspruit new-member steps a brand-new applicant would: personal details (pre-filled from their existing profile, with fields they can still edit), fee category, league details, club rules, then fees and payment. Progress is saved after every step, so they can leave and pick up where they stopped. Admins are only told once the application is complete, and the club still has to approve them.

They will **never** be sent down the "activate my existing membership" route, because that route is only for members a club has loaded in itself.

## What stays the same
- Their first club's membership, fees, ladder spot and history are not touched.
- Visitor registration works as before.
- Each club only sees its own members and data. When you're on Nelspruit's page you see Nelspruit; when you're on Riverside's page you see Riverside.
- Clubs a person already belongs to are still checked for duplicates, so nobody can apply twice to the same club.

## Not included (could be added later)
- A "switch club" menu inside the app. For now, people move between clubs by opening each club's own web address, which is how it already works.

## Testing before you decide on publishing
- Automated checks: a person who already belongs to another club gets a fresh application, the existing-member shortcut is never offered, and choosing Cancel creates nothing.
- Live test in the preview using made-up test accounts: a test person in a test club applies to Nelspruit. I'll check that their existing person record is reused, a new Nelspruit application is created only after they confirm, both fees are added once, admins are alerted only when the application is complete, and their first club's records are unchanged. I'll stop before any real card payment and delete all the test records afterwards.
- Nothing will be published.

## Technical details
- New security-definer RPC `apply_to_club_as_existing_person(p_club_id)`: requires auth; refuses if the caller already has a non-resigned row at that club; inserts `club_members` (role member, `is_pending_approval=true`, `applied_at=now()`, copies `person_id`, name, email and phone from the caller's existing row); returns the id. The existing duplicate trigger stays in place as a backstop.
- `NoClubAccess.tsx`: adds an "Apply for membership" button and an AlertDialog to confirm; on success, refetches `useMyClubMember` so `Dashboard` opens `MemberOnboardingWizard`, which already treats `is_pending_approval`/`applied_at` rows as fresh applicants. Their earlier signup time doesn't count against them because `applied_at` already marks the row as an application.
- Fees are raised only by the wizard's final save, guarded by the existing check for already-posted fees.
- Update `src/lib/AGENTS.md` (one membership rule) and the issue log, and add tests in `src/test/membership-application-flows.test.ts`.
