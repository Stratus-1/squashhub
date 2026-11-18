# One club structure everywhere

## Why the Western Cape clubs showed under the Northern Squash Association
There are currently two separate club lists that don't talk to each other:
- **Super Admin structure** (the tree): who belongs to which association. This is correct for most clubs.
- **The association's own "Affiliated Clubs" list** (what you see when you log in as the association). This was filled by a bulk import on 27–29 August, which wrongly added Western Province, Joburg and other clubs to the Northern Squash Association.

Only two associations have anything in that second list today: Northern Squash Association (now 25 clubs) and Mpumalanga Lowveld (9 clubs). If you log in as Western Province right now, its Affiliated Clubs list is **empty**, even though the Super Admin tree shows 59 clubs under it.

## What changes
1. **One list.** The Super Admin structure becomes the only place that records which association a club belongs to. Each association's "Affiliated Clubs" screen shows exactly its clubs from that structure, so Western Province will see its 59 clubs.
2. **Moving a club updates everywhere.** Dragging a club to another association (in Super Admin, or from the association's own screen) removes it from the old association and adds it to the new one in one step. A club can only be in one senior association at a time.
3. **Who can move clubs:**
   - Super Admin: anywhere.
   - Zone admin (Northerns Junior Squash): within the zone's junior structure.
   - Provincial / regional association admins: can drag a club into their own association, including from another association. The move happens straight away and the old association's admins are notified (in-app and email).
   - Every move asks for confirmation and is recorded (who, when, from where to where).
4. **Association screen gets the same drag-in.** The association's Affiliated Clubs screen gets a "Bring a club in" search (any club, including unlinked ones) and "Move to…" on each club, instead of the current add/delete buttons. Removing a club puts it back into "Clubs with no association", never deletes it.
5. **Junior side stays separate.** A club still has one senior association and, separately, one junior provincial association. Junior moves don't change senior membership and vice versa.

## What stays the same
- Club members, fees, leagues, teams, results and ladders are not touched by a move.
- Existing league registrations and invoices remain with the association they were created under.
- Correctional Services and Riverside: kept as they are until you decide.

## Rollout
- First, every association's list is rebuilt from the Super Admin tree, so each association login shows the same clubs as the tree. The only clubs where the two disagree today are Correctional Services (tree: KZN, list: Northern Squash Association) and Riverside (tree: Regional test); I'll confirm those two with you before switching over.
- Test with Northern Squash Association and Western Province logins on desktop and phone, then publish.

## Technical details
- Source of truth: `organisation_relationships` (affiliation) for senior, `org_groupings` for junior. Association tenant ↔ org resolved via `league_associations.tenant_association_id` → `organisations.league_association_id` (NSA org currently has no `club_id`; link explicitly).
- New SECURITY DEFINER RPC `federation_move_club(club_org, new_parent_org)`: atomic close-old/insert-new relationship, permission check (platform admin, or admin of the target association/provincial/zone), audit row, notification to old parent's admins via the Communications engine.
- `association_affiliated_clubs` kept as a read-compatible mirror maintained by trigger from the structure (readers: `use-association-tenant`, `AffiliatedClubsTab`, `AssociationLeaguesTab`, `LeaguesTab`, `ClubAuth`, `provision-association-member`, platform update campaigns), so existing league/eligibility code keeps working; direct inserts/deletes from the UI removed. Mark as derived in a table comment.
- `useReparentOrg` in Super Admin switched to the same RPC (it currently deletes and re-inserts relationships without audit/notify).
- Tests: move permission matrix, single-senior-parent invariant, mirror sync, junior/senior independence.
- Update `ARCHITECTURE.md`, `src/lib/AGENTS.md` and the issue log.
