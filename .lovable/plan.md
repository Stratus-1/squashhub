# Tournament Builder compatibility audit (read-only)

## Decision now
Do **not** enable creation or publishing from Riverside's Step by Step setup yet. The guided answers are kept under a per-club key on one device, not in a tournament draft or live tournament; there is currently no conversion into the Current Builder. A direct create would not safely round-trip through the existing editor. Riverside's two server-side Beta guide drafts are separate from this device-local Step by Step setup, so their contents cannot establish the exact answers on Willem's device.

## Audit deliverable
Produce a field-by-field compatibility matrix for tournament owner/basics; discipline and inheritance; categories/subcategories; standard/Bells scoring and overrides; eligibility, players, invitations, messaging; partner and fee rules; dates/courts; and downstream pools, playoffs, fixtures and scheduling. For each choice, mark one of: **1** already supported; **2** data supports it but current editing is missing/awkward; **3** no lossless representation; **4** conflicts with current assumptions. Distinguish the normal Tournaments editor from Beta's existing Current Builder and the separate structured post-creation editor.

Use the Riverside club context and its existing tournaments/drafts as read-only examples. Do not inspect or expose private member records, change another club's data, or assume access to Willem's device-local guided answers. Explicitly distinguish a field existing in a draft, in the live tournament row, and in downstream registration/payment/scheduling behavior. State the round-trip answer and blockers before any activation.

## Preliminary verified risks to document
- The normal Tournaments editor writes the `club_champs` compatibility view over the shared `tournaments` record and hydrates per-division scoring, discipline and invitations, but its top-level partner mode and fee are single tournament values. Beta Current Builder instead saves a separate structured definition and can create `builder_spec`, divisions and stages. These paths are not interchangeable merely because they share a record.
- Guided category/subcategory scoring resolves within local state; legacy per-division scoring exists, but the Beta `TournamentDefinition` scoring model is tournament/stage based rather than a direct keyed category/subcategory override. Mapping and reopen behavior require an explicit test; do not flatten silently.
- Existing invitation channels/messages and one fee can be mapped in the Beta converter, but independent doubles-entry/payment permissions and varying per-group player/pair fees have no verified lossless live mapping. "Decide later" must remain distinguishable from No.
- Structured tournaments branch into their own operation page and editor; the normal tournament wizard is not verified to safely edit structured specs. The post-creation editor currently handles structure, dates, owner summary and courts with safeguards, not the complete guided configuration.

## Safest integration proposal to evaluate
1. Keep both setup interfaces as projections/editors of one versioned tournament definition, with stable IDs for categories/subcategories/divisions. Resolve tournament → category → subcategory choices into effective per-competition settings through one tested adapter; do not treat display labels as keys.
2. Add any missing, explicitly defined registration/fee/partner and invitation configuration to the authoritative model, with tenant-scoped access, migration, RLS/grants, read/write UI and server-side enforcement. Specify changes only; **do not migrate yet**. Preserve historical paid registrations, audit records and undecided states.
3. Route creation through the existing validated structured-engine/service path, not a second generator. Require strict lossless mapping and reverse-hydration/round-trip tests for both builders; unsupported options block Create instead of being dropped or guessed. Give the normal editor a structured-aware edit path or a clearly linked common editor before launch.
4. Gate actual creation, invites, payments, fixture generation and publication until the full Riverside dry-run is shown to reopen/edit/manage correctly, with scoring, court/date, entry and permission checks and no writes to other clubs.

## Technical verification
Read the normal wizard's save/reload path, Beta definition/converter/create path, structured editor and match/registration consumers. Compare actual `tournaments`/`club_champs` view fields and related division, stage, governance, venue, entry and fee tables with Riverside records (read-only). Record a concrete expected → saved → reopened → operational mapping for every matrix row, calling out any unverified runtime behavior rather than asserting it.

**Scope:** audit and integration recommendation only. No source, database, data, migration, invitation, payment or deployment changes.
