# Regional tournaments: owner, audience and venues

## A. What exists today, and where it breaks

Verified against the live schema, the wizard code and current data.

What already works:
- `tournaments.owner_org_id` exists and is set on 36 of 37 tournaments; 2 are owned by an association/national body.
- `tournament_governance.eligibility_scope` holds `club | association | open`, and `src/lib/tournaments/eligibility.ts` resolves the eligible clubs from the organisation tree (`organisations` + `organisation_relationships`), not from a hard-coded list.
- `tournament_venues` exists (tournament, club, `court_ids`, `is_primary`, `host_fee_cents`, `host_share_pct`, notes) with 38 rows.
- Courts are pooled across venue clubs in the wizard and prefixed with the club name.
- A database trigger `prevent_overlapping_bookings` blocks overlaps per court across every source, so tournament blocks and ordinary bookings already cannot collide.

Where it breaks:
1. **Owner is not asked for.** In club/association context `TournamentPlanner` passes `ownerOrgId = null`; the owner is only inferred. An NSA event is therefore filed under the NSA tenant club row rather than explicitly "Owned by Northern Squash Association".
2. **Two venue lists.** The wizard writes venues into `tournaments.participating_club_ids`; the Governance dialog writes them into `tournament_venues`. They never sync — currently 0 tournaments have `participating_club_ids` while 38 `tournament_venues` rows exist. Hosting fees are therefore attached to venues the schedule does not know about.
3. **Two club lists for an association.** Eligibility uses the organisation tree; the venue picker uses `association_affiliated_clubs`. For NSA those disagree: 46 affiliated clubs vs 22 club children in the tree.
4. **Per-venue court choice is coarse.** The wizard keeps one flat `court_ids` array, so "2 courts at PCC, 4 at Uitsig" is expressible but not presented or stored per venue; `tournament_venues.court_ids` is never used by the scheduler.
5. **Bookings are filed under the wrong club.** Tournament court blocks are inserted with `club_id: clubId` (the organiser) even when the court belongs to another club. The host club's own booking grid, lights automation and RLS-scoped views do not see them. Overlap protection still holds (it is court-based), but ownership is wrong.
6. **Audience labelling.** "Regional" in the dropdown never names the association on the setup step.

## B. Hierarchy tables to reuse (no new club lists)

- `organisations` (`kind` national/association/club, `club_id`, `league_association_id`, `active`)
- `organisation_relationships` (`parent_org_id`, `child_org_id`, `effective_to`)
- `clubs`, `courts` (`club_id`, `is_external`, `venue_name`)
- `club_members` / `people` for entrants
- `tournaments`, `tournament_governance`, `tournament_venues`, `tournament_rules`
- `organisation_admins` for scoped permissions

## C. Owner and audience resolution

- Owner = `tournaments.owner_org_id`, always explicit and always an `organisations` row. Preselected from context: club admin → that club's org; association tenant → its association org; super admin → chooser.
- Audience stays `tournament_governance.eligibility_scope`, resolved through the owner:
  - `club` → the owner club's members.
  - `association` → clubs beneath the owner association in the tree (falls back to the nearest association above the owner).
  - `open` → federation-wide, including unaffiliated clubs (existing behaviour in `resolveEligibleClubs`).
- An association owner with an `open` audience is valid and must keep working: the owner drives admin scope, branding and money; the audience drives who may enter.
- **Tree reconciliation:** for an association tenant, eligible and host-club candidates come from the union of the organisation tree and `association_affiliated_clubs`, with an admin warning listing affiliated clubs missing from the tree, so the tree can be corrected rather than bypassed.
- Entrants de-duplicate by `person_id` first, `club_members.id` second.

## D. Venue and court model

`tournament_venues` becomes the single source of truth.
- Wizard venue step reads and writes `tournament_venues` (club, `court_ids` chosen from that club's real `courts`, `is_primary`, hosting fields).
- `tournaments.participating_club_ids` and `tournaments.court_ids` are kept in sync on save as derived mirrors so every existing scheduler, capacity and invite code path keeps working unchanged.
- Host-club candidates are the owner's scope; an explicit "Use a venue outside this scope" toggle allows an out-of-scope club, recorded in the venue's notes.
- No tournament-only court records are created; external venues keep using `courts.is_external` / `venue_name`.

## E. Multi-venue scheduling and bookings

- Fixtures already carry `court_id`; the venue club is derived from the court, so no schema change is required for fixtures.
- Court blocks and per-match bookings are inserted with the **court's** `club_id` instead of the organiser's, and the tournament external id stays `champ:<id>:...` so cleanup still works. Delete/cleanup queries drop the `club_id` filter and match on `external_id` only.
- Existing `prevent_overlapping_bookings` continues to guarantee no double-booking against ordinary bookings, events and closures.
- Venue name shown next to the court in admin schedule, player fixture cards, notifications and booking instructions whenever the tournament has more than one venue.

## F. Hosting fees

Existing fields already carry it: `tournament_venues.host_fee_cents` and `host_share_pct`, and the Governance dialog's fee split already subtracts host compensation from entry revenue.
- Keep the model simple and extensible: add `host_fee_basis` (`fixed | per_court_hour | per_day`) plus `host_fee_qty`, computing an effective amount; `fixed` remains the default so nothing changes for existing rows.
- Move the venue/fee editor into the wizard venue step (the Governance dialog keeps it as the audit/finance view).
- **No GL postings in this phase.** The existing tournament finance view is a split calculator, not a ledger posting path; posting a venue-hosting payable into `club_journal_entries` needs its own review of the payable/receivable pattern and is proposed as a follow-up once this structure lands.

## G. Permissions

- Owner org admins (via `organisation_admins`) get full tournament admin for their own events and may browse clubs/members beneath them for eligibility and venues.
- Host club admins get venue-only rights: their own courts, their own fixtures/schedule, their own hosting fee line. No access to NSA-wide member or admin data.
- Club admins never inherit association scope from hosting.
- Federation admins keep their existing broader scope. Enforcement stays server-side in RLS/RPC; UI gating mirrors it.

## H. UI changes

First setup step becomes explicit:
1. Tournament name
2. Tournament/event type (existing `event_type`, unchanged semantics)
3. **Organised by** — named organisation, e.g. "Northern Squash Association (NSA)", preselected from context, changeable only with permission
4. **Who may enter** — options filtered by owner and type, with the association named rather than the word "Regional", plus the live eligible-player count

Later steps:
5. **Venues** — add one or more host clubs from the owner's scope
6. **Courts per venue** — each venue lists its real courts with tick boxes and a per-venue hosting fee

## I. Migration and compatibility

- Backfill `tournament_venues` from existing `tournaments.club_id` (primary) and `participating_club_ids`.
- Backfill each venue's `court_ids` from `tournaments.court_ids` filtered to that club's courts.
- `tournaments.club_id` keeps its current meaning (home/primary tenant record) — it is not redefined as owner.
- Backfill `owner_org_id` where null from the club's organisation row.
- Existing club tournaments render identically: one venue, one club, same courts.

## J. Acceptance tests

1. NSA owns a regional tournament, PCC the only venue — owner shows NSA, courts are PCC's.
2. NSA owns a tournament with PCC and Uitsig — each venue exposes only its own courts (2 and 4), schedule shows venue names.
3. Regional audience under NSA lists clubs and members from the tree (with the affiliation mismatch warning where it applies).
4. National owner with national audience resolves federation-wide including unaffiliated clubs.
5. Club-owned members-only tournament behaves exactly as today.
6. Regional owner with an Open audience accepts entries from outside NSA.
7. Host club admin cannot read NSA-wide member or admin data.
8. A tournament block on a PCC court is rejected when an ordinary PCC booking overlaps, and vice versa.
9. Tournament bookings on a PCC court appear in PCC's own booking grid.
10. Backfill leaves every existing tournament's schedule and courts unchanged.
