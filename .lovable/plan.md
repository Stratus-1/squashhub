# Junior registration links for junior associations

## Goal
Junior associations (Northerns zone, the four provinces, and regional bodies like Mpumalanga West) build their club list, then send one link to their juniors. A junior (or parent) opens it, picks their club from that association's clubs only, finds their name, and registers. It works like the Uitsig doubles link sent to Kentron players.

## Step by step

**1. Vian checks the club lists (no new screen)**
Vian already sees every junior body's club list in his workspaces. Today: Northerns 64 clubs, Limpopo 24, Mpumalanga 20, North West 13, Vaal Triangle 7. Mpumalanga West has no clubs linked yet, so it needs its clubs added under Mpumalanga before its link is useful.
Each body gets a **Club list confirmed** switch. A link can only be created once the list is confirmed, so links never go out with an unfinished list.

**2. Vian adds the leaders**
In the Northerns workspace, a new **Association leaders** section lets Vian add an admin to any province or regional body below Northerns. He searches existing SquashHub people, or enters a name, email and cell for someone new, who gets an activation email. Province leaders can do the same for regional bodies under them. Nobody can add leaders above their own level or to senior associations.

**3. Leaders create the junior link**
New **Junior registration link** card in each junior workspace: Create link, Copy, Share (WhatsApp), QR code/poster, and Switch off. One link per body. It stays valid until switched off, and switching it off and creating a new one kills the old one. Only clubs in that body's list (including provinces under a zone) can be picked.

**4. What the junior sees (no login needed to start)**
1. Choose club: searchable list of only that association's clubs, plus a **My club isn't listed** option.
2. Find my name in that club's member list. Names show only enough to recognise, for example "Liam V…, U13 Boys".
3. One of three paths, same as the Kentron link:
   - **Already has a SquashHub login:** sign in and confirm. They're marked as a junior squash player straight away.
   - **On the club list, never logged in:** claim the profile and set up a login. Accepted immediately when the NSA number matches; otherwise it waits for approval.
   - **Not on the list:** register as a new junior: name, gender, date of birth, parent or guardian name, cell and email, and consent tick. They join that club as a **pending junior**: not billed, no ladder, no club access, until approved.
4. My club isn't listed: they type the club name and town. The association leaders get a request to add that club to the list.

**5. Approvals and follow-up**
- New juniors and unmatched claims appear in a **Junior registrations** inbox for the club's admins (if the club uses SquashHub) and the association leaders.
- Approving makes them active juniors at that club. Declining removes the pending record.
- Association leaders get one in-app notice per new registration, with no automatic emails to players beyond their own confirmation.
- Date of birth stays private, showing as an age group only. Once someone registers with a DOB, the existing DOB reminders stop for them.

## Not included
- No fees, invoices, licence billing or SportyHQ changes.
- No change to any club's senior association, leagues or ladder.
- No messages to real juniors or leaders until you say so.

## Technical notes
- New tables: `junior_reg_links` (org_id, SHA-256 token hash, active, created_by, audit timestamps), `junior_reg_requests` (claims, new juniors, missing-club requests, status/decision audit), `org_structure_confirmations`. Each has GRANTs, RLS, and no anon table access.
- SECURITY DEFINER RPCs modelled on `tournament_join_*`: `junior_join_context(token)`, `junior_join_find_member(token, club, query)` (masked, rate-limited, club must be in `org_grouping_club_ids(org)`), `junior_join_claim`, `junior_join_register`, `junior_join_missing_club`, plus admin `junior_link_create/revoke`, `junior_reg_decide`, `junior_add_org_admin` (checked by `federation_can_manage_org`, never senior orgs).
- New members: `club_members` with `join_source='junior_link'`, `is_pending_approval=true`, `billing_exempt=true`, `plays_league=false`, no fee category, no ladder slot. DOB goes only to the existing private store, and the junior tick goes via `set_junior_player`.
- Unsigned clubs: a narrow, explicit exception like the tournament link, giving a pending junior record only and no club access.
- Public route `/j/:token` (page `JuniorJoin.tsx`), plus pure `src/lib/juniors/join-flow.ts` with tests for scope, masking and path selection.
- Records: `src/lib/AGENTS.md` rule, issue log entry, `ARCHITECTURE.md` boundary note.
