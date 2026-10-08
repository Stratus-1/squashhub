# Club-wide roles and permissions redesign (including Finance and Bar & Shop) — for owner approval

Design only. No code, migrations, access changes or publishing. Production stays exactly as it is until each phase is separately approved.

## 1. Owner direction captured
1. Retire the overlapping labels "Full Admin", "Admin" and "Club Admin", and every implicit all-access path. Keep customisable named roles built from explicit capabilities.
2. Keep the platform Super Admin clearly separate from club-scoped roles.
3. Audit first, map carefully and migrate in stages with rollback. Don't just rename or remove flags, because many flows depend on them.
4. Finance, including read-only bank and ledger, is explicit per person. Read-only never implies any transaction right.
5. Only the club's Chairman (own club) or the platform Super Admin grants finance and sensitive rights. The Chairman can't self-grant or change their own role, and only the Super Admin grants the Chairman's own rights. Grant authority gives no operating rights.
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
| Chairman's own F/S rights | Super Admin only | - |

Delegation rules:
- You can only pass on capabilities you hold with the delegate flag.
- Recipients get perform-only unless the Chairman sets the delegate flag.
- Never cross-club, never to yourself, never to change your own roles.
- Revoking a delegator flags (not auto-removes) the grants they made, for Chairman review.

### Chairman appointment
- Set only by the Super Admin, through one audited action with a reason. A guard refuses edits from anyone else.
- An outgoing Chairman, or two office bearers, may **nominate** a successor; the Super Admin confirms.
- The Chairman must be an active member with a login. Resignation or suspension ends grant authority immediately; existing grants remain and are flagged for review.
- Secretary, Club Captain and Treasurer offices are set by the Chairman (or Super Admin). These offices carry no rights by themselves.
- **Emergency recovery:** the Super Admin can freeze grants for a club, revoke any grant, or appoint an interim Chairman. Each needs a reason, is logged, notifies office bearers, and is reviewed after 30 days.

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
- Grants: F/S only by the Chairman (own club) or Super Admin. Chairman self-grant is refused, and only the Super Admin can change the Chairman.
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
- **D2.** Chairman's own rights: Super Admin only (proposed), or Super Admin + one named office bearer?
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

## Technical details
- Audited: `is_club_admin` (platform admin/moderator, `role='admin'`, `is_full_admin`, office bearers via `clubs.*_member_id`), `is_club_admin_or_permitted`, `is_platform_admin`, `has_role`, `bar_staff_can_serve`, `is_club_captain`; `club_member_permissions`, `club_permission_roles`; triggers `create_default_finance_role`, `auto_assign_officer_roles`; `clubs` UPDATE policy; frontend `use-club-permissions.ts` (`PERMISSION_SLUGS`, `useHasPermission`, `useMemberHasAdminAccess`), `use-club-billing.ts`, `use-door-control.ts`.
- New (proposed): `capability_catalogue(key, area, class, delegable)`, `member_capabilities(club_id, club_member_id, key, can_delegate, granted_by, source)`, `club_offices(club_id, office, club_member_id, appointed_by, reason)`, `permission_events` (append-only), `club_permission_settings(legacy_mode, thresholds, separation flags)`, `permission_shadow_log`, `has_cap()`, `can_grant()`, `appoint_office()`, `self_grant_requests`.
- `mandate_notification_recipients` moves to `has_cap(..., 'fin.mandates.view')`. The EFT attribution migration stays cancelled; attribution will come from audit events.
