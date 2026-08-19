# Tournament Governance — single source of truth + readiness gate

Review based on the Governance dialog (`TournamentGovernanceDialog`), the setup wizard (`ClubChampsTab`), and Riverside's live tournament rows.

## What Riverside shows today

- **Riverside Open** (status `planning`): entry fee R0 but `payment_required = true`; sanction status `pending` with a sanctioning body chosen but no sanction reference; federation share 5c and association share 4c on a free event; entries open and close at the *same* minute (18 Aug 23:34); competition level `regional` while the event is owned/run at club level.
- Three older Riverside events: `payment_required = true` on a free Bells evening, no refund policy or cut-off on paid events (R150, R120).

None of this blocked activation, because nothing checks governance before a tournament goes live.

## Duplicated / overlapping controls

| Concept | Wizard | Governance dialog | Verdict |
|---|---|---|---|
| Who may enter (eligibility scope) | editable (Step 1, synced into governance) | editable (Eligibility tab) | Duplicated — two editors, last save wins |
| Entries open / close | editable | read-only summary | Already correct |
| Entry fee, payment required | editable | read-only summary | Already correct |
| Registration mode / entry source / approval gate | editable (new Q1/Q2) | not shown | Correct, but governance should *show* it |
| Payment timing | editable | absent | Governance should show it read-only |
| Age limits, licence required, eligibility notes | absent | editable | Correct |
| Sanctioning (status, authority, reference, notes), competition level | absent | editable | Correct |
| Owning body | Step 1 owner picker | Ownership tab | Duplicated |
| Fee shares, refunds, host venues/host fees | absent | editable | Correct |
| Dates (play dates) | editable (Courts step) | venue rows only | Correct |
| Scoring/rules (points, best-of, handicap, no-show) | editable | absent | Correct |

### Authoritative location (proposed)

- **Wizard owns:** name, format, dates/courts, scoring & rules, entry flow (entry source, confirmation, fee amount, payment timing, payment methods), registration window, invites, partner mode, ranking-points flag.
- **Governance owns:** owning body, competition level, sanctioning block, age limits, licence requirement, eligibility scope, eligibility notes, fee shares (federation/association), host venues & host compensation, refund policy and cut-off, audit history.
- **Changes required to remove double-editing:**
  1. Eligibility scope becomes **governance-owned**. Wizard Step 1 shows it read-only with a "Change in Governance" link (or keeps the editor but writes through the same mutation and drops the separate upsert — pick governance-owned for consistency).
  2. Owning body becomes **governance-owned**; wizard shows the owner as read-only text.
  3. Governance gains a read-only "Entry flow" panel: entry source · confirmation · fee · payment timing · window, each deep-linking back to the wizard step.
  4. Governance `registration_required` / `registration_mode` are never edited in the dialog (already true) — remove them from anything that looks editable and keep them in the audit labels only.

## Governance completeness (calculated, not a checkbox)

A pure function `getGovernanceReadiness(tournament, governance, venues, owner)` returns `{ status: 'complete' | 'needs_attention', missing: Item[], warnings: Item[] }`, where each item has `{ key, label, section: 'ownership'|'eligibility'|'fees'|'venues'|'wizard:registration', severity: 'required'|'warning' }`.

### Required by context

Always required:
- Owning body assigned
- Eligibility scope set
- At least one venue (host club) — required once a draw or schedule exists
- Play dates set (start/end)

Association / regional / national (competition level ≠ club, or owner is association/federation):
- Competition level
- Sanction status; if `pending` or `approved`: sanctioning authority; if `approved`: sanction reference
- Refund policy (and cut-off date when policy is not "No refunds")

Paid events (`entry_fee_cents > 0`):
- At least one payment method
- Refund policy (cut-off required unless "No refunds")
- Fee shares must not exceed the entry fee (already computed by `computeFeeSplit.overAllocated`)
- Payment timing set

Free events (`entry_fee_cents = 0`):
- Warn if `payment_required = true`, or if federation/association shares are non-zero (exactly Riverside Open's state)

Self-entry / open registration (`entry_source = self`):
- Entries open and close both set, close strictly after open
- Entries close on or before the start date (warning if after)

Organiser-selected / invite (`entry_source = admin` or `team_manager`):
- At least one invite delivery method
- At least one player on the entry list before invites are sent

Age / licence restrictions:
- If min or max age set: both must be sane (min < max) and eligibility notes recommended (warning)
- If licence required: sanctioning authority required (a licence check needs a body that issues it)

Approval gate on (`approval_gate = admin_accept`) or payment after acceptance:
- Confirmation contact channel present (invite method or email) — warning only

### UI: Governance status card

Placed at the top of the Governance dialog and as a compact strip on the tournament card in the tournaments list:

```text
Governance — Riverside Open              [Needs attention · 4 items]
 x  Sanction reference missing            -> Ownership
 x  Entries close must be after open      -> Setup - Who plays & what it costs
 !  Free event but shares are set (R0.09) -> Fees & refunds
 !  Payment required is on for a free event -> Setup - Who plays & what it costs
```

- Green "Complete" badge with a one-line summary when nothing is outstanding.
- Every row is a button that opens the owning tab (or opens the wizard on the right step).
- Same card rendered read-only inside the wizard Review step so the admin sees the blockers before pressing Generate.

### Hard block vs warn

| Action | Behaviour |
|---|---|
| Save draft / edit wizard | Never blocked |
| Open registration (entries become visible/enterable) | Hard block on required items |
| Send invites | Hard block on required items + at least one invite method + non-empty list |
| Generate draw / schedule | Hard block on required items |
| Publish / set status `active` | Hard block on required items |
| Set status `completed` | Warn only |
| Any warning-severity item | Toast + confirm dialog listing them; admin can proceed |

Blocked buttons stay clickable and open the status card explaining exactly what is missing (never a silently disabled button with no reason).

## Technical notes

- New file `src/lib/tournaments/governance-readiness.ts` — pure function plus `REQUIRED_BY_CONTEXT` rules, unit-testable with no React.
- New component `src/components/tournaments/GovernanceStatusCard.tsx` — used in the dialog, in the wizard Review step, and (compact variant) on the tournament list card.
- No schema change needed: every rule reads existing `tournament_governance`, `tournament_venues`, `tournaments` and `club_champs` columns, including the recently added `entry_source`, `approval_gate` and `payment_timing`.
- Server-side backstop (optional, phase 2): a `BEFORE UPDATE` trigger on `tournaments` rejecting `status -> 'active'` when the same rules fail, so an API caller cannot bypass the UI.
- Gating hooks: wrap the existing `setChampStatus` mutation, the invite send path, and the Generate Schedule button in a shared `useGovernanceGate(tournamentId)` helper returning `{ ready, missing, requireReady(action) }`.
- The "Who plays and what it costs" step keeps its three questions and gains only a read-only governance summary block (owner · level · sanction · eligibility · refunds) with a "Open governance" link — no new editors.

## Out of scope for this change

Fee-split maths, host compensation rates, and the audit trail stay exactly as they are.
