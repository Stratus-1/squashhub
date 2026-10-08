# Club-wide roles and permissions redesign — consolidated plan for owner approval

Design only. No code, migrations, access changes or publishing. Production stays exactly as it is until each phase is separately approved.

## 0. Design priorities (owner)
1. **Audit chain first.** Every right has a recorded origin. Every significant action records who did it and which right allowed it, traceable back to the original grantor. The Chairman can search it easily (section 8).
2. **Proportionate for volunteer clubs:** low friction, no re-authentication, waiting periods or repeated confirmations for ordinary changes.
3. **Essential boundaries only:** club scope, finance and execution rights granted by the Chairman or Super Admin, and an independent second approver for sensitive finance and stock actions.

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
8. The Chairman automatically has **finance read-only** (balances, ledger, reports). Other Bar & Shop and finance execution rights don't come with the office.
9. The Chairman **may self-grant** execution rights in their own club. Each self-grant is permanently audited, marked "Self-granted", and optionally alerted to the Treasurer and Super Admin. The Super Admin can revoke it.
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

25. **No approval flood.** Existing role-holders keep their new default rights, plus explicitly assigned custom roles and grants, with no re-approval and no pending requests.
    - Blanket implicit rights (Full Admin, admin role, finance that came only from being an office bearer) are **not** grandfathered. They are removed at activation and listed in the impact report.
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
- **Club Captain / Competitions Coordinator (confirmed):** delegation is built into the role, with no separate delegate toggle. They may appoint same-club tournament and event helpers, with a subset of their own rights and scope (e.g. one tournament). Helpers can't delegate further (proposed).
- **Proposed, same built-in style (D9):**
  - Court & Bookings Officer: booking help.
  - Communications Officer: drafting and sending to groups; not exports.
  - Bar Manager: routine counter access (`bar.sell` with the person's own PIN), stocktake counting without posting, and viewing stock levels without cost prices.
- Audit records who appointed whom, which rights, the scope and the times. The Chairman can see and revoke every delegated grant.

### Nomination workflow (class X)
1. A holder (e.g. the Treasurer) nominates a same-club member for specific capabilities, with a scope and a reason. Self-nomination is refused, and so is nominating for rights the nominator doesn't hold.
2. The Chairman approves, narrows or declines. Nothing takes effect before that. The grant is recorded as "Granted by Chairman, nominated by Treasurer".
3. Notices go by in-app and WhatsApp to the Chairman, with a reminder at 24 hours and then daily until decided. There is no automatic escalation. The nominator may withdraw.

### Chairman succession
**Proportionality (owner principle):** these are volunteer clubs, so ordinary role changes need no re-authentication, waiting periods or repeated confirmations. A normal signed-in session plus a basic audit record is enough. Separation of duties stays only for sensitive finance and stock approvals.

- **Normal handover (decided):**
  - The current Chairman nominates a successor (an active member of the same club with a login) and may pick an effective date.
  - The successor gets an in-app and WhatsApp notice and **accepts**.
  - The handover takes effect atomically at the later of acceptance and the chosen date.
  - The Chairman can cancel before then.
  - Chairman authority transfers. Rights granted to the outgoing Chairman independently of the office stay.
- **Stepping down from any office:** role-linked rights end when the removal or transfer takes effect. The Chairman may schedule that date for a practical handover. Independently granted rights stay.
- **Emergency (decided):** the Secretary (or another eligible committee member) starts it.
  - It needs three approvals in total from distinct committee members; the Secretary counts if they approve.
  - The successor and the absent Chairman can't vote.
  - The third approval triggers the atomic switch.
  - The Vice-Chair can't take the role alone.
- **Super Admin fallback:** only when three approvals can't be reached, or when accounts are compromised. A reason is required, and the same atomic switch is used.
- The direct office fields on `clubs` are locked. They change only through these processes, and every step is permanently audited.

### Exactly one Chairman: how the switch is enforced
- **Data:**
  - `club_offices` holds Chairman rows with a start and end time. A partial unique index allows only one open Chairman row per club.
  - `clubs.chairman_member_id` is kept in sync by the same step, for older screens.
- **One transaction:** in a single database transaction, the club row is locked, the old row is closed (end = T), the new row is opened (start = T), the club field is updated, and two audit records are written (outgoing and incoming, same T). Any failure rolls back everything, so there's never zero or two Chairmen.
- **Authorisation:** "is Chairman" is read only from the open row at the moment of each action. The outgoing Chairman's next action after T is refused; the successor's is allowed.
- **Concurrency:** handovers, emergency switches and the Super Admin fallback all use the same function and lock. A second request fails cleanly.
- The Vice-Chair is a separate office and can coexist.
- Notices go to both people, the committee and the Super Admin (for awareness only, not approval).

### Initial setup vs ongoing changes
- **Initial setup (one time per club):** after members are imported or created, the setup helper picks the initial office bearers (Chairman, Vice-Chair, Secretary, Treasurer, Club Captain) from the member list and saves them in one step. No existing Chairman or Super Admin approval is needed.
- **Setup capability:**
  - Narrow: it can only set the initial offices and basic club setup, and it is held only by the setup helper (the person who claimed or created the club, or a Super Admin helping them).
  - Time-limited: it ends on the first successful save of a Chairman, or after the setup window (L9), whichever comes first.
  - Audited, and it can't be reused: once the club has an open Chairman row, the setup path is refused on the server.
- **On save:** the exactly-one-Chairman check runs, office templates apply, and the Temporary Chairman status (if any) ends.
- **From then on:** only the Chairman appoints or removes office bearers, and the succession and emergency rules apply.

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
- Each person's rights screen shows every capability with its source, e.g. "From role: Secretary", "Personal grant by Chairman 8 Oct", "Nominated by Treasurer", "Denied by Chairman 8 Oct: reason", "Self-granted by Chairman".

## 4. Default templates (confirmed list; editable per club)

| Template | Default content | Class |
|---|---|---|
| Club Manager | members view and edit, bookings, courts, events, visitors, group communications, settings view | O + S (Chairman) |
| Membership Officer | members view and edit, applications, invites | S |
| Competitions Coordinator | leagues, ladder, tournaments, results; delegate on | O |
| Court & Bookings Officer | courts, bookings, visitors, lights | O |
| Communications Officer | campaigns to members | S |
| Access Device Officer | access, devices, doors | S |
| Treasurer | `fin.*` view, initiate, approve and reconcile, except manual mandate authorise. **Never approves items they initiated** (person-level separation; D21) | F/X |
| Finance Viewer | `fin.overview.view`, `fin.bank.view`, `fin.reports.view` (read-only) | F |
| Billing Clerk | billing create and remind, fees view | F/X |
| Bar Manager | items, stock view, counting, counter access; delegate on routine counter access and counting. Receiving and other execution rights only by Chairman grant | O |
| Bar Staff | sell with own PIN, charge account (debit limits apply) | O |
| Stock Counter | stocktake count, stock view | O |
| Bar Controller | cost view, approvals, prices, refunds, PIN admin, devices, settings | S/X |
| Team Captain | league-scoped captain duties (unchanged) | O |

**Office defaults (D10):**

| Office | Default | Finance |
|---|---|---|
| Chairman | View of all club areas, members admin, appoint offices, grant permissions | **Finance read-only automatically.** May self-grant execution rights (audited); never approves own transactions |
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
- Nobody changes their own roles or offices. The only exception is the Chairman, who may self-grant execution rights (audited, badge, optional alerts). This never allows approving their own transactions.
- A change to payout bank details is audited, and the Treasurer and Chairman are notified (no waiting period).
- In tiny clubs, the Super Admin may act as the second approver on request, logged (D14).
### Audit chain (explicit design priority, ahead of intricate permission rules)
**1. Where every permission came from:** each grant record keeps:
- who granted it, to whom, and when;
- the scope (club, and e.g. one tournament or bar only);
- how it was given: role, office, direct grant, delegated, nominated plus Chairman-approved, self-granted, or migration;
- the parent grant it was delegated from;
- every later change, expiry or revocation (who, when, why).

Records are never overwritten; changes add new versions.

**2. Every significant action** (finance, bar and stock, member changes, bookings admin, tournaments, permission and office changes) logs:
- the actual actor and the device or counter PIN;
- the action, time and target;
- before and after values;
- **the exact grant that allowed it**, as a link to the record above.

**3. Traceable back to the source:** from any action you can follow the chain: action → the grant used → who granted it (and their grant) → up to the Chairman, Super Admin or migration that started it.

**4. Chairman activity view** (Permissions → Activity, club-scoped), simple and searchable:
- Search by person, action type, date range or target (member, transaction, item).
- "Who authorised this person?" shows the person's rights, each with its grant chain.
- "What did they do?" lists the person's actions, each with the right used.
- "Who did this?" works from any transaction, sale or member change.
- Export to CSV for committee meetings.
- Visible to the Chairman and Super Admin. Finance actions are also visible to finance viewers; others see only their own history.

**5. Basics:** records can't be edited or deleted. PINs and card data are never logged. Retention defaults to 7 years for finance, 3 years for everything else (open to change).

**6. Proportionality:** the audit chain carries the safety. Permissions stay simple and low-friction; independent approval is kept only for sensitive finance and stock actions.

## 9. Onboarding (both pathways)

**Activation is separate from data:** imported club rows, member rows and office names grant nothing.

**Pathway A: preloaded club**
1. The person picks the existing club. Creating a club is blocked when a close match exists.
2. Their identity is matched using the existing registration matching: SA ID, verified email, and phone with OTP. They are linked to their national person record and imported member row. No duplicate person or member is created, and no new verification is added.
3. **A member match is not the right to claim the club:**

| Situation | Outcome |
|---|---|
| Trusted match (SA ID, verified email, exact phone + name), club not activated, no other pending claim | Temporary Chairman at once. Anyone can report a wrong claim to the Super Admin |
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
  - (Removed for proportionality: no waiting period on bulk messages.)

## 10. "Club Books" → "Finance"
Visible text only: menus, titles, breadcrumbs, approval cards, help, emails and notices. URLs, keys and database names stay unchanged.

## 11. Rollout for existing clubs (no approval flood)
1. **Inventory per club:** every current right of every person, from role templates, custom keys, full admin, the admin role and office bearers.
2. **Mapping at activation (per club, per phase):**

| Legacy | Maps to | Re-approval |
|---|---|---|
| Treasurer / Finance role, `finance` key (explicitly assigned) | Treasurer template | None |
| `fees` key | Billing Clerk + Finance Viewer | None |
| `banking` key | Finance Viewer + bank import/reconcile | None |
| `bar` key | Bar Manager. Bar Controller rights only if explicitly assigned today | None |
| Explicit custom roles and custom keys | Preserved as equivalent capabilities | None |
| Chairman office | Chairman default (includes finance read-only) | None |
| Secretary / Club Captain / Vice-Chair office | That office's new default only. **Finance and bar rights that came only from the office are removed** | None |
| `role='admin'`, full admin flag, Full Admin role | **Not grandfathered.** Blanket rights end. The person keeps their explicit grants and office defaults. The Chairman can then grant what they need | None |
| Other keys | Matching O capabilities 1:1 | None |
| Platform moderator | Platform Support | — |

3. **Migration inventory and per-club impact preview.** Each person's rights are sorted into three groups:
   1. **Template rights:** from the office or role template defaults. Applied automatically, no approval.
   2. **Explicit custom or special grants:** club-created roles and personal keys. Kept. Any that contain sensitive finance or Bar & Shop execution are **flagged** for Chairman or owner confirmation in the preview. Legacy Full Admin is never translated into an explicit grant.
   3. **Incidental legacy rights to remove:** whatever came only from Full Admin, the admin role, or being an office bearer (e.g. Uitsig, where most office bearers have full finance today). Removed at activation.
   - Each person sees a preview before activation. The owner approves the club's report.
   - Lockouts are possible and accepted for group 3. The Chairman and Super Admin can correct grants right after activation.
   - Activation creates no pending requests. Every removal is audited.
   - Rollback is per club (gate OFF).
4. **Prospective only:** after activation, the nomination and approval workflow applies only to new sensitive or execution grants. The Chairman and Super Admin can grant directly at any time, audited.

### Pilot: Riverside only, then owner-approved waves

**Club gate:**
- Each club has a setting, `club_permission_settings.new_permissions_enabled` (default **OFF**). It is set only by the Super Admin.
- Shared checks use one wrapper: if the club's gate is OFF, it returns exactly today's legacy answer (the existing functions, unchanged). If ON, it uses `has_cap()` and the new workflows.
- The existing functions (`is_club_admin`, `is_club_admin_or_permitted`, `bar_staff_can_serve`, …) are **not edited** during the pilot. The wrapper sits beside them and is adopted area by area.
- All schema is additive (new tables and columns with defaults) and invisible to clubs with the gate OFF.

**Pilot steps:**
1. **Dry run for all clubs:** a read-only comparison of today's effective rights against the mapped new model, per person per club. Riverside is reviewed in detail; a summary is produced for all other clubs.
2. **Riverside setup:**
   - Inventory, mapping and an impact report showing kept rights and intentional reductions.
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
5. **Regression for non-Riverside clubs:** an automated, read-only same-answer comparison on every check for every other club, including Nelspruit. In Phase 1, no test rows are written in Nelspruit or any other club. Flow tests (booking, bar sale, EFT approval, tournament entry) run only on Riverside test accounts.

**Instant disable:**
- Setting Riverside's gate OFF returns it to legacy answers immediately. No data is deleted.
- New-model records (grants, nominations, audit) stay stored but inactive.
- Real transactions made during the pilot are normal records, valid under either model.

**Pilot acceptance criteria (all needed before any wider wave):**
- Zero **unintended** refusals for Riverside's real users over at least 2 weeks. Intentional reductions in the impact report don't count as failures.
- Every test scenario in section 13 passes in Riverside.
- Non-Riverside comparison shows zero differences.
- Zero pending approval requests created by the migration.
- Audit records are complete for every pilot action.
- The gate OFF/ON cycle has been tested once with no data change.
- Approval notices delivered, with reminders at 24 hours and then daily.

**Strict sequential rollout (owner decision, replaces the earlier wave idea):**

| Phase | Clubs with gate ON | Starts only when |
|---|---|---|
| 1 | **Riverside only.** Every other club, including Nelspruit, unchanged | Owner approves the build |
| 2 | **Nelspruit** (Riverside stays on) | The owner has tested Riverside and **explicitly approved** Phase 2 |
| 3 | Other clubs, gradually, in small named batches | Nelspruit confirms it is satisfied **and** the owner explicitly approves each batch |

- **No automatic promotion.** Nothing moves to the next phase or batch without the owner's written go-ahead.
- **Phase 2 preparation for Nelspruit:**
  - Advance notice to Nelspruit's committee. The timing and channel are not agreed (D20); 7 days is a suggestion only.
  - A **permission preview**: each person sees what they will be able to do, with the source of each right, and can raise a query before the switch.
  - A dry-run difference report for Nelspruit reviewed by the owner.
- **Phase 3 batches:** each gets a dry-run report, notice and preview, and the same acceptance criteria.
- **Activation and rollback are per club:** turning one club's gate OFF never affects another.

**Stages:**
1. **Add only.** New catalogue, assignments, overrides, append-only events, `legacy_mode=ON` per club, and `has_cap()`. While legacy mode is on, `has_cap()` returns the old answer.
2. **Early safety fix** (separate approval): lock the office fields to the Chairman flows. Nobody loses access.
3. **Shadow mode.** Each area's checks move to `has_cap()` but still return the legacy answer, while logging what the new model would decide. A per-club difference report follows.
4. **Inventory, mapping and impact report** written for the club in the current phase only. Riverside first; Nelspruit only in Phase 2; others only in Phase 3.
5. **Per-club switch:** gate ON for that club. The impact report must show no unintended loss; intentional reductions must be owner-approved.
6. **Retire labels in switched clubs:** hide "Full Admin", "Admin" and "Club Admin". New clubs get the new templates. Office bearers stop auto-receiving admin.
7. **Final cleanup** (separate approval): remove implicit paths and mark legacy columns deprecated (kept, not dropped).

## 12. Migration safety and rollback checklist
- [ ] Each stage is approved separately. No stage combines schema and behaviour change.
- [ ] Stage 1 is additive only: no drops, renames or type changes. Every new table has grants, RLS and policies in the same migration.
- [ ] Snapshot of effective rights per person per club taken before each stage, and stored.
- [ ] With legacy ON, every check gives the same answer as before, by automated comparison per club.
- [ ] Impact report per club, reviewed before activation:
  - every right kept (explicit grants, custom roles, office defaults);
  - every **intentional reduction** (blanket admin, full admin, office-bearer finance);
  - any **unintended** loss, which must be zero; fix it before activation.
- [ ] No pending approval requests are created by the migration (count = 0 verified).
- [ ] Bookings, doors and lights, payment callbacks, marker, tills, notifications and automated jobs are tested per area before switching that area.
- [ ] Pilot gate verified: only Riverside has `new_permissions_enabled`. Every other club passes the same-answer comparison before and after each pilot deploy.
- [ ] Riverside members, bookings, finance and stock records untouched by the pilot (D18). Test accounts and synthetic rows are labelled and removable.
- [ ] **Rollback:**
  - Set `legacy_mode` back ON per club, effective immediately.
  - Legacy flags and keys are never deleted during 30 days after the switch.
  - The early safety fix can be undone by restoring the previous update rule.
- [ ] Audit trail verified: grants, intentional reductions and switch events are all logged.
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

## 14. Decisions: already decided vs open

### Already decided — no need to answer again
| Topic | Decision (prefilled from your messages) |
|---|---|
| Chairman finance | Finance **read-only** automatically. No execution by default. May self-grant execution (prominently audited). Never approves own transactions |
| Other office bearers' finance | Vice-Chair, Secretary and committee members get no finance view by default. The Treasurer gets the defined finance functions |
| Who grants finance and sensitive rights | Chairman (own club) and Super Admin; others may only nominate |
| Office bearers | The Chairman alone appoints and removes them. Several roles per person are allowed |
| Chairman succession | The current Chairman appoints the successor directly. Exactly one Chairman, with an atomic switch |
| Emergency succession | The Secretary may start it. **Three approvals in total, including the Secretary if they approve**, from distinct committee members. The successor and the absent Chairman can't vote. Super Admin fallback (confirmed 13:30) |
| Club Captain delegation | Built in; no toggle; operational tournament and event rights only |
| Bar Manager | Assigns basic counter duties and PIN use directly. Sensitive execution and PIN create/reset need the Chairman's approval; the Bar Manager may nominate |
| Counter PINs | Individual per operator, never shared; separate from member OTP |
| Stocktake / adjustments | A second, independent approver |
| Secretary | View/edit members, add, remove from club, change status. No finance, Bar & Shop or credentials |
| Migration | Template defaults are automatic. Genuine custom grants are kept. Blanket Full Admin/admin and office-bearer finance are **removed**. No re-approval flood. No zero-lockout promise |
| Rollout | Strict sequence: Riverside → (owner approval) → Nelspruit → (Nelspruit satisfied + owner approval) → other clubs. Per-club gate and rollback |
| Approval notices | In-app + WhatsApp, reminders at 24 hours then daily, no escalation |
| Onboarding | Preloaded and new club pathways. Setup helper picks the initial office bearers. Temporary Chairman where none is chosen |
| Super Admin meaning (old D3) | Platform Super Admin (`user_roles` admin) only. Proposed default, treated as decided unless you object |

### Open — blocks Phase 1 (Riverside) build
| # | Question | Proposed default |
|---|---|---|
| P1 | Riverside live-data exception: the pilot changes access checks and adds test accounts, roles and audit rows; it doesn't change members, bookings, finance or stock records | Approve, with labelled test accounts removed afterwards |
| P2 | Riverside: real office bearers on the new model at activation, or test accounts first? | Test accounts first for 1 week, then real users |
| P3 | Treasurer self-approval: a second finance holder or the Chairman must approve the Treasurer's own items | Yes; Super Admin as second approver only in tiny clubs |
| P4 | `bar.pin.manage` default holder | The Bar Manager, after the Chairman grants it; first PIN via a one-time setup code |
| P5 | Early office-field lock as a stand-alone fix before the pilot | Yes |

### Open — needed before Phase 2 (Nelspruit)
| # | Question | Proposed default |
|---|---|---|
| N1 | Nelspruit notice lead time and channel (not yet agreed) | 7 days, in-app + WhatsApp, with a permission preview |
| N3 | Emergency succession (plan D7): which committee roles count | Secretary, Vice-Chair, Treasurer, Club Captain. A short reason; no waiting period or extra evidence |
| N4 | Thresholds for discount, void, refund and journal second approval | R100 discount/void per sale; any refund; journals over R5,000 |

### Open — can wait (not blocking)
| # | Question | Proposed default |
|---|---|---|
| L1 | Temporary grants and denies with an expiry date | Allowed |
| L2 | Built-in delegation for Court & Bookings and Communications Officers | Yes, operational only |
| L3 | Vice-Chair excludes granting and sensitive rights; Secretary "constitution" = club rules and documents | Yes |
| L4 | National ID / date of birth visibility | ID masked, full view logged; DOB as age only |
| L5 | Manual mandate "Mark authorised" | Keep as Super Admin-only key |
| L6 | Tiny-club second approver | Super Admin on request |
| L7 | Build suppliers, purchase orders and till cash-up | Later, after the pilot |
| L8 | Family exclusions | Both account delegations and family groups |
| L9 | Onboarding: automatic on a trusted match; setup window length; whether to show a simple "club claimed by X" notice | Yes; 30 days; yes, no waiting period |

### Old to new numbering
- **Old D1/D2:** decided (Chairman read-only finance + self-grant).
- **D3:** decided (Super Admin = platform only).
- **D4:** N4
- **D5:** L7
- **D6:** N2
- **D7:** N3
- **D8:** L1
- **D9:** Bar Manager part decided; the rest is L2.
- **D10:** L3
- **D11:** L4
- **D12:** L5
- **D13:** P4
- **D14:** L6, and also P3.
- **D15:** L9
- **D16:** P5
- **D17:** L8
- **D18:** P1
- **D19:** P2
- **D20:** N1
- **D21:** P3

## Technical details
- **Audited:** `is_club_admin` (platform admin/moderator, `role='admin'`, `is_full_admin`, office bearers), `is_club_admin_or_permitted`, `is_platform_admin`, `has_role`, `bar_staff_can_serve`, `is_club_captain`; `club_member_permissions`, `club_permission_roles`; `create_default_finance_role`, `auto_assign_officer_roles`; `clubs` UPDATE policy; `club_members` policies (admin/self/`members` key update; column grants exclude id_number, address, phone, email); `member_bar_pins` (hash, attempts, lock); `bar_counter_sessions`; `club_claim_requests` + `approve_club_claim`; `_shared/person-match.ts`, `useDuplicateGuard`, `account-recovery`; frontend `use-club-permissions.ts`, `use-club-billing.ts`, `use-door-control.ts`.
- **Proposed objects:**
  - Catalogue and assignments: `capability_catalogue(key, area, class O/S/F/X/G, delegable)`, `member_role_assignments`, `member_capability_overrides(effect grant|deny, can_delegate, source role|personal|delegated|nominated|carry_over, granted_by, delegated_from, reason, expires_at)`, `effective_capabilities` view, `has_cap()`, `can_grant()`.
  - Workflows: `capability_nominations` (status, reminders), `club_offices` (unique open Chairman per club), `chairman_handovers`, `chairman_emergency_requests` + `_votes` (unique voter per request).
  - Audit and switch-over: `permission_events` (append-only), `club_permission_settings(legacy_mode, thresholds)`, `permission_shadow_log`, `permission_inventory_snapshots`.
- Approval notices use the existing notifications and club WhatsApp sending (respects club enablement and opt-outs).
- `mandate_notification_recipients` moves to `has_cap(...,'fin.mandates.view')`. The EFT attribution migration stays cancelled.
