# Roadmap
- [ ] Club Champs admin Paid: remove single-object JSON response dependency, verify saved payment state, and test without changing real registrations.
- [x] Uitsig AGM: saved three email templates and unscheduled draft campaigns (233 unanswered attendance, 204 unsubmitted votes, 2 online attendees); existing personal links reused, saved 23:59 deadline preserved, nothing sent. Recipient lists are preparation-time snapshots.

- [x] Bar: select items into the local tab automatically; My Tab opens existing swipe/cash/member-account choices without a separate open/add step. Focused tests pass; live checkout not submitted. Preview only.
- [x] Removed Club sponsored — no charge from the signed-in app bar; personal-PIN Counter mode retained. Preview only.

- [x] Resolve Nelspruit Court 2 league scoring entry; real phone/tablet links open the live scorer, 26 focused tests pass, existing scores untouched; publication requested.

- [x] GoBook: read-only member balances in My account and Court bookings for API-enabled GoBook clubs; 21 focused tests pass, live CSIR accounts/refresh verified on both pages; backend deployed, frontend not published.

- [x] AGM: self-nomination & self-vote as admin-configurable option per ballot (DB flag, RPC enforcement, admin toggle, nomination/ballot UI)
- [x] AGM: admin-opened secret run-off for tied seats, original links and results preserved; 21 focused tests and Riverside-only end-to-end verification passed; temporary test ballots removed, no emails sent.
- [x] Bar (signed-in member page only): tapping an item adds it to the open tab and confirms with a toast, with no tile left highlighted; Counter mode, staffed orders and the QR/poster page untouched. 2 focused tests pass, live preview verified; preview only.
