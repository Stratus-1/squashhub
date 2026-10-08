# Fine-grained club finance permissions (revised design, plan only)

Nothing is implemented, migrated or changed by this plan. Live access stays exactly as it is until each phase is separately approved.

## Owner decisions this revision applies
- Being a Club Admin, a club "admin" member, a full-admin member or an ordinary admin gives **no finance access by itself**.
- Finance access comes only from explicit, club-specific finance permissions, granted to a Treasurer role or to selected individual members.
- The power to grant or remove permissions is separate from the power to handle money.
- Nobody can grant themselves anything, and nobody can grant more than they hold.
- Existing access is not removed silently. Each club moves over only after review and an explicit switch.

## Current state (confirmed by reading the code and database)
- One check, `is_club_admin_or_permitted(user, club, key)`, lets in platform admins and moderators (every club), club `role='admin'` members, full-admin members, and anyone holding the key directly or through a role.
- Finance uses three broad keys: `finance`, `fees`, `banking`. Every new club automatically gets a "Finance" role with `fees, banking, members, bar, finance`.
- Many money actions check only `is_club_admin`: journal reversal (`admin_reverse_journal_group`), journal delete, and "Mark authorised / reject" on a mandate (`stitch-refresh-mandate`). So finance-only staff can't do them, and admins can do them without any finance grant.
- `post_journal` has no caller check of its own. `finance_decide_member_transaction` checks `finance`.
- The new mandate notices go only to members explicitly granted `finance` or `recurring_payments`.

## Capability keys (one per action family)
`fin.<area>.<action>`. Areas: `overview`, `eft`, `billing`, `fees`, `mandates`, `collections`, `bank`, `journal`, `pos`, `reports`, `settings`, `audit`. Actions: view, create, edit, approve, activate, remind, reconcile, reverse, configure, export.
Grant authority is not a key anyone can be given. It is derived only from being the club's designated Chairman, or from being platform super admin, and it gives no money powers.

## Permission matrix
Columns: V view, C create/initiate, E edit, A approve/reject, Act activate/deactivate, S send/remind, R reconcile, Rev reverse/refund, Cfg configure, X export. A dash means it doesn't apply.

| Function | V | C | E | A | Act | S | R | Rev | Cfg | X |
|---|---|---|---|---|---|---|---|---|---|---|
| Finance overview, balances, debtors | overview.view | - | - | - | - | - | - | - | - | reports.export |
| EFT and deposit top-ups (pending queue, proof) | eft.view | eft.create (capture on member's behalf) | - | eft.approve | - | eft.remind | - | journal.reverse | - | reports.export |
| Member billing, invoices, renewal runs | billing.view | billing.create | billing.edit (before payment only) | - | - | billing.remind | - | billing.reverse (credit note) | - | reports.export |
| Fee categories, amounts, waivers | fees.view | fees.create | fees.edit | fees.approve (waivers above threshold) | fees.activate | - | - | - | - | - |
| Recurring card mandates | mandates.view | (member-initiated; staff cannot create on member's behalf) | - | see note 1 | mandates.activate (cancel/suspend only) | mandates.remind (link, club WhatsApp) | mandates.reconcile (Check status) | - | - | reports.export |
| Mandate collections (queue, submit, charge) | collections.view | collections.create (queue) | - | collections.approve (submit to provider) | - | - | collections.reconcile | collections.reverse (refund via provider) | - | reports.export |
| Bank accounts, statements, rules | bank.view | bank.create (import statement) | bank.edit (match rules) | - | - | - | bank.reconcile | - | settings.configure (account details) | reports.export |
| Journals, manual entries, opening balances | journal.view | journal.create | - (posted entries never edited) | journal.approve (second approver over threshold) | - | - | - | journal.reverse | - | reports.export |
| POS and bar money (tabs, account charges, cash-up, stock-take valuation) | pos.view | (till sales stay with bar staff, unchanged) | - | pos.approve (stock-take finalise, write-offs) | - | - | pos.reconcile (cash-up) | pos.reverse (void/refund sale) | pos.configure (debit limits, payment methods) | reports.export |
| Association, league and national payables | overview.view | billing.create | - | collections.approve (pay batch) | - | - | bank.reconcile | journal.reverse | - | reports.export |
| Reports (trial balance, income, statements) | reports.view | - | - | - | - | - | - | - | - | reports.export |
| Finance settings (gateways, banking details, recurring settings, thresholds) | settings.view | - | - | - | - | - | - | - | settings.configure | - |
| Finance audit trail | audit.view | - | - | - | - | - | - | - | - | audit.export |
| Granting finance permissions | perm.finance.grant (view who holds what) | perm.finance.grant | perm.finance.grant | - | - | - | - | - | - | audit.export |

Every key also lets the holder see the records needed for that action, and nothing more. Member contact details and ID numbers show only where the action needs them, such as the phone number for a reminder.

### Note 1: mandate authorisation vs payment collection
- **Mandate authorisation** means the member gave permission for future card debits. It is not money received. It becomes "active" only after the payment provider confirms it, through the webhook or Check status.
- **Collection** is an actual debit run against an active mandate. It is reported separately and only counts as paid once the provider confirms the payment.
- **Manual "Mark authorised"** (for providers that can't confirm an authorisation): proposed as a separate, high-risk key `fin.mandates.manual_authorise`. It is off in every preset, needs a written reason, is logged, and can't be used on your own or a family member's mandate. A mandate marked this way is labelled "Manually marked, not provider-verified" until the first successful collection confirms it. Recommended default: no one holds it, so provider-verified only.
- Notices and reminders never change a mandate's status.

## Separation of duties (on by default, clubs may relax only with logged consent)
- No approving your own capture, your own payment, your own or your linked family members' account, or your own mandate.
- The person who creates a journal, refund or reversal can't approve it when a second approver is needed above the club threshold.
- Holders of `settings.configure` can't approve payments into a bank account or gateway they changed within the last 24 hours.
- Nobody can grant finance keys to themselves (see below for the Chairman).
- Warnings in the admin screen when one person would hold billing + approve + reverse.

## Who may grant finance permissions (owner decision)
- **Only two people may grant, change or revoke any club finance permission:** that club's formally designated **Chairman**, and the **platform super admin**. Club Admin, ordinary admin, Treasurer, committee members, full-admin members, federation admins and platform moderators can't, whatever their role.
- **Grant authority is not finance access.** The Chairman can assign finance rights to named members (including view-only) but sees no balances or transactions and can't act on money unless separately granted.
- **The Chairman can't grant themselves finance rights.** If the Chairman needs finance rights, they request them in-app with a reason. A platform super admin must approve that request, and the Chairman can't approve it themselves. Proposed: platform super admin only, with no club-level exception.
- **The super admin's own grants** are logged with a reason, and the club Chairman is notified of every grant the super admin makes in their club.
- **What a grant may include:** the Chairman may grant any finance key except `manual_authorise`, which only the super admin can grant (if it exists at all).

### Chairman designation is protected
- Today `clubs.chairman_member_id` can be changed by any club admin or anyone with the `club` permission. That would let an ordinary admin make themselves Chairman and gain grant authority.
- Proposed: only the platform super admin can set or change the Chairman, through one audited function with a reason. A guard on the club record refuses any other change to that field. An outgoing Chairman can nominate a successor, which takes effect only after super admin confirmation.
- The Chairman must be an active member of that club with a linked login. Resigning or being suspended removes grant authority immediately, while grants already made stay in place.
- Chairman authority is checked per club. Being Chairman in club A gives nothing in club B.

### Emergency recovery (no Chairman, Chairman unavailable, or a compromised account)
- The platform super admin can, with a written reason: freeze all finance grants for a club (read-only mode), revoke any grant, or appoint an interim Chairman. Each action is logged and the club's office bearers are notified.
- Proposed: a request from at least two club office bearers (e.g. secretary + treasurer) is recorded before the super admin acts, unless it's a security incident.
- All recovery actions appear in the finance audit trail. They can't be edited or deleted, and they expire or are reviewed after 30 days.

## Presets (starting points, editable per club)
- **Treasurer (full finance):** everything except `manual_authorise` and `perm.finance.grant`.
- **Finance viewer / auditor:** all `.view`, `reports.export`, `audit.view`.
- **Billing clerk:** billing view/create/edit/remind, fees view, eft.view.
- **Payments approver:** eft view/approve, collections view/approve/reconcile, mandates view/remind/reconcile.
- **Bookkeeper:** bank view/create/reconcile, journal view/create, reports.
- **Bar cash-up:** pos view/reconcile/approve.
- Grant authority is not a preset. It comes only from being the club's designated Chairman, or from being platform super admin (see "Who may grant finance permissions").

## Server enforcement
- One helper, `has_fin(user, club, key)`, used by every finance function, read rule, edge function and `post_journal`. It does **not** treat club admin, full admin or platform moderator as finance on its own. Platform super admin keeps a separate, logged support override.
- Each action locks its row, acts only from the expected state (pending → approved, never twice) and is safe to retry with the existing idempotency keys.
- Mandate activation stays provider-driven. `stitch-refresh-mandate` "confirm" moves to `manual_authorise`.

## Audit
Every finance action and every grant or removal writes a permanent event: who, club, key, record, before/after, reason and time. Nobody can edit or delete these records. Grant events also record who granted, to whom, and the reason.

## Safe transition (each step separately approved)
1. **Add only:** new keys, helper, audit table, presets. The helper keeps a per-club "legacy mode" (default ON) where today's rules still apply: admin, `finance`, `fees`, `banking`. No one loses or gains access.
2. **Shadow check:** every finance action runs both the old and new rules and logs where they differ. Per-club report: "these people lose X, these gain Y".
3. **Admin screen:** Club Admin → Permissions → Finance tick-boxes, presets, warnings, and a review screen of the shadow report.
4. **Per-club opt-in:** a club owner reviews the report, assigns presets, then switches legacy mode OFF. It can be switched back on within 30 days and every switch is logged.
5. **Platform cleanup (later, separate approval):** stop the auto-created broad "Finance" role, retire the broad keys and the moderator auto-grant, and keep the platform super admin override.

## Tests
- Admin with no finance key is refused in every finance function (legacy OFF) and allowed (legacy ON).
- Each preset can do its own actions and is refused for every other key.
- No self-approval, no approving a family member's payment, no approving your own entry above the threshold, no approving payments within 24h of a gateway change.
- Grant rules: no self-grant, can't grant beyond your own keys, grant holder has no money access.
- Mandate: notices and reminders never activate; only a provider callback or `manual_authorise` (with reason, logged, label shown) does; collection reported separately.
- Club isolation: keys in club A give nothing in club B.
- Shadow-check differences match the per-club report. Switching back restores old behaviour.
- Retries and duplicates refused (approval twice, collection twice, reversal twice).

## Unresolved decisions for owner review
1. Chairman finance rights: second-party approval by the platform super admin only (proposed), or also a named committee member?
1a. Confirm "Super Admin" means the platform super admin (the app-wide admin role), and NOT the federation organisation super admin. Proposed: federation admins get no club finance grant authority.
1b. Changing the Chairman: platform super admin only (proposed), or an outgoing Chairman + super admin confirmation?
2. Should `manual_authorise` exist at all, or should mandates be provider-verified only, with no manual path?
3. Default second-approver thresholds for refunds, journals and waivers (e.g. R1,000)? Should they be skipped for one-treasurer clubs?
4. Platform moderators: keep a view-only support role, or nothing?
5. Should till staff keep charging member accounts without a finance key? Proposed: yes, this is bar authority and the debit limits still apply.
6. Should family/linked-member exclusions use account delegation links, family groups, or both?
7. Rollback window after a club switches legacy OFF (proposed 30 days).

## Technical details
- Existing: `is_club_admin_or_permitted`, `club_member_permissions` (custom_permissions, is_full_admin, permission_role_id), `club_permission_roles`, trigger `create_default_finance_role`, `finance_decide_member_transaction`, `admin_reverse_journal_group`/`admin_delete_journal_group` (`is_club_admin`), `stitch-refresh-mandate` confirm/reject (`is_club_admin`), `post_journal` (no caller check), `mandate_notification_recipients` (`finance`/`recurring_payments`).
- New: `club_finance_settings(legacy_mode, thresholds, separation flags)`, `finance_permission_events` (append-only), `finance_shadow_log`, `has_fin()`; keys stored in the existing `custom_permissions`/role `permissions` arrays.
- Mandate notice recipients would later move to `has_fin(..., 'fin.mandates.view')`.
- The cancelled EFT attribution migration stays cancelled. Attribution will read from the finance audit events instead.
