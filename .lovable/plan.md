## Allow members to be reserves AND a team player + add search

### Today's behaviour (in `AllocatePlayersDialog`, `src/components/club-admin/LeaguesTab.tsx`)
- The left-hand **Available Players** pool only lists members **not in any league** (`unassignedMembers = genderMembers.filter(m => !assignedMemberIds.includes(m.id))`).
- Dragging a player from a team league to a reserves league **moves** them (removes the source row).
- No search field — admins scroll a long list to find a player.

### Goal
- A member may appear in **at most one team (non-reserves) league** in the group, **plus** one or more **reserves** lists.
- Admin can always grab any eligible member from the pool and drop them into a reserves zone — even if they're already on a team.
- Accidental placement into two team leagues stays blocked (toast + revert).
- A **search box** filters the Available Players pool live by name.

### Changes (UI-only, scoped to `AllocatePlayersDialog`)

1. **Available Players pool**
   - Always show every eligible `genderMembers` entry whose member id is **not already in another pool slot**.
   - Members already placed on a team get a small `Team N` badge in the pool row so admin sees they're being added as a duplicate (destined for reserves).
   - Add a `<Input>` search field at the top of the pool (icon + placeholder "Search players…"); filter rows on `name` / `profiles.name` (case-insensitive). Persist the term in local state only.

2. **Drag from pool → reserves league**
   - If the member already exists in a team league of this group → **copy** the row into the reserves league (don't remove from team).
   - If the member already exists in another reserves league → still allow (a player can be reserve in multiple reserve tiers).

3. **Drag from pool → team league**
   - If the member already exists in **another team (non-reserves) league** of this group → block with toast: *"<Name> is already on <League>. Remove them from that team first."*
   - If they only exist in reserves → allow (this is a promotion).

4. **Drag between leagues (existing `handleDragEnd`)**
   - Source = reserves, target = reserves → unchanged (move).
   - Source = reserves, target = team → unchanged (existing promote/demote-swap behaviour preserved).
   - Source = team, target = reserves → **copy** instead of move (player remains on their team; a new reserves row is created). Existing `checkReserveMoveAllowed` envelope still applies.
   - Source = team, target = team (different) → keep existing move semantics; leave any reserves rows for that member untouched.

5. **Save (`handleSave`)**
   - No schema change needed — `member_league_registrations` already has composite key `(club_member_id, league_id)` and the upsert uses that conflict target.
   - Add a pre-save guard: if any member_id appears in more than one **non-reserves** league within `leagueData`, abort with a toast naming the conflict.
   - Per-league dedupe (`seen` set) stays as-is.

6. **Header copy** — update the instruction line under the title to:
   *"Drag players into leagues or between positions. A member can be in one team **and** one or more reserves lists — drag from the pool onto a reserves zone to add them as a reserve even if they're already on a team."*

### Technical detail
- `assignedMemberIds` is renamed to `teamAssignedMemberIds` (only counts non-reserves leagues) for the pool filter, plus a separate `reservesByMember` map for the per-league dedupe display.
- New helper `findTeamLeagueOfMember(memberId)` returns the league id (if any) where the member is currently placed in a non-reserves slot — used by both the pool badge and the two-teams guard.
- All drag handlers gain a `copyInsteadOfMove` branch based on `sourceIsTeam && targetIsReserves`.
- Search: `const [poolSearch, setPoolSearch] = useState("")`, filter `unassignedMembers` (the new "displayable pool") by `name.toLowerCase().includes(poolSearch.trim().toLowerCase())`. Empty term = show all.

### Out of scope
- No DB migration, no edge function change, no schema change.
- Weekly Fill-Up Leagues tab is unchanged (it builds bench rosters from registrations, so the extra reserve rows show up automatically).
- Other gender groups / other associations not in the dialog at the time are untouched.