# Club-wide roles and permissions redesign (including Finance and Bar & Shop) — for owner approval

Design only. No code, migrations, access changes or publishing. Production stays exactly as it is until each phase is separately approved.

## 1. Owner direction captured
1. Retire the overlapping labels "Full Admin", "Admin" and "Club Admin", and every implicit all-access path. Keep customisable named roles built from explicit capabilities.
2. Keep the platform Super Admin clearly separate from club-scoped roles.
3. Audit first, map carefully and migrate in stages with rollback. Don't just rename or remove flags, because many flows depend on them.
4. Finance, including read-only bank and ledger, is explicit per person. Read-only never implies any transaction right.
5. Only the club's Chairman (own club) or the platform Super Admin grants finance and sensitive rights. Grant authority gives no operating rights by itself. **Latest owner decision (overrides the earlier rule):** the Chairman **may grant themselves** finance and other permissions in their own club. This is a deliberate policy exception, permanently audited, clearly marked as self-granted, with optional alerts and Super Admin oversight (section 3c). Nobody else may self-grant. **Self-approving transactions stays prohibited** for everyone, including the Chairman.
6. Controlled delegation of operational Bar & Shop roles within the club. Nothing broader than the delegator's own scope, no cross-club grants, no self-change.
7. Stocktake discrepancies and stock adjustments need a second person to approve. No self-approval.
8. Counter PIN create/reset/disable is separate from using a PIN. PINs are never shown, and every change is audited.
9. Mandate creation vs provider authorisation vs collection stay distinct. Activation is provider-verified.
10. Rename "Club Books" to "Finance" in everything users see.

## 2. Audit: how access works today (confirmed from code and database)

### Access paths
| Path | Stored where | What it grants today |
|---|---|---|
| Platform admin | `user_roles.role='admin'` (1 user) | Everything in every club (`is_club_admin`, `is_club_admin_or_permitted`, `has_role`) |
| Platform moderator | `user_roles.role='moderator'` (0 users now) | Same as platform admin through `is_club_admin` / `is_club_admin_or_permitted` / `is_platform_admin` |
| Federation super admin / association admin | `organisation_admins` (1 / 11) | Federation scope only; not club checks |
| Club member role "admin" | `club_members.role='admin'` (29 members) | Full club admin (`is_club_admin`) |
| Full admin flag | `club_member_permissions.is_full_admin` (6 people) or role `is_full_admin` (864 role templates) | Full club admin |
| **Office bearers** | `clubs.chairman_member_id`, `secretary_member_id`, `club_captain_member_id` | **Full club admin via `is_club_admin`**, including all finance |
| Permission keys | `custom_permissions` or role `permissions` | Per area: access, affiliation, banking, bar, bookings_unlimited(_non_peak), champs, club, communications, courts, devices, events, federation, fees, finance, ladder, leagues, members, ops_booking, settings, users, visitors |
| Captain | `club_members.role='captain'` (35) | League-scoped only (`is_club_captain`) |
| Bar staff | `bar_staff_can_serve` | Till, plus counter PIN and device management today |

### Role templates
Auto-created in nearly every one of 799 clubs: Full Admin, Chairman, Treasurer, Secretary, Captain, Club Captain and Finance (`fees, banking, members, bar, finance`).

Assigned in practice: Full Admin 9, Club Captain 8, Chairman 7, Secretary 5, Treasurer 4, Finance 2, Bar 2, a few custom roles, and 12 custom-only grants.

Only 8 clubs have a Chairman recorded.

### Where checks live
| Check | Database functions | Access rules | Notes |
|---|---|---|---|
| `is_club_admin` | 71 | 202 | Bypasses all keys |
| `is_club_admin_or_permitted` | 46 | 91 | Admin always passes |
| `has_role` | 46 | 132 | |
| `is_platform_admin` | 29 | 129 | Includes moderators |
| `bar_staff_can_serve` | 15 | 1 | |

There are also about 25 server functions and about 40 app files that check admin/full-admin directly. For example, the screens treat full admin as finance (`use-club-billing.ts:153`, `use-door-control.ts:115`).

### Escalation risks found
- `clubs` UPDATE is allowed for `is_club_admin_or_permitted(...,'club')`. Any club admin, or any holder of the `club` key, can set themselves as Chairman, Secretary or Club Captain, and so become a full club admin.
- Office bearers silently get full finance.
- Mandate "Mark authorised", journal reverse/delete and other money actions check only `is_club_admin`.
- `post_journal` has no caller check.
- Any bar staff can manage counter PINs.

### Who has full finance today
- The platform admin, and any future moderator.
- All 29 `role='admin'` members.
- The 6 full-admin individuals.
- Everyone holding a Full Admin role (9).
- Chairman, Secretary and Club Captain office bearers in the 8 clubs that have them set.
- Anyone holding `finance` (Treasurer and Finance roles), plus partial access through `fees`/`banking`.

## 3. Target model

### Scopes (never mixed)
- **Platform:** Platform Super Admin (app-wide, logged support override), Platform Support (no club data by default; temporary, logged, club-approved access).
- **Federation:** Federation and Association admins, unchanged and never club rights.
- **Club:** named roles made of capabilities, held per person per club.

### Building blocks
- **Capability:** `area.action`, e.g. `members.edit`, `fin.bank.view`, `bar.stocktake.count`. Every current key splits into view and action capabilities (section 5).
- **Role:** a club-editable named bundle of capabilities. Templates are provided, but templates never bypass checks.
- **Office:** Chairman, Secretary, Club Captain and Treasurer are positions, recorded and displayed. **Holding an office gives no rights by itself.** Rights come only from the roles given to that person.
- **Delegation class** on every capability:
  - O operational: delegable if the holder has the delegate flag.
  - S sensitive: Chairman or Super Admin only.
  - F finance: Chairman or Super Admin only.
  - G governance (permission management, office appointments): derived, never granted as a key.

### Who can grant what
| Capability class | Granted by | Delegable |
|---|---|---|
| F Finance (incl. read-only bank/ledger) | Chairman (own club), Super Admin | Never |
| S Sensitive (members' private data, access/doors, devices, settings, communications to all, bar cost/approvals/PINs/settings, permission audit) | Chairman, Super Admin | Never (unless owner changes, see D3) |
| O Operational (bookings ops, events, leagues, ladder, champs ops, visitors, bar selling/counting/receiving) | Chairman, Super Admin, or a holder with the delegate flag for that exact capability | Yes, same club, same or narrower |
| Chairman's own F/S rights | The Chairman (self-grant exception, section 3c) or the Super Admin | - |

Delegation rules:
- You can only pass on capabilities you hold with the delegate flag.
- Recipients get perform-only unless the Chairman sets the delegate flag.
- Never cross-club, never to yourself, never to change your own roles.
- Revoking a delegator flags (not auto-removes) the grants they made, for Chairman review.

### Chairman succession (owner decision: Chairman-to-Chairman, no Super Admin step)
- **Only the current, active Chairman of that club can start a handover.** A server check refuses anyone else, including admins, office bearers and other clubs. The direct `clubs.chairman_member_id` edit is blocked by a guard; the only way to change it is the handover action.
- **Handover steps:**
  1. The Chairman picks a successor: an active member of the same club with a login. They re-authenticate (password or OTP), give a reason, and choose an effective time: now, or a set date and time.
  2. The successor is notified and **accepts** (authenticated). Proposed: acceptance is required, so authority never goes to someone who doesn't know about it (D22). The outgoing Chairman can cancel until it takes effect.
  3. At the effective time, one atomic step closes the old Chairman office and opens the new one.
- **Never two Chairmen:** one open Chairman office per club, enforced by a database uniqueness rule. Only one pending handover per club; a new one replaces the old.
- **What transfers:** Chairman authority (appointing offices, granting permissions). Rights the outgoing Chairman held personally (including any finance) do **not** transfer, and stay until the new Chairman reviews them. Grants made by the outgoing Chairman stay valid.
- **Audit:** start, accept, cancel and effective handover are all recorded (who, successor, club, reason, times, re-authentication method). Office bearers get an in-app notice. The Super Admin can see the record but takes no part.
- The Chairman cannot appoint themselves (they already hold the office) or remove themselves without naming a successor.
### Club onboarding: two pathways, both ending in a Temporary Chairman

**Today (confirmed):**
- Listed clubs are claimed through a claim request (`club_claim_requests`). The platform admin approves it (`approve_club_claim`). Approval makes the requester a **club admin** and fills the **Club Captain** office if empty, not the Chairman.
- After that, any club admin can set the Chairman on the Club Info screen. This is the escalation route already noted.
- How a brand-new club's creator is set up at registration was not traced in detail. It is assumed to make them a club admin, and must be confirmed before building.

**Activation is separate from existing data.** A club row, imported member rows (e.g. from SportyHQ), or office fields copied from an import do **not** make a club "activated". A club is activated only when a verified person completes a claim (Pathway A) or creation (Pathway B). Imported office-bearer names grant nothing.

**Pathway A: existing preloaded club (most South African clubs)**
1. **Find, don't create.** The person searches for and picks their club. Creating a new club is blocked when a close match exists (name, town, association), so no duplicate club is created.
2. **Identity first:**
   - Verified email and phone.
   - The duplicate-person check links them to their existing **national person** record and their **imported club member row**, if one matches by SA ID, email or phone, instead of creating a new member.
3. **Proof of link to the club** (one strong item, or two weaker ones):
   - **Strong:**
     - their verified email or phone matches the club's imported contact or an imported office bearer;
     - the affiliated association confirms them;
     - a Super Admin review.
   - **Weaker:**
     - they match an imported member of that club;
     - an email on the club's domain;
     - a short reason given with the claim.
4. **Activation:** they become **Temporary Chairman (setup)** of that club. All imported members, history and records stay untouched. Imported members stay unlinked until they activate their own accounts.
5. **Takeover protection, which matters most here:**
   - One pending claim per club.
   - A public "club claimed" notice on the club page for 7 days.
   - Imported office bearers and the association are notified, where contact details exist.
   - Anyone can dispute within that window. A dispute freezes grant authority and sensitive actions until it is resolved.
   - Weaker evidence on its own means a quick review before activation (D24).

**Pathway B: genuinely new club (not in the database, including international clubs)**
1. The duplicate-club search runs first (worldwide). If no match is found, the person creates the club with country, town and contact details.
2. Verified email and phone. The duplicate-person check runs (national person or an equivalent record for non-SA people).
3. They become **Temporary Chairman (setup)** straight away. No association is needed. If they later link to an association, the association can see them.

**In both pathways:**
- A clear notice at activation, and a permanent "Temporary Chairman" badge with reminders: "You are Temporary Chairman only to set the club up. Hand over to your club's real Chairman once known."
- Handover to the real Chairman uses the normal handover: atomic, exactly one Chairman, temporary rights end immediately. After that, the normal permission model applies.
- **Audit:** claim or creation, the evidence, matches used, any dispute, and the handover are permanently recorded.
- **Recovery:** a wrongful claim is reversed by the Super Admin (with a reason and evidence). This removes the temporary Chairman, keeps all club data, and logs the change. The committee emergency process applies once real office bearers exist.
- **Proposed limits while temporary (D24):**
  - No finance self-grants (setup screens only).
  - No changes to payout bank details without a Super Admin check.
  - No member deletes, merges or bulk export.
  - No payment gateway credentials.
  - No bulk messaging to imported members during the dispute window.
  - Normal setup stays open: courts, bookings, fees, inviting members and appointing offices.

### Other office bearers (owner decision)
- **Only the Chairman** (own club) appoints, replaces or removes the Vice-Chair, Secretary, Treasurer, Club Captain and any other office. The Super Admin is not involved. A server check refuses anyone else, and the direct edit of the `clubs` office fields is blocked.
- **On appointment**, the office's default template applies, plus any person-specific grants or denies the Chairman separately authorises. Finance capabilities follow the finance grant rule.
- **On removal or replacement:**
  - Template-derived rights end immediately (next action on the server; screens refresh within seconds).
  - Club membership is untouched.
  - Personal grants tied to that office end with it. Unrelated personal grants stay, but are listed for the Chairman to keep or revoke on the removal screen.
  - Grants the person delegated to others are flagged for review (D15).
- Each appointment, replacement and removal is club-scoped and audited (Chairman, person, office, previous holder, reason, time). The person is notified.
- The Chairman office itself changes only through the handover or emergency process.
- **Super Admin oversight (not routine):** the Super Admin can freeze grants for a club or revoke a grant for a security incident. This needs a reason, is logged, and notifies office bearers.
- **Emergency replacement by the committee (owner decision):** if the Chairman resigns, disappears, is incapacitated or can't start a handover:
  - The Secretary (or another eligible committee member, e.g. the Vice-Chair) **starts** an emergency replacement, naming the proposed successor, a reason and evidence.
  - It needs **three approvals in total** from three **distinct** eligible committee members of that club. The Secretary's own approval counts as one of the three, if they approve.
  - Each person counts once. The proposed successor **cannot approve** their own appointment. The absent Chairman is not counted.
  - Each approval is authenticated (re-auth) and audited. The request expires after a set time (D23).
  - On the third approval, the same single atomic step closes the old office and opens the new one.
  - Nobody, including the Vice-Chair, can take the role alone.
- **Super Admin fallback (exceptional):** if the committee can't reach three approvals (e.g. too few eligible members), the **platform Super Admin may appoint a new Chairman**. This is the only Super Admin role in succession.
  - The Super Admin chooses an active member of that club with a login. A reason and evidence (e.g. resignation letter or committee minutes) are required. The Super Admin re-authenticates.
  - The same single atomic step closes the old office and opens the new one, so there is exactly one Chairman per club at all times. Any pending handover is cancelled.
  - The recovery record (Super Admin, club, old and new Chairman, reason, evidence, request link, time) can't be edited or deleted. Office bearers and the outgoing Chairman, where reachable, are notified.
  - Super Admin recovery is checked against the club; the Super Admin's own club rights don't change.

## 3a. Member data and the Secretary (owner clarification)

**Default:** the Secretary template can **view and update ordinary member profile and contact information with no extra restrictions**. This is routine membership administration and is not treated as "sensitive" for gating.

### Current behaviour (confirmed)
- Member edits are allowed for: club admins (`is_club_admin`, which includes office bearers such as the Secretary when recorded on the club); the member themselves (not their own role); and holders of the `members` key (but not on admin members).
- Today's Secretary role template holds almost every key, including finance and bar. Under the target model it would hold membership rights only.
- Signed-in users have no direct table read on `club_members`. The ID number, address, phone and email columns are not readable directly. Staff screens get them through server functions, which are not yet listed one by one. The fellow-member read rule covers only the columns that are readable.
- National ID is also kept in the restricted `people_private` record. Date of birth is private on the national person record, and only age or age group is shown.
- The member list can be exported (`MembersTab.tsx`).

### Field groups
| Group | Fields | Secretary default | Capability |
|---|---|---|---|
| Ordinary profile and contact | name, email, phone, address, gender, avatar, member number, occupation, skills, volunteer, WhatsApp/SMS opt-outs, home club | **View + edit** | members.profile.view / .edit |
| Membership administration | status, fee category, joined, applications (approve/decline), pending captain claim, league-only flag | View + edit + approve applications | members.admin |
| Competition data | skill level, ladder/ranking, league flags | View; edit stays with competition roles | ladder.*, leagues.* |
| **Higher risk — national ID** | `id_number`, `people_private` | Listed separately (see options) | members.id.view / .edit |
| **Higher risk — date of birth** | DOB (national record; only age shown today) | Listed separately | members.dob.view |
| **Higher risk — finance and payments** | balances, billing exemption, mandates, payments, suspension amounts | None by default (Finance) | fin.* |
| **Higher risk — sign-in and identity** | login link (`user_id`), password, recovery, GoBook link, face data and consent | Never edit credentials. Linking or unlinking a login, and face data, are separate | members.login.link, access.face |
| Suspension | suspension status/reason/dates | Proposed: Membership admin view; changing it is a separate capability | members.suspend |
| **Bulk export and sharing** | CSV/Excel of the member list, bulk message lists | Separate function | members.export |

### Options for the higher-risk items (owner chooses; nothing is imposed silently)
- ID number: (a) Secretary sees and edits it, as today when the Secretary is an admin; (b) shown masked, with full view logged; (c) a separate capability. Proposed: (b).
- Date of birth: keep today's rule (age only) unless the owner wants the Secretary to see the full date.
- Bulk export: a separate capability, every export logged (who, when, row count, columns), ID and DOB excluded unless chosen. Proposed: Secretary holds it by default, with logging.
- Credentials: nobody at club level sees or sets passwords. Login linking and face data stay separate capabilities.

## 3b. Per-person overrides (owner clarification)

Role templates, including office-bearer templates such as Secretary, are **starting points**. The Chairman can adjust one person without touching the template or anyone else holding that role.

```text
effective rights = rights from their roles
                 + individual grants (authorised)
                 - individual denies   (deny always wins)
```

- **Individual deny:** removes one capability from one person even though their role has it. The template and other holders are unchanged.
- **Individual grant:** adds one capability to one person, within the normal grant rules (finance and sensitive rights only by the Chairman or Super Admin; operational rights by the Chairman, Super Admin, or a holder with the delegate flag).
- **Template changes:** apply to everyone holding the role, but never undo a personal deny. A personal grant stays until removed.
- **Who may override:** the Chairman (own club) and the Super Admin. For an operational capability, a delegator may revoke only what they themselves granted.
- **No self-changes:** nobody can add, deny or remove their own capabilities. The Chairman may be an exception, depending on D20 (section 3c). The Chairman office changes only through the handover by the current Chairman.

## 3c. Chairman self-grant exception (deliberate policy choice)

**What is allowed:** the active Chairman may grant or remove their own capabilities, including finance and sensitive Bar & Shop rights, in their own club only.

**What stays prohibited, for everyone including the Chairman:**
- Self-approving transactions: approving your own EFT or deposit, your own payment or refund, your own or family account changes, stock adjustments or stocktake discrepancies you requested or counted, invoices you captured, journals you created, or your own mandate.
- Appointing yourself Chairman, or changing the Chairman office.
- Granting yourself anything in another club.

**Two different things:**
- **Permission self-grant** = "I may now do X". Allowed for the Chairman only.
- **Transaction self-approval** = "I approve my own X". Never allowed.

**Safeguards:**
- **Permanent audit:** every self-grant or self-removal records the Chairman, capability, club, reason (required) and time. It can't be edited or deleted.
- **Clear display:** self-granted rights show a "Self-granted by Chairman" badge on the Chairman's permissions page and in the club's permission list, visible to the Super Admin and to anyone holding permission-view rights.
- **Alerts (optional, per club, default ON):** an in-app notice to the Treasurer (or all `fin.audit.view` holders) and to the Super Admin whenever the Chairman self-grants a finance or sensitive capability.
- **Super Admin oversight:** a platform report of all Chairman self-grants. The Super Admin can revoke any of them (with a reason), or freeze the club's grants.
- **Cooling-off (optional, see D19):** a finance self-grant takes effect after a set delay (e.g. 24 hours) unless the Super Admin confirms sooner.

**Risks (for the record):**
- A single person can hold full finance in a club with no second sign-off on the grant itself.
- In a small club where the Chairman is also the only active finance person, the no-self-approval rule may block approvals. The fallback is the Super Admin as second approver.
- A compromised Chairman account could grant itself finance. Alerts, the cooling-off delay and Super Admin revoke limit this.
- Audit and alerts are detective controls, not preventive ones.
- **Immediate effect:**
  - The server checks the effective rights on every action, so a deny applies to the next action straight away.
  - Open screens refresh the person's rights within seconds through a live update, plus a re-check on every save.
  - Device sessions such as counter PINs are re-checked at each use.
- **Clear display:** in Permissions → Person, each capability shows its source ("From role: Secretary", "Personal grant by Chairman 8 Oct", "Denied personally by Chairman 8 Oct: reason"). Overrides are highlighted. Role pages show "3 holders, 1 with personal changes".
- **Audit:** every grant, deny, removal and expiry records who, for whom, which capability, club, reason and time. The reason is required.
- **Rights passed on by a revoked person:** when someone loses a capability they had delegated, the grants they made are listed for the Chairman. Proposed: those grants keep working until reviewed but are flagged; the Chairman can then confirm or revoke them (see D15). Finance and sensitive rights are never delegated, so they are never affected this way.
- **Legacy mode:** overrides are recorded but only take effect when the club switches legacy mode off. They show in the shadow report beforehand.

## 3d. Office-bearer templates: what they carry today vs proposed defaults

The office-bearer templates are kept as configurable defaults for new clubs. Below is what each carries today (confirmed across about 800 clubs), and the proposed minimal default.

| Template | Today's keys (live) | Proposed default |
|---|---|---|
| Chairman | access, affiliation, banking, bar, bookings_unlimited(+non_peak), champs, club, communications, courts, devices, events, federation, fees, **finance**, ladder, leagues, members, ops_booking, settings, users, visitors | View all non-finance areas; members.profile.view/edit; members.admin; appoint offices; grant/revoke permissions (own club). **No finance or sensitive Bar & Shop** unless granted (D20) |
| Secretary | access, **banking**, **bar**, champs, club, courts, **fees**, **finance**, ladder, leagues, members, settings, users, visitors | See below. **No finance, Bar & Shop, credentials or cross-club** |
| Treasurer | **banking, bar, fees, finance**, members | Treasurer finance template (granted by the Chairman or Super Admin); members.profile.view (names and contact only) |
| Club Captain | access, **banking**, **bar**, champs, club, courts, **fees**, **finance**, ladder, leagues, members, settings, users, visitors | Competitions Coordinator + events + court bookings; members.profile.view. No finance |
| Vice-Chair | (no template exists today) | New: operational club areas except finance (D17); members.profile.view |

Today, Secretary and Club Captain both get full finance and bar rights from their templates. The proposal removes these. The removal only happens in the staged switch-over, per club, after review.

**Secretary default (owner approved):**
- View and edit ordinary member information.
- **Add members** (with the duplicate-person check).
- **Change membership status** (active, suspended, resigned), with a required reason and audit.
- **Remove members from the club**, with these safeguards:
  - Removal ends only this club's membership: the club member row is marked resigned/removed. It **never deletes** the national person record, their other club memberships, or history (matches, results, payments, ledger, bar tabs).
  - A confirmation shows the member, any balance owing, and active mandates or registrations. Typing the member's name is required for a member with a balance.
  - Audit records who, when, reason and the previous status. The removal can be undone by the Chairman or Secretary.
- Membership applications: approve or decline. Invite and activation links: send.

**Member-data functions (least privilege, club-scoped):**

| Function | Capability | Secretary | Chairman | Others |
|---|---|---|---|---|
| View names and contact | members.profile.view | Yes | Yes | By role |
| View DOB / SA ID | members.id.view, members.dob.view | Per section 3a option | Per section 3a option | No |
| Edit records | members.profile.edit | Yes | Yes | No |
| Add / remove / status | members.admin | Yes | Yes | No |
| Export lists | members.export | Yes, logged | Yes, logged | No |
| Communications to members | comms.send | Yes | Yes | Communications Officer |
| Invite / activation | members.invite | Yes | Yes | No |
| Assign roles | perm.manage | No | Yes | No |
| Merge duplicates | members.merge | No (proposed) | Yes | Super Admin |
| Delete person record | — | Never at club level | Never | Super Admin only (POPIA requests) |
| View member-data audit | members.audit.view | Yes | Yes | No |

## 4. Default role templates (renamed, editable, none implicit)
| Template | Content (summary) | Class |
|---|---|---|
| Club Manager | members view/edit, bookings and courts ops, events, visitors, communications to own groups, settings view | O + some S (Chairman grants) |
| Membership Officer | members view/edit/approve applications, onboarding comms | S |
| Competitions Coordinator | leagues, ladder, champs/tournaments ops, results | O |
| Court & Bookings Officer | courts, bookings ops, visitors, lights | O |
| Communications Officer | communications campaigns | S |
| Access & Devices Officer | access, devices, doors (no hardware in tests) | S |
| Treasurer | all `fin.*` except manual mandate authorise | F |
| Finance Viewer / Management read-only | `fin.overview.view`, `fin.bank.view`, `fin.reports.view` | F |
| Billing Clerk, Payments Approver, Bookkeeper | see section 6 | F |
| Bar Manager | operational bar keys with delegate flag | O |
| Bar Staff | sell, charge account, stock view | O |
| Stock Counter | stocktake count, stock view | O |
| Bar Controller | cost view, approvals, prices, refunds, PINs, devices, settings | S |
| Team Captain | league-scoped captain duties (unchanged) | O |

"Full Admin" is not offered for new grants. During the transition it is shown as **"Legacy all-access (being retired)"**.

The owner confirmed the template list above.

### Office-bearer default templates (owner defaults, editable per club)
Offices are positions. Each office gets a **default role template** when someone is appointed. The template grants rights; the office itself grants nothing.

| Office | Default template content | Finance |
|---|---|---|
| Chairman | Oversight: view of all non-finance areas; appoint offices; grant/revoke permissions (own club) | **None automatic.** The Chairman may self-grant (section 3c) or receive from the Super Admin. See D16 |
| Vice-Chair | Broad club functions: Club Manager + Membership + Competitions + Court & Bookings + Communications (operational) | None. See D17 |
| Secretary | Members and users (profile/contact view and edit, applications, login linking), club rules and constitution documents, communications to members | None |
| Club Captain | Tournaments and events: Competitions Coordinator + events + Court & Bookings (operational) | None |
| Treasurer | Treasurer template: most finance tasks. Excludes manual mandate authorise and granting | Yes (granted by Chairman or Super Admin) |

### Template vs personal change
| | Editing a role template | Personal override |
|---|---|---|
| Affects | Every holder of that role in the club | One person only |
| Example | Add "communications.campaigns.schedule" to Communications Officer | Give only Jane (Communications Officer) "members.export" |
| Who | Chairman, Super Admin. Finance and sensitive capabilities in templates follow the same grant rule | Chairman, Super Admin; delegators only for their own operational grants |
| Personal denies | Never undone by template edits | — |
| Audit | Template before/after, holder count affected | Person, capability, grant/deny, reason |

### Holding a capability vs delegating it
- **Holding (inherited from a role or granted personally)** lets you **perform** the action.
- **Delegating** is a separate flag that lets you give that same capability to another member of the same club.
- Delegating is possible only when the capability is marked **delegable** (operational only) **and** your grant includes the delegate flag. Role templates set this flag per capability (e.g. Bar Manager: delegate on bar.sell and bar.stocktake.count).
- Finance and sensitive capabilities are never delegable. Only the Chairman or Super Admin assigns them.
- Nobody edits their own roles, overrides or flags.

## 5. Mapping legacy access to new roles
| Legacy | Proposed mapping (reviewed per club; nothing automatic removes access) |
|---|---|
| `role='admin'` member | Proposed: Club Manager + Membership Officer + Competitions + Court & Bookings. **No finance** unless the Chairman grants it |
| `is_full_admin` person or Full Admin role | Same as above, flagged for Chairman review |
| Office bearer (Chairman/Secretary/Club Captain) | Office kept. Rights from the matching template only; the Chairman template carries no finance or bar rights |
| Key `finance` | Treasurer |
| Key `fees` | Billing Clerk + Finance Viewer |
| Key `banking` | Bookkeeper |
| Key `bar` | Bar Manager (operational) — sensitive bar keys need Chairman confirmation |
| Keys `members`, `users`, `club`, `settings` | members.view/edit, permission view only, club.profile.edit, settings.view; settings.configure needs Chairman |
| Keys `access`, `devices` | Access & Devices Officer |
| Keys `champs`, `leagues`, `ladder`, `events`, `courts`, `visitors`, `ops_booking`, `bookings_unlimited*`, `communications`, `affiliation`, `federation` | Matching operational capabilities (1:1 view + action) |
| Platform moderator | Platform Support (no club data by default) |

## 6. Finance matrix (unchanged decisions, consolidated)
V view, I initiate, E edit, A approve/reject, Act activate/deactivate, S send/remind, R reconcile, Rf reverse/refund, C configure, X export.

| Function | V | I | E | A | Act | S | R | Rf | C | X |
|---|---|---|---|---|---|---|---|---|---|---|
| Overview, debtors, statements | fin.overview.view | - | - | - | - | - | - | - | - | fin.export |
| **Bank accounts, balances, ledger** | **fin.bank.view (read-only)** | fin.bank.transaction_create | fin.bank.edit | - | - | - | fin.bank.reconcile | - | fin.settings.configure | fin.export |
| Statement import | fin.bank.view | fin.bank.import | - | - | - | - | - | - | - | - |
| Allocate receipts | fin.bank.view | fin.allocate | fin.allocate | - | - | - | - | - | - | - |
| EFT/deposit top-ups | fin.eft.view | fin.eft.capture | - | fin.eft.approve | - | fin.eft.remind | - | fin.reverse | - | fin.export |
| Billing, invoices, renewals | fin.billing.view | fin.billing.create | fin.billing.edit (unpaid) | - | - | fin.billing.remind | - | fin.billing.credit_note | - | fin.export |
| Fees, waivers | fin.fees.view | fin.fees.create | fin.fees.edit | fin.fees.waive | fin.fees.activate | - | - | - | - | - |
| Recurring mandates | fin.mandates.view | member only | - | provider only | fin.mandates.cancel | fin.mandates.remind | fin.mandates.check_status | - | - | fin.export |
| Collections | fin.collections.view | fin.collections.queue | - | fin.collections.submit | - | - | fin.collections.reconcile | fin.collections.refund | - | fin.export |
| Journals, opening balances | fin.journal.view | fin.journal.create | never after posting | fin.journal.approve (over threshold) | - | - | - | fin.reverse | - | fin.export |
| Payables (association, supplier) | fin.payables.view | fin.billing.create | - | fin.payables.pay | - | - | fin.bank.reconcile | fin.reverse | - | fin.export |
| Reports | fin.reports.view | - | - | - | - | - | - | - | - | fin.export |
| Finance settings | fin.settings.view | - | - | - | - | - | - | - | fin.settings.configure | - |
| Finance audit | fin.audit.view | - | - | - | - | - | - | - | - | fin.audit.export |

- **Mandates:** the member creates the mandate. It becomes active only on provider confirmation; notices and reminders never activate it.
- Manual "Mark authorised" becomes a separate key, granted only by the Super Admin, needing a reason, never on yourself or family, and labelled "not provider-verified" until the first confirmed collection.
- Collections count as paid only on provider confirmation.

## 7. Bar & Shop and inventory matrix
| Function | Key | Class |
|---|---|---|
| View stock levels (quantities only) | bar.stock.view | O |
| View cost prices, valuation, margins | bar.cost.view | S |
| Start / count stocktake | bar.stocktake.start / .count | O |
| **Approve stocktake discrepancies and post** | bar.stocktake.approve | S — **second person, never the counter** |
| Request adjustment, write-off, transfer | bar.adjust.request | O |
| **Approve adjustment/write-off/transfer** | bar.adjust.approve | S — **never the requester** |
| Purchase requisition | bar.purchase.request | O (new feature) |
| Approve purchase order | bar.purchase.approve | S (new feature) |
| Place order | bar.purchase.order | O (new feature) |
| Receive delivery | bar.receive | O |
| Capture supplier invoice (cost) | bar.invoice.capture | S |
| Approve/post supplier invoice | bar.invoice.approve | S — not the capturer |
| Pay supplier | fin.payables.pay | F |
| Supplier list | bar.suppliers | S (new; today free text) |
| Items, categories, specials | bar.items | O |
| Price changes | bar.prices | S |
| Sell with own PIN / charge member account | bar.sell / bar.charge_account | O (debit limits apply) |
| Discounts up to limit / over limit | bar.discount / bar.discount.over_limit | O / S |
| Void same shift under limit / refunds | bar.void / bar.refund | O / S |
| Till open-close / cash-up reconcile | bar.till.open_close / bar.till.reconcile | O / S (new feature) |
| **Counter PINs create/reset/disable** | bar.pins | S — names only, PINs never shown or logged, not for your own PIN |
| Counter devices pair/revoke | bar.devices | S |
| Bar settings | bar.settings | S |
| Reports (sales/qty) / with cost | bar.reports / bar.reports.cost | O / S |

- **Cross-module effects:** receiving, invoice capture and stocktake approval change stock value and journals; account charges create debtor balances; refunds and supplier payments move money. These are logged in both audit trails.
- Finance staff can see the resulting ledger lines without any Bar & Shop key.

## 8. Separation of duties (default on; relaxing needs a reason and is logged)
- No self-approval anywhere: captures, counts, adjustments, invoices, refunds, journals, payments, and own or family accounts and mandates.
- No changing your own roles, offices or delegate flags.
- Holders of `fin.settings.configure` can't approve payments to an account they changed within 24 hours.
- Screen warnings for capture + approve + pay combinations.
- Small-club exception (only one active person available): the Super Admin may approve the second step on request, logged (see D5).

## 9. Audit
- Every grant, revoke, delegation, office appointment and sensitive or finance action records: who, to whom/what, club, before/after, reason and time.
- Records can't be edited or deleted. PINs and card data are never logged.

## 10. "Club Books" → "Finance"
Visible text only: menu, title, breadcrumbs, approval card, help articles, module names, emails and notices. URLs, keys and database names stay the same.

## 11. Staged migration and rollback
1. **Add only (no behaviour change):** capability catalogue, delegate flags, `member_capabilities`, append-only `permission_events`, per-club `legacy_mode=ON`, an office-appointment function, and a new helper `has_cap()`. While legacy mode is on, `has_cap()` returns the **old answer**.
2. **Early safety fix (separate approval):** lock office fields (Chairman/Secretary/Club Captain) to the Super Admin and Chairman flow. This closes the self-appointment escalation without removing anyone's current access.
3. **Shadow mode:** all 71 + 46 database functions, about 425 access rules, about 25 server functions and about 40 app checks are switched one area at a time to `has_cap()`. Each still returns the legacy result while logging what the new model would decide. Per-club differences report.
4. **Mapping proposals:** each club gets the section 5 mapping as a draft. The Chairman (or Super Admin, where there is no Chairman, which today is 791 clubs) reviews and confirms. Nothing applies automatically.
5. **Per-club switch:** legacy mode OFF for that club only. Rollback means turning it back ON, at once, for 30 days; legacy flags are never deleted during this period.
6. **Retire labels:** hide "Full Admin"/"Admin"/"Club Admin" in screens, stop creating Full Admin and Finance templates for new clubs, and stop office bearers auto-receiving admin.
7. **Final cleanup (separate approval, after all clubs switched):** remove implicit paths from `is_club_admin`, map moderator to Platform Support, and mark legacy columns deprecated (kept, not dropped).

Operations preserved:
- Bookings, doors/lights, payments callbacks, the marker, tills and notifications depend on admin checks. Each area moves only after its shadow logs show no unexpected refusals.
- Automated jobs run as service and are unaffected.

## 12. Tests (planned)
- With legacy ON, every check answers exactly as today (snapshot comparison per club).
- With legacy OFF, there is no implicit access for admin, full admin, office bearers or moderators. Each template allows its own capabilities and refuses others.
- `fin.bank.view` can read balances and ledger; every banking write is refused on the server.
- Grants: F/S only by the Chairman (own club) or Super Admin. Chairman self-grant behaviour depends on D20 (allowed and audited under 3c, or refused). Self-approval of transactions is refused in both cases.
- Succession tests: a non-Chairman's handover is refused; a cross-club successor is refused; a successor who hasn't accepted gets nothing; at the effective time exactly one Chairman exists; a second concurrent handover replaces the first; the outgoing Chairman loses grant authority at once.
- Delegation: only flagged capabilities, never wider than the delegator's own, never cross-club, never to yourself.
- Second-person approval for stocktake discrepancies, adjustments, invoices and journals; self-approval refused.
- PINs: management needs `bar.pins`, PINs are never returned, and every change is logged.
- Mandates: provider-verified activation only; collections reported separately.
- Club isolation; retry and duplicate safety; rollback restores the old answers.

## 13. Conflicts resolved from earlier plans
- "Bar Manager cannot delegate" vs "delegation within role" → operational capabilities only, by flag.
- Grantable `perm.finance.grant` / "Permissions manager" → removed; grant authority is derived only.
- Finance view bundled with other keys → `fin.bank.view` is explicit and read-only.
- Office bearers as admins → offices carry no rights.

## 14. Decisions needed from the owner
- **D1.** "Super Admin" = platform Super Admin only (`user_roles` admin), not federation or support? Proposed yes.
- **D2.** Superseded by D20.
- **D3.** Confirm the O/S/F class of each capability (sections 4, 6, 7). Should any sensitive capability become delegable?
- **D4.** Who may delegate operational keys: only holders the Chairman flags (proposed), or every Bar Manager automatically?
- **D5.** Second-person rule for tiny clubs: Super Admin as the second approver on request (proposed), or let the Chairman waive it?
- **D6.** Clubs without a Chairman (791 of 799): Super Admin reviews their mapping, or they stay in legacy mode until they appoint one (proposed)?
- **D7.** Default mapping for the 29 `role='admin'` members: proposed operational bundle with no finance. Confirm, or keep a "Legacy all-access" role per club until reviewed?
- **D8.** Manual mandate "Mark authorised": remove, or keep as a Super Admin-only key?
- **D9.** Thresholds for discount, void, refund and journal second approval?
- **D10.** Platform Support (moderators): no club data by default, with temporary logged access (proposed)?
- **D11.** Build the missing Bar & Shop features (suppliers, POs, receiving, till cash-up) as part of this work, or later?
- **D12.** Approve the office-field lock (stage 2) early as a stand-alone fix?
- **D13.** Family exclusions based on account delegations, family groups, or both?
- **D14.** Member data (section 3a): approve the Secretary default; choose which higher-risk protections, if any, to add (ID number, date of birth, suspension and billing, bulk export, face data).
- **D15.** Personal overrides (section 3b): on revocation, should rights the person passed on be **flagged for review** (proposed) or **suspended at once until reviewed**? Should temporary grants or denies (with an expiry date) be allowed?
- **D16. "Chairman has access to everything" — needs your confirmation.** This conflicts with the earlier decision of no automatic finance. Options:
  - (a) **Proposed:** the Chairman sees and manages all non-finance club areas by default. Finance (view and transactions) and sensitive Bar & Shop rights only when the Super Admin grants them.
  - (b) The Chairman gets read-only finance by default (balances, reports), but transactions only from the Super Admin.
  - (c) The Chairman gets everything, including finance, automatically. This would reverse the earlier decisions.
- **D17. Vice-Chair "broad functions except finance":** does that include granting permissions (proposed: no — only the Chairman and Super Admin grant), and does it cover sensitive Bar & Shop and access/doors (proposed: operational yes, sensitive no unless the Chairman adds them)?
- **D18. Secretary and "constitution":** there is no constitution feature today. The nearest are club rules (`club_membership_rules`, rule acceptances) and club profile documents. Confirm the Secretary edits club rules and documents.
- **D19.** If self-grant is allowed: should a finance self-grant wait 24 hours unless the Super Admin confirms it sooner?
- **D20. CONFLICTING INSTRUCTIONS — please choose.** At 13:24 you said the Chairman **may** grant themselves finance permissions, overriding the earlier rule. At 13:25 you said the Chairman **cannot** grant their own sensitive permissions, and that the Chairman's finance access comes via the Super Admin.
  - (a) **Self-grant allowed**, with the section 3c safeguards (audit, badge, alerts, Super Admin revoke).
  - (b) **Self-grant refused.** The Chairman's own finance and sensitive rights come only from the Super Admin. Section 3c is dropped.
  - In both options, nobody may self-approve transactions, the Chairman office changes only by handover, and nothing crosses clubs. This plan keeps both written down until you choose. Until then, (b) is the safer default.
- **D21.** Approve the proposed office-bearer defaults in section 3d (Chairman, Vice-Chair, Secretary, Treasurer, Club Captain).
- **D22.** Succession: must the successor accept before taking over (proposed), or does the handover take effect without acceptance?
- **D23.** Emergency replacement is decided (three distinct committee approvals, Super Admin fallback). Remaining details:
  - Who counts as an "eligible committee member"? Proposed: the holders of the Secretary, Treasurer, Vice-Chair and Club Captain offices, plus any office the Chairman marks as committee.
  - How long before a request expires? Proposed: 14 days.
  - What evidence is required?
  - Should the absent Chairman be notified and given a short objection window? Proposed: yes, 72 hours, where reachable.
- **D24.** Onboarding (both pathways):
  - **Pathway A (preloaded clubs):** activate automatically on strong evidence (proposed), or always after a quick review?
  - Approve the limits while temporary.
  - Should temporary status expire after 90 days, with grant authority frozen until a real Chairman is appointed?
  - Approve the 7-day public "club claimed" notice for preloaded clubs.

## Technical details
- Audited: `is_club_admin` (platform admin/moderator, `role='admin'`, `is_full_admin`, office bearers via `clubs.*_member_id`), `is_club_admin_or_permitted`, `is_platform_admin`, `has_role`, `bar_staff_can_serve`, `is_club_captain`; `club_member_permissions`, `club_permission_roles`; triggers `create_default_finance_role`, `auto_assign_officer_roles`; `clubs` UPDATE policy; frontend `use-club-permissions.ts` (`PERMISSION_SLUGS`, `useHasPermission`, `useMemberHasAdminAccess`), `use-club-billing.ts`, `use-door-control.ts`.
- New (proposed): `capability_catalogue(key, area, class, delegable)`, `member_role_assignments(club_id, club_member_id, role_id, assigned_by, reason)`, `member_capability_overrides(club_id, club_member_id, key, effect grant|deny, can_delegate, granted_by, reason, expires_at, revoked_at)`, `club_offices(club_id, office, club_member_id, appointed_by, reason)`, `permission_events` (append-only), `club_permission_settings(legacy_mode, thresholds, separation flags)`, `permission_shadow_log`, a view `effective_capabilities` (role defaults ∪ grants − denies, with source columns), `has_cap()` reading that view, `can_grant()`, `appoint_office()`, `self_grant_requests`.
- `mandate_notification_recipients` moves to `has_cap(..., 'fin.mandates.view')`. The EFT attribution migration stays cancelled; attribution will come from audit events.
