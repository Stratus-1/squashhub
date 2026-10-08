# Club-wide roles and permissions redesign — consolidated plan for owner approval

Design only. No code, migrations, access changes or publishing. Production stays exactly as it is until each phase is separately approved.

## 1. Owner decisions (final list)

**Model**
1. Retire the user-facing labels "Full Admin", "Admin" and "Club Admin", and all implicit all-access. Do this only after the legacy audit and a staged migration.
2. Rights come from named, editable role templates built from explicit capabilities. A person may hold **several roles** in one club. Their rights combine.
3. Effective rights = role defaults + individual grants − individual denies. A **personal deny always wins**.
4. The platform Super Admin is separate from all club roles.
5. Everything is club-scoped. Nothing is granted across clubs.

**Chairman**

6. The Chairman is the highest club authority; the Super Admin is above that.
7. Only the Chairman (own club) or the Super Admin grants or revokes finance and sensitive rights. Both may grant directly while helping clubs set up.
8. Grant authority by itself gives the Chairman no finance or Bar & Shop operating rights.
9. **Chairman self-grant is unresolved.** You gave two conflicting instructions; see D1.
10. Nobody may approve their own transaction, including the Chairman.
11. The Chairman alone appoints, replaces and removes all other office bearers. No Super Admin step.
12. **Normal succession:** the current Chairman appoints the successor directly.
13. **Emergency succession:** three distinct committee approvals in total. The Secretary may start it and counts as one of the three. The proposed successor cannot approve. If that fails, the Super Admin may appoint as an exceptional fallback.
14. There is exactly one Chairman at any time, changed in one atomic step.

**Office bearers and members**

15. Office templates are starting points.
    - **Chairman:** oversight and permissions.
    - **Vice-Chair:** broad club functions, except finance.
    - **Secretary:** members, users and constitution, but no finance.
    - **Treasurer:** most finance tasks.
    - **Club Captain:** tournaments and events.
16. By default the Secretary may view and edit ordinary member information, add members, remove members from the club, and change membership status.
    - Removal never deletes the national person record, their other club memberships, or history.
    - The Secretary gets no finance, Bar & Shop, credentials or cross-club rights.
17. Higher-risk member data (national ID, date of birth, finance, sign-in credentials) and bulk export are listed as separate functions. Protections are proposed, not imposed.

**Finance**

18. Finance, including read-only bank balances and ledger, is an explicit per-person right. Read-only never implies any transaction right.
19. Mandate creation, provider authorisation and collection are distinct. A mandate is active only on provider confirmation.
20. Rename "Club Books" to "Finance" in everything users see.

**Delegation and Bar & Shop**

21. **Ordinary operational tasks** (e.g. tournament and event help) may be delegated directly by the responsible role holder. No Chairman approval is needed.
    - Delegation stays in the same club and within the delegator's own rights. Office appointments cannot be delegated.
    - Grants end automatically when the delegator's authority ends.
22. **Sensitive execution rights** (finance execution and Bar & Shop execution such as purchasing, receiving or posting invoices, adjustments, refunds, money movement) can never be delegated. A holder may nominate someone; the Chairman must approve.
23. Each counter operator has their own PIN, and every sale is attributed to the actual operator.
    - The Bar Manager assigns routine counter access directly.
    - PIN create, reset and disable is a separate, Chairman-controlled right.
    - A counter PIN is never confused with a member's account OTP.
24. Stocktake discrepancies and stock adjustments need a second, independent approver.

**Rollout**

25. **No approval flood.** Existing legitimate role-holders keep their agreed default rights, with no re-approval and no pending requests.
    - Nothing working today is stripped before review.
    - The approval workflow applies only to new sensitive grants made after rollout.
26. Approval notices go by in-app and WhatsApp, with a reminder at 24 hours and then daily. There is no automatic escalation.

**Onboarding**

27. **Preloaded club** (most SA clubs, rosters from SportyHQ, no authorised user yet): the first verified real user claims it and becomes Temporary Chairman. Existing identity matching is reused.
28. **Genuinely new club** (incl. international): the first registrant creates it and becomes Temporary Chairman.
29. In both cases, existing club or member rows never count as "activated".

## 2. Audit: how access works today (confirmed)

| Path | Stored | Grants today |
|---|---|---|
| Platform admin | `user_roles` admin (1 user) | Everything in every club |
| Platform moderator | `user_roles` moderator (0 now) | Same as platform admin via `is_club_admin` / `is_platform_admin` |
| Federation / association admin | `organisation_admins` (1 / 11) | Federation scope only |
| Member role "admin" | `club_members.role='admin'` (29) | Full club admin |
| Full admin | `club_member_permissions.is_full_admin` (6) or Full Admin role | Full club admin |
| **Office bearers** | `clubs.chairman/secretary/club_captain_member_id` | **Full club admin, including all finance** |
| Permission keys | custom permissions / role permissions | Per area (access, banking, bar, champs, club, courts, fees, finance, members, settings, users, …) |
| Captain | `role='captain'` (35) | League-scoped only |
| Bar staff | `bar_staff_can_serve` | Till, and today also counter PIN and device management |

**Office-bearer templates today** (about 800 clubs):

| Template | Keys today |
|---|---|
| Chairman | Every key, including finance, banking, bar and devices |
| Secretary | All of these: access, banking, bar, champs, club, courts, fees, finance, ladder, leagues, members, settings, users, visitors |
| Club Captain | Same keys as Secretary |
| Treasurer | banking, bar, fees, finance, members |

Only 8 clubs have a Chairman recorded.

**Checks:**
- `is_club_admin` is used by 71 functions and 202 access rules, and bypasses all keys.
- `is_club_admin_or_permitted` is used by 46 functions and 91 rules.
- `is_platform_admin` includes moderators.
- About 25 server functions and about 40 app files check admin or full admin directly.

**Escalation risks:**
- Any club admin, or anyone holding the `club` key, can set themselves as an office bearer and so become a full admin.
- Office bearers silently get full finance.
- Mandate "Mark authorised" and journal reverse/delete check only for admin.
- `post_journal` has no caller check.
- Any bar staff member can manage counter PINs and devices.

**Who has full finance today:**
- the platform admin;
- the 29 admin members and the 6 full-admin people;
- Full Admin role holders;
- office bearers in the 8 clubs that have them recorded;
- holders of the `finance` key, plus partial access through `fees` and `banking`.

**Member data:**
- Signed-in users can't read the ID number, address, phone or email columns directly. Staff screens get them through server functions.
- National ID is also kept in a restricted record. Date of birth shows as age only.
- The member list can be exported.

**Onboarding:**
- Claims on listed clubs are approved by the platform admin. Approval makes the claimant a club admin and fills the Club Captain office, not the Chairman.
- Registration already runs a duplicate-person check with these match levels:
  - **exact:** same phone and name;
  - **phone:** same phone, different name (families share phones);
  - **name only;**
  - **none.**
- Existing accounts are revealed only after a phone OTP.
- A verified email can claim a matching unlinked imported member.
- An SA ID links to the national person.

## 3. Target model

### Building blocks
- **Capability** `area.action` (e.g. `fin.bank.view`, `bar.stocktake.count`). Each has a class:
  - **O, operational:** delegable by a holder with the delegate right.
  - **S, sensitive:** granted by the Chairman or Super Admin; not delegable.
  - **F, finance:** granted by the Chairman or Super Admin; not delegable.
  - **X, execution:** finance or Bar & Shop execution. Nominate, then the Chairman approves; never delegable.
  - **G, governance:** appointing offices and granting permissions. Derived from the Chairman office, never a grantable key.
- **Role template:** an editable bundle per club. Editing a template affects every holder; it never undoes a personal deny.
- **Personal override:** a grant or deny for one person, with a required reason and an optional expiry.
- **Office:** a position (Chairman, Vice-Chair, Secretary, Treasurer, Club Captain). Appointment applies the office's default template. Removal ends only what that template gave. A right stays if another role or a personal grant still provides it.

### Who can grant what
| Class | Granted by | Delegable |
|---|---|---|
| F, X | Chairman (own club), Super Admin; others may nominate X | Never |
| S | Chairman, Super Admin | Never |
| O | Chairman, Super Admin, or a holder with the delegate right for that capability | Yes: same club, same or narrower scope |
| G | Chairman office only (Super Admin for recovery) | Never |

Any role a delegator assigns is stripped of its S, F and X capabilities, so execution rights can't be passed on indirectly through a role. The server check `can_grant()` enforces this for roles, personal grants, template edits and imports.

### Direct delegation (no Chairman approval)
- **Club Captain / Competitions Coordinator (confirmed):** may appoint same-club tournament and event helpers, with a subset of their own rights and scope (e.g. one tournament). Helpers can't delegate further (proposed).
- **Proposed (D9):**
  - Court & Bookings Officer: booking help.
  - Communications Officer: drafting and sending to groups; not exports.
  - Bar Manager: routine counter access (`bar.sell` with the person's own PIN), stocktake counting without posting, and viewing stock levels without cost prices.
- Audit records who appointed whom, which rights, the scope and the times. The Chairman can see and revoke every delegated grant.

### Nomination workflow (class X)
1. A holder (e.g. the Treasurer) nominates a same-club member for specific capabilities, with a scope and a reason. Self-nomination is refused, and so is nominating for rights the nominator doesn't hold.
2. The Chairman approves, narrows or declines. Nothing takes effect before that. The grant is recorded as "Granted by Chairman, nominated by Treasurer".
3. Notices go by in-app and WhatsApp to the Chairman, with a reminder at 24 hours and then daily until decided. There is no automatic escalation. The nominator may withdraw.

### Chairman succession
- **Normal handover:** only the current Chairman can start it (with re-authentication). The successor must be an active member of the same club with a login.
  - There is an effective time; the successor accepts (D6); the Chairman can cancel until it takes effect.
  - At the effective time, one atomic step closes the old office and opens the new one.
  - A database uniqueness rule allows only one open Chairman office per club, and one pending handover per club.
  - Chairman authority transfers. The outgoing Chairman's personal rights don't transfer and stay for the new Chairman to review.
- **Emergency:** started by the Secretary (or another eligible committee member, D7).
  - It needs three approvals in total from three distinct eligible committee members; the Secretary counts if they approve.
  - Each person counts once. The successor and the absent Chairman can't vote. Each vote is re-authenticated.
  - The third approval triggers the atomic switch.
  - The Vice-Chair may request it but never takes the role alone.
- **Super Admin fallback:** used only when three approvals can't be reached. Requires a reason, evidence and re-authentication, with the same atomic switch.
- The direct office fields on `clubs` are locked. They change only through these processes, and every step is permanently audited.

### Other office bearers
- Only the Chairman appoints, replaces or removes them.
- On removal:
  - template-derived rights end immediately;
  - membership is kept;
  - personal grants tied to that office end;
  - unrelated personal grants are listed for the Chairman to keep or revoke;
  - grants they delegated end automatically.
- Each change is audited and the person is notified.

### Several roles per person
- Rights from all roles combine; a personal deny wins.
- Separation of duties applies **to the person**: nobody approves what they initiated, counted or captured, whichever roles they hold.
- The Chairman sees a notice when one person would hold both sides of a separated pair.

### Immediate effect and display
- The server checks effective rights on every action. Screens refresh within seconds and re-check on save. Counter PINs are re-checked at each use.
- Each person's rights screen shows every capability with its source, e.g. "From role: Secretary", "Personal grant by Chairman 8 Oct", "Nominated by Treasurer", "Denied by Chairman 8 Oct: reason", "Self-granted" (if D1 allows it).

## 4. Default templates (confirmed list; editable per club)

| Template | Default content | Class |
|---|---|---|
| Club Manager | members view and edit, bookings, courts, events, visitors, group communications, settings view | O + S (Chairman) |
| Membership Officer | members view and edit, applications, invites | S |
| Competitions Coordinator | leagues, ladder, tournaments, results; delegate on | O |
| Court & Bookings Officer | courts, bookings, visitors, lights | O |
| Communications Officer | campaigns to members | S |
| Access Device Officer | access, devices, doors | S |
| Treasurer | all `fin.*` except manual mandate authorise | F/X |
| Finance Viewer | `fin.overview.view`, `fin.bank.view`, `fin.reports.view` (read-only) | F |
| Billing Clerk | billing create and remind, fees view | F/X |
| Bar Manager | items, stock view, counting, counter access, receiving; delegate on routine counter access and counting | O |
| Bar Staff | sell with own PIN, charge account (debit limits apply) | O |
| Stock Counter | stocktake count, stock view | O |
| Bar Controller | cost view, approvals, prices, refunds, PIN admin, devices, settings | S/X |
| Team Captain | league-scoped captain duties (unchanged) | O |

**Office defaults (D10):**

| Office | Default | Finance |
|---|---|---|
| Chairman | View of all non-finance areas, members admin, appoint offices, grant permissions | None automatic (D1, D2) |
| Vice-Chair | Club Manager + Competitions + Court & Bookings + Communications | None |
| Secretary | Membership Officer + add/remove/status + club rules and documents + communications | None |
| Treasurer | Treasurer template | Yes |
| Club Captain | Competitions Coordinator + events + court bookings | None |

## 5. Member data

| Function | Capability | Secretary | Chairman | Others |
|---|---|---|---|---|
| View names and contact | members.profile.view | Yes | Yes | By role |
| Edit ordinary records | members.profile.edit | Yes | Yes | No |
| Add / remove from club / change status | members.admin | Yes | Yes | No |
| Applications, invites | members.invite | Yes | Yes | No |
| View national ID / date of birth | members.id.view / members.dob.view | D11 | D11 | No |
| Export lists | members.export | Yes, logged (proposed) | Yes, logged | No |
| Communications to members | comms.send | Yes | Yes | Communications Officer |
| Assign roles | (governance) | No | Yes | No |
| Merge duplicates | members.merge | No (proposed) | Yes | Super Admin |
| Delete the person record | — | Never | Never | Super Admin only, for privacy-law requests |
| Login link, face data | members.login.link, access.face | Separate | Separate | — |
| Member-data audit view | members.audit.view | Yes | Yes | No |

**Removing someone from the club:**
- It marks only this club's membership as removed. The national person record, other clubs and all history stay.
- A confirmation shows any balance owing and any active mandates or entries.
- It is audited, and it can be undone.

## 6. Finance matrix
Columns: V = view, I = initiate, E = edit, A = approve, Act = activate or cancel, S = send/remind, R = reconcile, Rf = reverse/refund, C = configure, X = export.

| Function | V | I | E | A | Act | S | R | Rf | C | X |
|---|---|---|---|---|---|---|---|---|---|---|
| Overview, debtors | fin.overview.view | | | | | | | | | fin.export |
| **Bank accounts, balances, ledger** | **fin.bank.view (read-only)** | fin.bank.transaction_create | fin.bank.edit | | | | fin.bank.reconcile | | fin.settings.configure | fin.export |
| Statement import / allocation | fin.bank.view | fin.bank.import / fin.allocate | fin.allocate | | | | | | | |
| EFT/deposit top-ups | fin.eft.view | fin.eft.capture | | fin.eft.approve | | fin.eft.remind | | fin.reverse | | fin.export |
| Billing, invoices | fin.billing.view | fin.billing.create | fin.billing.edit (unpaid) | | | fin.billing.remind | | fin.billing.credit_note | | fin.export |
| Fees, waivers | fin.fees.view | fin.fees.create | fin.fees.edit | fin.fees.waive | fin.fees.activate | | | | | |
| Recurring mandates | fin.mandates.view | member only | | provider only | fin.mandates.cancel | fin.mandates.remind | fin.mandates.check_status | | | fin.export |
| Collections | fin.collections.view | fin.collections.queue | | fin.collections.submit | | | fin.collections.reconcile | fin.collections.refund | | fin.export |
| Journals | fin.journal.view | fin.journal.create | never after posting | fin.journal.approve (over threshold) | | | | fin.reverse | | fin.export |
| Payables | fin.payables.view | fin.billing.create | | fin.payables.pay | | | fin.bank.reconcile | fin.reverse | | fin.export |
| Reports / settings / audit | fin.reports.view / fin.settings.view / fin.audit.view | | | | | | | | fin.settings.configure | fin.export / fin.audit.export |

**Mandates:**
- A mandate becomes active only on provider confirmation. Notices and reminders never activate anything.
- Manual "Mark authorised" becomes a separate key (D12). It needs a reason, is never allowed on yourself or family, and shows "not provider-verified".
- Collections count as paid only on provider confirmation.

## 7. Bar & Shop matrix
| Function | Key | Class |
|---|---|---|
| View stock quantities | bar.stock.view | O |
| View cost prices, valuation, margins | bar.cost.view | S |
| Start / count stocktake | bar.stocktake.start / .count | O |
| **Approve stocktake discrepancies and post** | bar.stocktake.approve | X — second person, never the counter |
| Request adjustment, write-off, transfer | bar.adjust.request | O |
| **Approve adjustment** | bar.adjust.approve | X — never the requester |
| Purchase requisition / approve purchase order / place order | bar.purchase.request / .approve / .order | O / X / X (new feature) |
| Receive delivery | bar.receive | X |
| Capture / approve supplier invoice | bar.invoice.capture / .approve | X / X (not the capturer) |
| Pay supplier | fin.payables.pay | F/X |
| Suppliers | bar.suppliers | S (new feature) |
| Items, categories, specials | bar.items | O |
| Price changes | bar.prices | X |
| Routine counter access (sell with own PIN) | bar.sell | O — Bar Manager assigns |
| Charge member account | bar.charge_account | O (debit limits apply; member OTP where required) |
| Discount up to limit / over limit | bar.discount / .over_limit | O / X |
| Void same shift under limit / refund | bar.void / bar.refund | O / X |
| Till open-close / cash-up | bar.till.open_close / .reconcile | O / X (new feature) |
| **PIN create / reset / disable / unlock** | bar.pin.manage | S — Chairman grants (D13) |
| Counter devices | bar.devices.manage | S |
| Bar settings | bar.settings | S |
| Reports / with cost | bar.reports / .cost | O / S |

**Counter PINs:**
- PINs are never shown or logged. Every change is audited.
- Removing someone's counter access disables their PIN.
- A first PIN or reset uses a one-time setup code (D13).

**Member OTP:** this approves a charge to the member's own account and is logged separately. It never replaces an operator PIN, and an operator PIN never replaces it.

**Cross-module effects:** receiving, invoices and stocktake approval change stock value and journals; account charges create debts. Both audit trails record these. Finance staff can see the resulting ledger lines without any Bar & Shop key.

## 8. Separation of duties and audit
- No self-approval anywhere: captures, counts, adjustments, invoices, refunds, journals, payments, and own or family accounts and mandates.
- Nobody changes their own roles or offices (Chairman self-grant: D1).
- A finance-settings change blocks paying to that changed bank account for 24 hours.
- In tiny clubs, the Super Admin may act as the second approver on request, logged (D14).
- The audit records every grant, deny, delegation, nomination, decision, office change, succession step, claim and sensitive action: who, for whom, what, club, before and after, reason and time. Records can't be edited or deleted. PINs and card data are never logged.

## 9. Onboarding (both pathways)

**Activation is separate from data:** imported club rows, member rows and office names grant nothing.

**Pathway A: preloaded club**
1. The person picks the existing club. Creating a club is blocked when a close match exists.
2. Their identity is matched using the existing registration matching: SA ID, verified email, and phone with OTP. They are linked to their national person record and imported member row. No duplicate person or member is created, and no new verification is added.
3. **A member match is not the right to claim the club:**

| Situation | Outcome |
|---|---|
| Trusted match (SA ID, verified email, exact phone + name), club not activated, no other pending claim | Temporary Chairman at once, followed by a 7-day public notice and dispute window |
| Also matches the club contact or an imported office bearer | Same; recorded as stronger evidence |
| Weak match (name only, or phone with a different name) | Linked as a member after OTP; claim goes to quick review |
| No match to that club | Joins as a new member after the duplicate check; claim goes to quick review |
| Another claim pending | Told it's pending; may dispute. First verified claim wins |
| Club already activated | No claim; may ask to join or dispute |
| Match later found false | Member link corrected; Super Admin removes the temporary Chairman; data kept |

**Pathway B: genuinely new club, including international clubs.** A worldwide duplicate-club search runs first. The person then creates the club, verifies email and phone, and runs the duplicate-person check. They become Temporary Chairman at once.

**In both pathways:**
- A clear notice and a permanent "Temporary Chairman" badge, with reminders.
- Handover to the real Chairman uses the normal atomic handover.
- A dispute freezes grant authority.
- Proposed limits while temporary (D15):
  - no finance self-grant;
  - no payout bank changes without a Super Admin check;
  - no member deletes, merges or bulk export;
  - no payment gateway credentials;
  - no bulk messages during the dispute window.

## 10. "Club Books" → "Finance"
Visible text only: menus, titles, breadcrumbs, approval cards, help, emails and notices. URLs, keys and database names stay unchanged.

## 11. Rollout for existing clubs (no approval flood)
1. **Inventory per club:** every current right of every person, from role templates, custom keys, full admin, the admin role and office bearers.
2. **Mapping, applied automatically for role defaults:**

| Legacy | Maps to | Re-approval |
|---|---|---|
| Treasurer / Finance role, `finance` key | Treasurer template | None |
| `fees` key | Billing Clerk + Finance Viewer | None |
| `banking` key | Finance Viewer + bank import/reconcile | None |
| `bar` key | Bar Manager (+ Bar Controller where they use those functions today) | None |
| Club Captain office/role | Club Captain default + any current rights not covered | None |
| Secretary office/role | Secretary default + any current rights not covered | None |
| Chairman office/role | Chairman default + any current rights not covered | None |
| `role='admin'`, full admin, Full Admin role | "Legacy carry-over" set = exactly what they have today | None; listed for later review |
| Other keys | Matching O capabilities 1:1 | None |
| Platform moderator | Platform Support | — |

3. **Carry-over, not revocation:** any current right not covered by the new defaults is kept as a "Legacy carry-over" personal grant, marked as such. Nothing is removed until the Chairman or Super Admin reviews it. No pending requests are created.
4. **Prospective only:** after rollout, the nomination and approval workflow applies only to new sensitive or execution grants. The Chairman and Super Admin can grant directly at any time, audited.

### Pilot: Riverside only, then owner-approved waves

**Club gate:**
- Each club has a setting, `club_permission_settings.new_permissions_enabled` (default **OFF**). It is set only by the Super Admin.
- Shared checks use one wrapper: if the club's gate is OFF, it returns exactly today's legacy answer (the existing functions, unchanged). If ON, it uses `has_cap()` and the new workflows.
- The existing functions (`is_club_admin`, `is_club_admin_or_permitted`, `bar_staff_can_serve`, …) are **not edited** during the pilot. The wrapper sits beside them and is adopted area by area.
- All schema is additive (new tables and columns with defaults) and invisible to clubs with the gate OFF.

**Pilot steps:**
1. **Dry run for all clubs:** a read-only comparison of today's effective rights against the mapped new model, per person per club. Riverside is reviewed in detail; a summary is produced for all other clubs.
2. **Riverside setup:**
   - Inventory and mapping with carry-overs.
   - Test accounts: Chairman, Treasurer, Secretary, Club Captain, Bar Manager, two counter staff and an ordinary member (D18, D19).
3. **Gate ON for Riverside only.** Other clubs keep today's behaviour.
4. **Pilot tests in Riverside:**
   - Roles and multiple roles; custom grants and denies.
   - Delegation (Club Captain helpers) and nominations with Chairman approval.
   - In-app and WhatsApp approval notices and reminders (WhatsApp to test numbers only).
   - Finance segregation: view-only bank; EFT approval not by the initiator.
   - POS segregation: individual PINs, PIN admin, stocktake second approver, refunds.
   - Chairman handover and emergency votes on test accounts.
   - Audit trail completeness.
5. **Regression for non-Riverside clubs:** automated same-answer comparison on every check. Spot flows (booking, bar sale, EFT approval, tournament entry) in Nelspruit with synthetic, rolled-back rows.

**Instant disable:**
- Setting Riverside's gate OFF returns it to legacy answers immediately. No data is deleted.
- New-model records (grants, nominations, audit) stay stored but inactive.
- Real transactions made during the pilot are normal records, valid under either model.

**Pilot acceptance criteria (all needed before any wider wave):**
- Zero unexpected refusals for Riverside's real legitimate users over at least 2 weeks.
- Every test scenario in section 13 passes in Riverside.
- Non-Riverside comparison shows zero differences.
- Zero pending approval requests created by the migration.
- Audit records are complete for every pilot action.
- The gate OFF/ON cycle has been tested once with no data change.
- Approval notices delivered, with reminders at 24 hours and then daily.

**Waves after the pilot:** each needs **explicit owner sign-off**.
1. **Wave 1:** a few named clubs, e.g. Nelspruit plus clubs with active committees.
2. **Wave 2:** clubs with recorded office bearers.
3. **Wave 3:** remaining clubs.

Each wave gets a dry-run report, the same acceptance criteria, and its own rollback (gate OFF per club).

**Stages:**
1. **Add only.** New catalogue, assignments, overrides, append-only events, `legacy_mode=ON` per club, and `has_cap()`. While legacy mode is on, `has_cap()` returns the old answer.
2. **Early safety fix** (separate approval): lock the office fields to the Chairman flows. Nobody loses access.
3. **Shadow mode.** Each area's checks move to `has_cap()` but still return the legacy answer, while logging what the new model would decide. A per-club difference report follows.
4. **Inventory and mapping** written per club, including carry-overs. Owner spot-check on sample clubs (Nelspruit, plus Riverside read-only).
5. **Per-club switch:** legacy mode OFF. The shadow report must show zero unexpected refusals for current legitimate users.
6. **Retire labels:** hide "Full Admin", "Admin" and "Club Admin". New clubs get the new templates. Office bearers stop auto-receiving admin.
7. **Final cleanup** (separate approval): remove implicit paths and mark legacy columns deprecated (kept, not dropped).

## 12. Migration safety and rollback checklist
- [ ] Each stage is approved separately. No stage combines schema and behaviour change.
- [ ] Stage 1 is additive only: no drops, renames or type changes. Every new table has grants, RLS and policies in the same migration.
- [ ] Snapshot of effective rights per person per club taken before each stage, and stored.
- [ ] With legacy ON, every check gives the same answer as before, by automated comparison per club.
- [ ] Shadow report per club: no current legitimate user loses a right they use. Any difference becomes a carry-over.
- [ ] No pending approval requests are created by the migration (count = 0 verified).
- [ ] Bookings, doors and lights, payment callbacks, marker, tills, notifications and automated jobs are tested per area before switching that area.
- [ ] Pilot gate verified: only Riverside has `new_permissions_enabled`. Every other club passes the same-answer comparison before and after each pilot deploy.
- [ ] Riverside members, bookings, finance and stock records untouched by the pilot (D18). Test accounts and synthetic rows are labelled and removable.
- [ ] **Rollback:**
  - Set `legacy_mode` back ON per club, effective immediately.
  - Legacy flags and keys are never deleted during 30 days after the switch.
  - The early safety fix can be undone by restoring the previous update rule.
- [ ] Audit trail verified: grants, carry-overs and switch events are all logged.
- [ ] Web, PWA and Android behaviour checked for permission refreshes.
- [ ] Architecture notes and the issue log updated.

## 13. Tests (planned)
- Legacy ON gives identical answers. Legacy OFF gives no implicit admin access.
- Roles combine; a deny wins; removing one role keeps rights held another way.
- `fin.bank.view` can read balances and ledger, and every banking write is refused.
- Class S, F and X grants come only from the Chairman or Super Admin. Delegated roles are stripped of S, F and X. A nomination does nothing until approved. Reminders at 24 hours and then daily, with no escalation.
- Delegation stays in the same club, within the delegator's own rights, and ends when their authority ends.
- No self-approval: stocktake, adjustment, invoice, journal and refund each need a second person.
- Counter PINs: individual, never returned, managed only with `bar.pin.manage`, and disabled when access ends.
- Succession:
  - only the Chairman can start a handover;
  - exactly one Chairman exists after any change;
  - emergency replacement needs three distinct votes, and the successor's vote is refused;
  - the Super Admin fallback works.
- Onboarding:
  - no duplicate club or person is created;
  - a weak match goes to review;
  - a second claimant is blocked;
  - an already-activated club refuses a claim.
- The migration creates zero pending requests, and rollback restores the old answers.

## 14. Decisions needed
- **D1. Chairman self-grant (conflict).** At 13:24 you allowed it; at 13:25 you said finance access for the Chairman comes via the Super Admin. Choose:
  - (a) allowed, with permanent audit, a "Self-granted" badge, optional alerts to the Treasurer and Super Admin, and Super Admin revoke;
  - (b) refused; Super Admin only.
  - Until you choose, (b) applies. Self-approving transactions is refused either way.
- **D2.** Should the Chairman get read-only finance by default, or none until granted (proposed)?
- **D3.** "Super Admin" means the platform Super Admin only (proposed), not the federation admin or support staff?
- **D4.** Thresholds for discounts, voids, refunds and journal second approval?
- **D5.** Build the missing Bar & Shop features (suppliers, purchase orders, till cash-up) now or later?
- **D6.** Must the successor accept the handover before it takes effect (proposed: yes)?
- **D7.** Emergency replacement details:
  - Who counts as an eligible committee member? Proposed: office holders plus offices the Chairman marks.
  - Request expiry? Proposed: 14 days.
  - What evidence is required?
  - Proposed: a 72-hour objection window for the absent Chairman.
- **D8.** Allow temporary grants and denies with an expiry date (proposed: yes)?
- **D9.** Direct delegation for Court & Bookings Officer, Communications Officer and Bar Manager, as listed?
- **D10.** Approve the office defaults. Vice-Chair excludes granting permissions and sensitive rights. Secretary "constitution" = club rules and documents.
- **D11.** National ID: masked with logged full view (proposed), full view, or a separate right? Date of birth: age only (proposed)?
- **D12.** Manual "Mark authorised": remove, or keep as a Super Admin-only key?
- **D13.** `bar.pin.manage` default holder: the Bar Manager once the Chairman grants it (proposed)? First PIN set via a one-time setup code (proposed)?
- **D14.** Tiny clubs: Super Admin as the second approver on request (proposed)?
- **D15.** Onboarding: automatic activation on a trusted match (proposed)? Approve the limits while temporary, a 90-day expiry for temporary status, and the 7-day notice?
- **D16.** Approve the early office-field lock as a stand-alone fix?
- **D17.** Family exclusions based on account delegations, family groups, or both?
- **D18. Riverside pilot vs "never alter Riverside's live data" (standing rule).** The pilot changes how access is checked for Riverside's real users. It also adds test accounts, roles and audit rows there. It doesn't change members, bookings, finance or stock records. Please confirm this exception for the pilot. Test accounts would be clearly named, billing-exempt, hidden from public lists and removed afterwards. Test finance and POS flows would use synthetic rows that are reversed, never real member balances.
- **D19.** Who in Riverside fills the real Chairman, Treasurer, Secretary, Club Captain and Bar Manager roles during the pilot? Or should it run with test accounts only, with real users left on today's mapping (carry-over)?

## Technical details
- **Audited:** `is_club_admin` (platform admin/moderator, `role='admin'`, `is_full_admin`, office bearers), `is_club_admin_or_permitted`, `is_platform_admin`, `has_role`, `bar_staff_can_serve`, `is_club_captain`; `club_member_permissions`, `club_permission_roles`; `create_default_finance_role`, `auto_assign_officer_roles`; `clubs` UPDATE policy; `club_members` policies (admin/self/`members` key update; column grants exclude id_number, address, phone, email); `member_bar_pins` (hash, attempts, lock); `bar_counter_sessions`; `club_claim_requests` + `approve_club_claim`; `_shared/person-match.ts`, `useDuplicateGuard`, `account-recovery`; frontend `use-club-permissions.ts`, `use-club-billing.ts`, `use-door-control.ts`.
- **Proposed objects:**
  - Catalogue and assignments: `capability_catalogue(key, area, class O/S/F/X/G, delegable)`, `member_role_assignments`, `member_capability_overrides(effect grant|deny, can_delegate, source role|personal|delegated|nominated|carry_over, granted_by, delegated_from, reason, expires_at)`, `effective_capabilities` view, `has_cap()`, `can_grant()`.
  - Workflows: `capability_nominations` (status, reminders), `club_offices` (unique open Chairman per club), `chairman_handovers`, `chairman_emergency_requests` + `_votes` (unique voter per request).
  - Audit and switch-over: `permission_events` (append-only), `club_permission_settings(legacy_mode, thresholds)`, `permission_shadow_log`, `permission_inventory_snapshots`.
- Approval notices use the existing notifications and club WhatsApp sending (respects club enablement and opt-outs).
- `mandate_notification_recipients` moves to `has_cap(...,'fin.mandates.view')`. The EFT attribution migration stays cancelled.
