# Fine-grained club finance permissions (design only)

Nothing changes until this plan is approved. Existing roles and the Treasurer role keep working exactly as they do today. The earlier EFT approval attribution migration stays cancelled and will not be run.

## Today (audit)
- One check, `is_club_admin_or_permitted(user, club, key)`, grants access to:
  - platform admins and moderators (all clubs)
  - club admins (`club_members.role = 'admin'`)
  - members with `is_full_admin`
  - any matching key in the member's custom permissions or their assigned permission role
- Finance currently uses three broad keys: `finance`, `fees` and `banking`. They sit on about 5,570 role and permission rows, mostly club role templates such as Treasurer. Anyone holding `finance` can approve EFTs, bill members, reconcile the bank, post journals and change settings.
- The only finance action checked on the server is `finance_decide_member_transaction`, which checks `finance`. Most Club Books screens are admin-only on the server and use the broad keys in the app. `post_journal` has no check of its own on who is calling it.
- Platform moderators get full finance access in every club. This is a known over-grant.

## Proposed permissions (new keys, club-scoped)
| Key | Allows |
|---|---|
| `finance.view` | View Club Books, ledgers, statements, reports (read-only) |
| `finance.eft_approve` | Approve or reject pending EFT/deposit top-ups |
| `finance.billing` | Create and edit member invoices and fees, and run billing |
| `finance.allocate` | Allocate received payments to fees and invoices |
| `finance.reconcile` | Import bank statements, match transactions, set bank rules |
| `finance.refund` | Refunds, reversals and deleting or reversing journal groups |
| `finance.settings` | Gateways, GL accounts, finance settings, fee categories |

Every action key also includes view access for the records it needs, and nothing more.

## Separation of duties (on by default, the club can relax it)
- A person cannot approve their own EFT, or one they captured for someone else.
- A refund or reversal cannot be approved by the person who created the original entry. Above a threshold the club sets, a second approver is needed.
- `finance.settings` holders cannot also approve payments into a gateway or bank account they changed within the last 24 hours. The UI warns; the server blocks.
- The admin UI warns when one person would hold `billing` + `allocate` + `refund` together.

## Backward compatibility
- The old keys stay valid. On the server, `finance` grants all new `finance.*` keys, `fees` grants `billing` + `allocate`, and `banking` grants `reconcile` + `view`. Every current Treasurer keeps exactly the access they have today.
- Club admins and full admins keep everything.
- Clubs opt in by editing a role or a person and ticking individual permissions. Nothing is removed automatically.
- Later, and only with approval, a separate step can retire the broad keys after clubs have moved over.

## Server-side enforcement
- One helper, `has_finance_permission(user, club, key)`, that understands the old-key mapping. It is used by:
  - every finance action: EFT decision, billing, allocation, reconciliation, refunds/reversals, `post_journal`, settings updates
  - the read rules (RLS policies) on finance tables
- Each action locks the row it works on, acts only from the expected state (for example, pending), and is safe to retry.
- Platform moderators: finance access stops being automatic and requires an explicit grant. This is a separate, opt-in step needing Willem's approval, because it changes current access.

## Mobile actions
- The pending-EFT card and email deep links show only to `finance.eft_approve` holders.
- Approve and Reject keep the explicit confirmation wording ("SquashHub has not verified the bank deposit").
- Other finance actions on mobile are view-only unless the person holds that action key.
- The deep-link and login return already built is reused.

## Audit log
- Every finance action writes an unchangeable audit event:
  - who did it, and their club
  - which permission key was used
  - which record it applied to
  - before and after state
  - the reason (required for refunds/reversals)
- Permission grants and removals are audited too: who changed them, for whom, old and new keys.
- EFT approver attribution ("Approved by Rachel • date") will be redesigned on top of this audit event. It will be read from the event, not added to payment records, and it will not replace the existing approval engine. It will be submitted separately for review.

## Admin UI
- Club Admin → Permissions: a new "Finance" group with seven tick-boxes, each with a one-line explanation, plus a "Treasurer (full finance)" preset that equals today's behaviour.
- Separation-of-duties warnings show inline. Removing your own last finance-settings access needs confirmation.
- Only club admins and full admins can grant finance keys. A finance holder cannot give themselves extra keys.

## Tests
- Each key allows only its own action. The old keys map correctly.
- Cross-club access is denied.
- Self-approval is refused. Two people approving the same EFT at once results in one approval.
- A refund needs a second approver above the threshold.
- `post_journal` is refused without the right key.
- Audit rows are written for every action and every grant change.
- Mobile card visibility follows the key.
- Existing Treasurer regression: identical access before and after.

## Risks
- Missed server paths: an action that still checks `finance` or is admin-only creates a mismatch between the screen and the server. Before building, every finance function and policy will be listed and mapped.
- RLS changes on busy finance tables can hide data if a policy is wrong. Roll out behind the old-key mapping and compare visible row counts per club before and after.
- Turning on separation of duties can block small clubs with one Treasurer. It stays relaxable per club, with a clear message.
- Removing the platform moderator over-grant may surprise support staff, so it is kept as a separate approval.
- Older approvals have no recorded approver. They will show "Approver not recorded".

## Delivery phases (each needs separate approval)
1. Permission helper + old-key mapping + audit table (adds things only).
2. Server checks on all finance actions, including `post_journal`.
3. Admin UI tick-boxes + presets + warnings.
4. Mobile and deep-link gating; EFT approver attribution from audit events.
5. Optional: moderator change; retire broad keys.
