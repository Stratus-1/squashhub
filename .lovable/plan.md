# NSA member sync — allocation, linking & active state

Extends the existing **Sync members from NSA** flow on Super Admin → Leagues → Members so that the synced roster does more than just populate the platform table.

## What changes

### 1. Admin Members tab — grouped view
Instead of a flat list, group `platform_league_members` rows for the active association as:

```text
NSA Club (e.g. Killarney Country Club)
├─ Team KIL1     [Active 7 · Inactive 1]
│   • Smith, John          KIL1   ACTIVE   12 matches   ✓ linked to club_member
│   • …
└─ Team KIL2
    • …
Unallocated / no team
└─ …
```

- Collapsible per club, per team.
- Each row shows: name, NSA code, team, status (`ACTIVE`/`INACTIVE`), matches played, and a small badge if the NSA member is **linked** to a `club_members` row in the platform (via NSA number).
- Filters: search, status (Active / Inactive / All), club.

### 2. Sync edge function — extended behaviour

After upserting NSA players into `platform_league_members`, the function now:

**a. Active / inactive flag (NSA roster ⇒ club_members)**
- For every `member_association_affiliations` row pointing at this association:
  - If its `league_association_number` is in this season's NSA roster → `active = true`, `deactivated_at = null`.
  - If it is **not** in the roster → `active = false`, `deactivated_at = now()`. Member is still listed (we never delete the affiliation — per existing rule).
- Same flag mirrored on `platform_league_members.user_state` (`ACTIVE` if on roster, `INACTIVE` if previously synced but no longer present).

**b. Auto-link & team allocation (only when a club_member exists)**
- For each NSA player code:
  - Look up `club_members` via `member_association_affiliations.league_association_number = user_code` for this association.
  - If found:
    - Mark affiliation `active = true`.
    - Find the matching local `leagues` row by `nsa_team_id` (the NSA team id we got from `team.php`). If present, upsert `member_league_registrations(club_member_id, league_id)` so the player is allocated to their team for this season.
  - If not found:
    - **Do not** auto-create a `club_members` row. The NSA player stays only in `platform_league_members` until a club admin (or self-signup with that NSA number) creates the local member.

**c. Result summary** in the banner is extended:
`13 added · 4 updated · 2 deactivated · 9 linked · 5 allocated to teams · 31 unchanged`

## Out of scope
- No auto-creation of `club_members` from NSA roster.
- No NSA-side writes (this is read-only sync).
- No change to the fixtures sync function.

## Technical details

**Edge function `supabase/functions/nsa-sync-members/index.ts`** (extend existing):
1. After current upsert into `platform_league_members`, build `Set<user_code>` of roster.
2. Query all `member_association_affiliations` for this `association_id` joined via `league_associations.platform_association_id` to find affiliations belonging to clubs linked to this NSA association.
3. Diff against roster set:
   - In roster → `update active=true, deactivated_at=null`.
   - Not in roster → `update active=false, deactivated_at=now()`.
4. For each NSA player with a matching affiliation, look up `leagues` row where `nsa_team_id = <player's team id>` and `club_id = <affiliation's club_id>`; upsert into `member_league_registrations` (`onConflict: club_member_id,league_id`, no overwrite of `is_captain`/`is_reserve`).
5. Also set `platform_league_members.user_state = 'INACTIVE'` for codes previously stored under this association but absent from the new roster (no delete).

**Admin UI `src/pages/admin/SuperAdminLeagues.tsx`** Members tab:
- Add `useMemo` grouping `platform_league_members` by `club_name → affiliation (team code)`.
- Render collapsible `<Accordion>` per club, then per team. Status badges from `user_state`. "Linked" badge resolved via a single query joining `member_association_affiliations` on `(association_id, league_association_number)` to get linked club_member ids.
- Keep the search + Sync button bar at the top.

No DB schema changes required — all needed columns (`active`, `deactivated_at`, `user_state`, `nsa_team_id`) already exist.
