# Scope-aware tournament invitations

Rework "who may enter" (Step 1) and "who gets invited" (Invite step) so the two read as one ladder: Club → Regional league → National/International, with a proper selection tree at every level.

## 1. Step 1 wording (participation, not ownership)

Rename the three eligibility scopes (stored values `club` / `association` / `open` stay unchanged):

| New label | Hint |
|---|---|
| Club members | Members of this club only. |
| Regional league | Every club that plays in the regional leagues/associations this club takes part in. |
| National & international | Every club under the federation, plus visiting/unaffiliated entrants. |

"Owning" disappears from the copy everywhere it appears (Step 1, invite step, review, governance dialog). A club that only *participates* in a regional league (e.g. CSIR in the NSA league) gets the full regional list — participation, not ownership, decides the pool.

## 2. Invite step: options follow the chosen scope

The invite audience choices are rebuilt per scope instead of one fixed list of three.

**Club members**
- All club members (open invitation)
- League teams — existing league/team tree, all or partial
- Selected individual members

**Regional league**
- Everyone in the region
- Clubs — tree of the clubs in the regional league(s) this club plays in; tick a club to invite all its members, expand to tick individuals
- League teams — the regional league → division → team tree
- Selected individual members (search across the whole region)

**National & international**
- Everyone in the federation
- Full tree: Association → Club → Members; ticking a node selects everything under it, expanding lets you refine
- Selected individual members (search across the federation)

Behaviour that stays the same: choosing an audience never sends; visitors, resigned/suspended and placeholder rows are always excluded and reported in the "excluded" line; contact details are never shown to the organiser; SquashHub delivers the invite server-side.

Each level shows a live count ("Riverside — 24 members, 3 already registered") so an organiser can sanity-check the send before it happens.

## 3. Technical notes

- `invite-audience.ts`: add `clubs` and `orgs` modes; `resolveInviteAudience` gains club-id / org-id expansion and keeps the existing exclusion and summary contract. Existing tests stay green; new cases added for the two new modes.
- New `src/lib/tournaments/invite-scope-tree.ts` — builds the Association → Club → Member tree, handles partial (indeterminate) tick state, and returns the flattened member id set.
- New security-definer RPC `tournament_invite_scope_tree(p_tournament_id, p_club_id, p_scope)` returning association id/name, club id/name, active member count and already-registered count. It reuses `scope_eligible_club_ids` and `can_manage_tournament`, so it exposes no data the organiser cannot already reach, and it returns counts only — no member rows, no contact fields.
- `tournament_invite_directory` gains optional `p_club_ids` / `p_org_ids` filters so the individual search can be narrowed to the ticked branch. Safe projection and the forbidden-field guard are unchanged.
- `scope_eligible_club_ids` is verified to resolve associations by *participation* (affiliated clubs), and fixed there if it currently keys off ownership only.
- UI: a reusable `InviteScopeTree` component used by both the regional and national modes, rendered inside the existing invite panel in `ClubChampsTab.tsx` — mobile-first, collapsible nodes, no layout change to the rest of the step.
