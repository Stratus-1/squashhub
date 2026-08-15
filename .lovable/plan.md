# Tournaments: one entry point, tabbed wizard, no double entry

Three changes, all in the tournament area. Club-level behaviour keeps working exactly as it does today.

## 1. Club Admin → Tournaments becomes the single tournament page

Today Club Admin → Tournaments renders the wizard directly, while Super Admin → Tournaments renders a planning shell (owning body, primary host club, extra venues) around the same wizard.

Change: extract that shell into one shared `TournamentPlanner` component and use it in both places.

- **Club admin:** owning body is fixed to the club's own organisation and shown as a read-only line (no selector). Primary host club is the club itself. The "additional venues & entrant pool" block is hidden unless the user is a federation/association admin, so a normal club sees the exact same wizard it sees now, just under a consistent header.
- **Federation / association users:** the same page shows the owning-body selector (bodies they may manage), host club and multi-venue picker — i.e. what Super Admin → Tournaments does now.
- Super Admin → Tournaments keeps working; it renders the same shared component with full selectors.
- Later (not this change): a separate "Federation" / "Regional association" tile on the dashboard that lands on this same page with the owning body preselected. Noted in the docs, not built yet.

## 2. Wizard steps become clickable tabs

The step strip (Category › Courts › Registration › Players › Leagues › Schedule › Review) becomes a real tab bar:

- Every step is clickable at any time and jumps straight there, using the existing `goToStep` (which already auto-seeds groups and autosaves the draft).
- Current step highlighted; completed steps get a subtle tick. Steps that cannot be reached yet (e.g. Leagues before players exist) stay clickable but show the same "missing fields" hint the Next button already produces, instead of blocking navigation.
- Back / Next buttons stay at the bottom for linear use.

## 3. Remove the double entry between Governance and the wizard

Fields that currently exist in both the wizard's Registration step and the Governance dialog: **entry fee**, **entries open**, **entries close**, **payment required**.

Split of ownership (one place each):

| Field | Owner after this change |
|---|---|
| Entry fee, registration opens/closes, payment required, accepted payment methods | **Wizard → Registration step** (where the club already works) |
| Federation share, association share, host-venue compensation | **Governance → Fees** |
| Refund policy and refund cut-off | **Governance → Fees** |
| Sanctioning authority/status/reference, competition level | **Governance → Ownership** (association/federation only, already hidden for clubs) |
| Who may enter, age limits, licence requirement, eligibility notes | **Governance → Eligibility** |
| Scoring format, draw type, standard of play, best-of | **Rules dialog** |
| Name, dates, courts/time slots, players, leagues, schedule | **Wizard** |

In Governance, the duplicated fee/date fields become read-only summary lines with an "Edit in the tournament setup" link. In the wizard's Registration step, a short read-only line shows the federation/association/host split and refund policy with a link to Governance. Both surfaces keep reading the same underlying records, so nothing is migrated and no existing data is lost.

## Technical notes

- New `src/components/tournaments/TournamentPlanner.tsx` holding the owning body / host club / extra venue selection currently inline in `src/pages/admin/SuperAdminTournaments.tsx`, plus a `mode` of `club` or `platform`.
- `src/pages/ClubAdmin.tsx` case `"champs"` renders `TournamentPlanner` instead of `ClubChampsTab` directly; `ClubChampsTab` keeps its current props (`clubId`, `ownerOrgId`, `scope`, `participatingClubIds`).
- Step strip in `ClubChampsTab.tsx` (around line 3974) becomes buttons calling `goToStep`.
- `TournamentGovernanceDialog.tsx`: entry fee / entries open / entries close / payment-required inputs replaced by read-only display.
- `docs/PROJECT_STRUCTURE_AND_ISSUE_LOG.md` gets the field-ownership table above plus a note on the planned federation/association dashboard tiles.
