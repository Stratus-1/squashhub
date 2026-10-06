# New Member Application: status review (read-only)

No code, data or publishing changes were made for this review. It is based on the recorded test results from 5–6 Oct and a read-only database check today.

## Verified

| Item | Status | Evidence |
|---|---|---|
| Exact-step, database-backed resume | PASS (preview) | Temporary Nelspruit applicant, fresh browser each time. Stopped after Personal: reopened at Membership with answers kept. Stopped after category: reopened at Club Rules with the category kept. At both stops: no category assigned, 0 fees, 0 admin alerts. Progress cleared on completion. |
| Existing SquashHub person applies to Nelspruit | PASS (preview) | Throwaway person from Reyno Ridge. Warning shown; Cancel created nothing; Yes created one Nelspruit application on the same person record (no duplicate). Normal 6 steps, never the activation route. Fees only at Complete Registration: R875 pro-rated membership + R350 registration. 4 admin alerts only on completion. First club unchanged. |
| Preloaded member activation | PASS (preview, after one fix) | Fake preloaded Nelspruit member (ZZT001, Individuals, R100 opening balance). Linked to the existing row, category kept, no joining or registration fee, no admin alerts, no duplicate person. Fixed: the activation link wrongly said "already linked" when the member was already signed in. |
| Ladder position on activation | PASS (server, live) | Separate fix after Theo's case: existing members keep their ladder position, only members with no position go to the bottom. Theo restored to #11 Durbanville. |
| Regression checks and build | PASS | 3 resume checks added; 24 related checks passed; build clean at the time. Later changes (scroll-to-top, hidden stats/door for pending applicants) built clean, with no full suite rerun since. |
| Test-data cleanup | PASS | Checked today: 0 test members left, 0 saved application progress records. Throwaway logins still exist with no club attached. |

## Server-live vs preview-only

- **Live now (server):** the application progress field and its two save/read functions; the second-club application function; keeping the ladder position on activation; the application-completeness guard and alert/category fixes.
- **Preview only (not published):** saving each step and resuming; the activation-page fix; the "Apply for membership at <club>" button and warning; hiding the door button, member number, bar intro, stats and rankings for pending applicants; each step opening at the top.
- **Risk while split:** the live site saves no step progress, so live applicants still restart at step 1. Nothing breaks, because the server functions are additive.

## Remaining risks and gaps

1. **Real card payment not tested:** paid balance, status change and approval or auto-activation after a real Stitch payment are still manual only. The Stitch return to My Account is also unverified, and Riverside's Stitch portal still needs the My Account return address whitelisted.
2. **Activating with Google not tested.** Andre de Beer's case showed that a Google email different from the imported email leaves the member unlinked.
3. **Resume gap:** someone whose club record is only created at the final save has nothing to resume from.
4. **Wizard reopening for clubs without fee categories:** not reproduced. It could return for legacy members or new clubs.
5. **No full test run since the latest preview changes;** this should be done before publishing.

## Business decisions waiting

- Publish the preview-only items (they should go together so live matches the tested flow).
- Delete the three leftover "ZZ Step check (delete)" R200 fees from an earlier tournament test (Kerry Mokoena, Palesa King, David Roberts). They are still present today.
- Delete the throwaway test logins that have no club attached.

## Suggested next steps (on approval)

1. Run the full automated test suite and build.
2. Remove the three ZZ test fees and the throwaway logins, if Willem agrees.
3. Publish the preview-only items together.
4. Willem or an admin does one real small card payment as a new applicant, to confirm payment and return.
