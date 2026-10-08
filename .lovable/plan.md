# Club Finance and Bar & Shop permissions — consolidated design (for owner approval)

Design only. No code, migrations, access changes or publishing. Production behaviour stays exactly as it is until each phase below is separately approved.

## 1. Owner decisions captured
1. Admin status alone gives **no** finance access. This covers Admin, Club Admin, full admin, committee members, Treasurer-by-title and moderators.
2. Finance access, **including read-only bank balances and ledger**, is an explicit permission per person and per club.
3. Read-only banking (`bank.view`) never implies entering, importing, posting, editing, allocating, reconciling, approving or reversing anything.
4. Only the **club's Chairman (own club only)** or the **platform Super Admin** may grant or revoke finance permissions and sensitive Bar & Shop permissions.
5. Grant authority is not finance or Bar & Shop authority. The Chairman sees and does nothing in Finance or Bar & Shop unless granted.
6. The Chairman can't self-grant or change their own role. Only the Super Admin grants the Chairman's personal finance and sensitive Bar & Shop rights.
7. The Chairman designation itself is protected from admin manipulation.
8. Controlled same-club delegation is allowed for **operational** Bar & Shop roles that explicitly permit it. Finance and other high-risk rights are not delegable.
9. Counter PIN create/reset/disable is a separate permission from using a PIN. PINs are never displayed, and every change is audited.
10. Mandate creation, provider authorisation and payment collection are three different things. Activation is provider-verified.
11. Rename "Club Books" to **"Finance"** wherever members and staff see it.

## 2. Current state audit (confirmed from code and database)

| Label | What it is technically | Finance rights today |
|---|---|---|
| Platform Super Admin | `user_roles.role='admin'` (1 user) | Full finance in every club (via `is_club_admin_or_permitted`) |
| Platform moderator | `user_roles.role='moderator'` | **Full finance in every club** (same check). `is_platform_admin` also counts moderators |
| Federation super admin | `organisation_admins.role='super_admin'` (1 row) | None through club finance checks. A separate federation scope |
| Club Admin / "Admin" | `club_members.role='admin'` | Full finance in that club |
| Full admin | `club_member_permissions.is_full_admin` or role `is_full_admin` | Full finance in that club. The screens also treat full admin as finance (`use-club-billing.ts:153`) |
| Treasurer / "Finance" role | Permission role; every new club gets "Finance" = `fees, banking, members, bar, finance` (`create_default_finance_role`) | Whatever keys the role holds |
| Chairman | `clubs.chairman_member_id` → "Chairman" role via `auto_assign_officer_roles` | Only what that role holds |

Gaps found:
- These money actions check only `is_club_admin`, so finance-only staff are refused and admins pass: journal reverse/delete, and mandate "Mark authorised / reject" (`stitch-refresh-mandate`).
- `post_journal` has no caller check.
- The Chairman field can be edited by any club admin or holder of the `club` key, which is an escalation route.
- Anyone passing `bar_staff_can_serve` can create or remove counter PINs and revoke devices.
- Bar & Shop today has purchases (supplier text, invoice no/date, payment method), stock movements, stock-takes (count → finalise → optional ledger post) and tabs. There is **no** supplier list, purchase requisition, purchase order, receiving step or till open/close cash-up.

Terminology proposal:
- "Platform Super Admin" (app-wide), "Platform Support" (today's moderator), "Federation Admin" (federation only).
- "Club Administrator" replaces both "Admin" and "Club Admin". "Full admin" is retired as a label.
- "Chairman", "Treasurer" and "Bar Manager" are office or preset names, never sources of rights by themselves.

## 3. Permission model
- Rights are **capability keys** held per person per club, given individually or through a preset.
- Each key has two flags:
  - **perform**: may do the action.
  - **delegate**: may give that same key to another member of the same club. Only allowed where the key is marked delegable.
- **Grant authority** is separate. It is derived only from being the active Chairman of that club, or the platform Super Admin. It is never a key and can't be delegated.

### Delegation classes

| Class | Who may grant | Delegable? |
|---|---|---|
| F – Finance (all `fin.*`, incl. `bank.view`) | Chairman, Super Admin | Never |
| S – Sensitive Bar & Shop (cost/valuation, adjustments approve, refunds/voids above limit, PINs, settings, supplier payments) | Chairman, Super Admin | Never (unless owner decides otherwise, see D3) |
| O – Operational Bar & Shop (sell, count stock, receive deliveries, capture purchase drafts, view stock levels) | Chairman, Super Admin, or a holder of that key **with delegate flag** | Yes, same club, same or narrower scope |
| G – Grant/admin of permissions | Derived: Chairman / Super Admin only | Never |

Delegation rules:
- You can only pass on keys you hold with the delegate flag.
- The default is perform only: the recipient does not get the delegate flag unless the Chairman or Super Admin sets it.
- No cross-club grants, no editing your own keys, and no reviving a key someone else revoked.
- Revoking a delegator's key also flags (not auto-removes) the grants they made, for Chairman review.

## 4. Finance matrix
V view, I initiate/create, E edit, A approve/reject, Act activate/deactivate, S send/remind, R reconcile, Rf reverse/refund, C configure, X export. "-" means it doesn't apply.

| Function | V | I | E | A | Act | S | R | Rf | C | X |
|---|---|---|---|---|---|---|---|---|---|---|
| Finance overview, debtors, statements | fin.overview.view | - | - | - | - | - | - | - | - | fin.export |
| **Bank accounts, balances, bank ledger** | **fin.bank.view** (read-only) | fin.bank.transaction_create | fin.bank.edit (rules, matches) | - | - | - | fin.bank.reconcile | - | fin.settings.configure (account details) | fin.export |
| Bank statement import | fin.bank.view | fin.bank.import | - | - | - | - | - | - | - | - |
| Allocate receipts to members | fin.bank.view | fin.allocate | fin.allocate | - | - | - | - | - | - | - |
| EFT/deposit top-ups | fin.eft.view | fin.eft.capture | - | fin.eft.approve | - | fin.eft.remind | - | fin.reverse | - | fin.export |
| Member billing, invoices, renewal runs | fin.billing.view | fin.billing.create | fin.billing.edit (unpaid only) | - | - | fin.billing.remind | - | fin.billing.credit_note | - | fin.export |
| Fee categories, waivers | fin.fees.view | fin.fees.create | fin.fees.edit | fin.fees.waive | fin.fees.activate | - | - | - | - | - |
| Recurring card mandates | fin.mandates.view | (member only) | - | (provider only; see 5) | fin.mandates.cancel | fin.mandates.remind | fin.mandates.check_status | - | - | fin.export |
| Mandate collections | fin.collections.view | fin.collections.queue | - | fin.collections.submit | - | - | fin.collections.reconcile | fin.collections.refund | - | fin.export |
| Journals, opening balances | fin.journal.view | fin.journal.create | (posted never edited) | fin.journal.approve (over threshold) | - | - | - | fin.reverse | - | fin.export |
| Association/league/national payables | fin.overview.view | fin.billing.create | - | fin.payables.pay | - | - | fin.bank.reconcile | fin.reverse | - | fin.export |
| Supplier payments (bar invoices) | fin.payables.view | - | - | fin.payables.pay | - | - | fin.bank.reconcile | fin.reverse | - | fin.export |
| Reports (trial balance, income) | fin.reports.view | - | - | - | - | - | - | - | - | fin.export |
| Finance settings (gateways, recurring, thresholds) | fin.settings.view | - | - | - | - | - | - | - | fin.settings.configure | - |
| Finance audit trail | fin.audit.view | - | - | - | - | - | - | - | - | fin.audit.export |

- Every key shows only the records its action needs.
- `fin.bank.view` holders see balances and ledger lines with no action buttons. The server refuses all banking writes without the matching action key.

## 5. Mandate creation vs authorisation vs collection
- **Creation:** the member starts the mandate. Staff can't create one on a member's behalf. Notices go to `fin.mandates.view` holders.
- **Authorisation:** "active" only after the provider confirms it (webhook or Check status). Notices and reminders never change status.
- **Manual "Mark authorised"** (for a provider with no confirmation): a separate key, `fin.mandates.manual_authorise`. Only the Super Admin can grant it, and no preset includes it. It needs a reason, is logged, and can't be used on yourself or linked family. The mandate is labelled "Manually marked — not provider-verified" until the first confirmed collection. Recommended: no holders.
- **Collection:** a separate debit run, counted as paid only on provider confirmation. Reported apart from mandate status.

## 6. Bar & Shop and inventory matrix
Class column: O operational (delegable if flagged), S sensitive (Chairman/Super Admin only), F links to Finance.

| Function | Key | Class | Notes |
|---|---|---|---|
| View stock levels (quantities) | bar.stock.view | O | No costs shown |
| View cost prices, stock valuation, margins | bar.cost.view | S | Hidden from tills and stock counters |
| Start stocktake | bar.stocktake.start | O | |
| Count stock | bar.stocktake.count | O | |
| Approve/post stocktake adjustments | bar.stocktake.approve | S | Second person by default (see D5); posts valuation to the ledger |
| Manual adjustments, write-offs, transfers (request) | bar.adjust.request | O | |
| Approve adjustments/write-offs | bar.adjust.approve | S | Not the requester |
| Purchase requisition (request stock) | bar.purchase.request | O | New feature |
| Approve purchase order | bar.purchase.approve | S | New feature |
| Place order with supplier | bar.purchase.order | O | New feature |
| Receive delivery (quantities) | bar.receive | O | Increases stock via `bar_stock_apply` |
| Capture supplier invoice/purchase (cost) | bar.invoice.capture | S | Changes average cost |
| Approve/post supplier invoice | bar.invoice.approve | S | Not the capturer |
| Pay supplier | fin.payables.pay | F | Finance only |
| Supplier list maintenance | bar.suppliers | S | New feature (today free text) |
| Items, categories, specials | bar.items | O | |
| Price changes | bar.prices | S | Logged before/after |
| Sell at till using own PIN | bar.sell | O | |
| Charge member account at till | bar.charge_account | O | Club debit limits still apply |
| Discounts | bar.discount (up to club limit) / bar.discount.over_limit | O / S | |
| Voids and refunds | bar.void (same shift, under limit) / bar.refund | O / S | Refunds to card are F-linked |
| Till open/close, cash-up | bar.till.open_close / bar.till.reconcile | O / S | New feature |
| Counter PINs create/reset/disable | bar.pins | S | Names only; PINs never shown or logged; not for your own PIN |
| Counter devices pair/revoke | bar.devices | S | |
| Bar settings (payment methods, debit switches, costing, negative stock) | bar.settings | S | |
| Bar reports (sales, quantities) | bar.reports | O | |
| Bar reports with cost/COGS | bar.reports.cost | S | |

### Cross-module effects
- Receiving and capturing invoices change stock value and journals.
- Stocktake approval posts variances to the ledger.
- Member-account charges create debtor balances.
- Refunds and supplier payments move money.

These are logged in both the Bar & Shop and Finance audit trails. Finance staff can see the resulting ledger lines without holding any Bar & Shop key.

## 7. Separation of duties (on by default; relaxing needs a reason and is logged)
- No approving your own capture, request, count, refund or payment, or a linked family member's account or mandate.
- The requester can't approve: adjustments, purchase orders, supplier invoices, journals over threshold, stocktake posting (per D5).
- Holders of `fin.settings.configure` can't approve payments to an account they changed within 24 hours.
- Screen warnings when one person holds capture + approve + pay, or `bar.invoice.capture` + `fin.payables.pay`.

## 8. Chairman protection and emergency recovery
- Only the Super Admin sets or changes the Chairman, through one audited function with a reason. A guard refuses all other edits to that field.
- An outgoing Chairman may nominate a successor; the Super Admin confirms.
- The Chairman must be an active member of that club with a login. Losing that status removes grant authority at once; grants already made remain.
- Chairman self-requests (for finance or sensitive Bar & Shop rights) go to the Super Admin for approval.
- **Recovery:** the Super Admin may freeze all grants for a club, revoke any grant, or appoint an interim Chairman. Each needs a reason, is logged, notifies the office bearers, and is reviewed after 30 days.

## 9. Audit
- Every grant, revoke and delegation records: who, to whom, key, perform/delegate flags, club, reason and time.
- So does every finance and sensitive Bar & Shop action, plus before/after values.
- Audit records can't be edited or deleted. PIN values and card data are never recorded.

## 10. "Club Books" → "Finance" rename
- Change visible text only: Club Admin menu, page title, breadcrumbs, the pending-approval card and links text (`use-pending-eft-toast.tsx`), help articles (`lib/help/knowledge.ts`), module names (`lib/capabilities.ts`), emails and notices.
- URLs (`?tab=finance`), capability keys, table and function names stay the same.

## 11. Conflicts with the earlier plan (resolved here)
- The earlier plan let the Chairman grant all keys and had a "Permissions manager" preset → replaced by Chairman/Super Admin-only grants for F and S, plus delegation for O only.
- Earlier, any `fin.*` key implied viewing its records, and bank view was bundled → now `fin.bank.view` is a stand-alone, read-only, explicit key.
- Earlier, "Bar Manager cannot delegate" vs the new "delegation within role" → Bar Manager may delegate **only** operational keys marked delegable, never sensitive ones.
- Earlier, `perm.finance.grant` was a grantable key → removed; grant authority is derived only.
- Earlier, a moderator view-only role was an open question → now proposed as no club finance access, with a separate logged support access mode.

## 12. Safe transition (each step separately approved)
1. **Add only:** keys, delegate flags, audit tables, presets, Chairman guard (design reviewed first). A per-club **legacy mode stays ON**, so today's rules keep applying and no one loses access.
2. **Shadow check:** every finance and bar action runs both the old and new rules and logs differences. A per-club report shows who would lose or gain what.
3. **Screens:** Finance and Bar & Shop tick-boxes with perform/delegate flags, presets, warnings, and the shadow review. Rename to "Finance".
4. **Per-club switch-over:** the Chairman (or Super Admin) assigns presets, then switches legacy mode OFF. It can be reverted for 30 days.
5. **Later platform cleanup:** stop auto-creating the broad "Finance" role, retire the broad keys and the moderator auto-grant, and lock the Chairman field for all clubs.

Note: the Chairman field guard closes an escalation route today. It could be approved early on its own.

## 13. Proposed presets (editable)
- **Treasurer:** all `fin.*` except `manual_authorise`. No grant authority.
- **Finance viewer:** `fin.overview.view`, `fin.bank.view`, `fin.reports.view`.
- **Management read-only:** `fin.bank.view`, `fin.overview.view` only.
- **Billing clerk:** billing view/create/edit/remind, `fin.fees.view`.
- **Payments approver:** EFT view/approve, collections view/submit/reconcile, mandates view/remind/check_status.
- **Bookkeeper:** bank view/import/transaction_create/reconcile, allocate, journal view/create.
- **Bar Manager:** stock view, stocktake start/count, adjust request, purchase request/order, receive, items, sell, discount, void, reports. Delegate flag on operational keys. Sensitive keys only if the Chairman adds them.
- **Bar Staff:** sell, charge_account, stock view.
- **Stock Counter:** stocktake count, stock view.
- **Bar Controller (sensitive):** cost view, stocktake approve, adjust approve, invoice capture/approve, prices, refunds, till reconcile, PINs, devices, settings.

## 14. Tests (planned)
- Admin, full admin, moderator, Treasurer-title and committee members with no keys are refused everywhere (legacy OFF) and keep current access (legacy ON).
- `fin.bank.view` sees balances and ledger, and every banking write is refused on the server.
- Only the Chairman of that club or the Super Admin grants F/S keys. Chairman self-grant is refused, and only the Super Admin can change the Chairman.
- Delegation: only flagged keys, never wider than your own, never cross-club, never to yourself. Delegated keys are perform-only by default.
- PIN management needs `bar.pins`; selling with a PIN doesn't give it; PINs are never returned.
- Requester/approver separation on adjustments, POs, invoices, stocktakes and journals.
- Mandates: notices and reminders never activate; collection is reported separately.
- Retries refused: double approval, double collection, double reversal. Club isolation holds throughout.

## 15. Decisions needed from the owner
- **D1. Super Admin meaning:** confirm it is the platform Super Admin only (app-wide admin role), not the federation super admin or platform support. Proposed: yes.
- **D2. Chairman's own rights:** Super Admin approval only (proposed), or also a second named office bearer?
- **D3. Delegation tension:** you asked both "Chairman controls all Bar & Shop permissions" and "role holders may delegate within their role". Proposed: Chairman-only for sensitive (S) keys; delegation allowed for operational (O) keys marked delegable. Confirm the O/S split in section 6, or move keys between classes.
- **D4. Who may delegate operational Bar & Shop keys:** only holders the Chairman marked with the delegate flag (proposed), or every Bar Manager preset holder automatically?
- **D5. Stocktake posting:** require a second person to approve (proposed, with a small-club override by the Chairman), or let the counter post their own count?
- **D6. Manual mandate "Mark authorised":** remove entirely, or keep as the Super Admin-granted key?
- **D7. Thresholds:** discount, void and refund limits, and the journal second-approver amount (e.g. R500 / R1,000)?
- **D8. Platform Support (moderators):** no club finance access (proposed), or view-only?
- **D9. New Bar & Shop features** (suppliers, requisitions, purchase orders, receiving, till cash-up): permissions are designed now, but should building those features be in scope?
- **D10. Early fix:** approve the Chairman-field guard ahead of the rest?
- **D11. Family exclusions:** based on account delegations, family groups, or both?

## Technical details
- Existing checks: `is_club_admin_or_permitted`, `is_club_admin`, `is_platform_admin` (admin + moderator), `has_role`, `bar_staff_can_serve`; tables `club_member_permissions` (custom_permissions, is_full_admin, permission_role_id), `club_permission_roles`; triggers `create_default_finance_role`, `auto_assign_officer_roles`; clubs UPDATE policy `is_club_admin_or_permitted(...,'club')`.
- Proposed new: `member_capabilities(club_id, club_member_id, key, can_delegate, granted_by, source)`, `permission_events` (append-only), `club_permission_settings(legacy_mode, thresholds, separation flags)`, `permission_shadow_log`, helpers `has_cap(user, club, key)` and `can_grant(user, club, key)`, an audited `set_club_chairman()` plus a guard trigger, and `self_grant_requests`.
- The `mandate_notification_recipients` rule would move to `has_cap(..., 'fin.mandates.view')`.
- The earlier EFT approver-attribution migration stays cancelled. Attribution will come from `permission_events`/finance audit events.
