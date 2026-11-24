/**
 * Tournament eligibility — "Who may enter".
 *
 * The eligible population is derived from the Super Admin federation
 * hierarchy (federation → associations → clubs → members), never from
 * hard-coded country or club lists:
 *
 *  - `club`        → members of the owning club only.
 *  - `association` → members of every club affiliated to the owning
 *                    association (any depth below it).
 *  - `open`        → every member under the tournament's federation, which
 *                    explicitly includes clubs that are not affiliated to any
 *                    association.
 *
 * This mirrors the server-side functions `tournament_eligible_club_ids()` /
 * `is_member_eligible_for_tournament()` so the UI and the database agree.
 *
 * Eligibility is NOT invitation: it only defines who *may* enter. Who is
 * actually invited (or whether members self-register) is configured on the
 * Entry & fees / Players steps.
 */

export type EligibilityScope = "club" | "association" | "provincial" | "zone" | "open";

export interface OrgRow {
  id: string;
  kind: string;
  name: string;
  club_id: string | null;
  is_internal_league?: boolean | null;
  /** Linked league-association row — the key ranking snapshots are filed under. */
  league_association_id?: string | null;
}

export interface RelRow {
  parent_org_id: string;
  child_org_id: string;
  effective_to?: string | null;
}

/** A tenant can have many league rows; only the one linked to its association organisation owns its Federation tree. */
export function associationOrgForTenant(
  leagueIds: string[],
  orgs: Pick<OrgRow, "id" | "kind" | "league_association_id">[],
): string | null {
  const ids = new Set(leagueIds);
  return orgs.find((o) => o.kind === "association" && !!o.league_association_id && ids.has(o.league_association_id))?.id ?? null;
}

const activeRels = (rels: RelRow[]) =>
  rels.filter((r) => !r.effective_to || new Date(r.effective_to) >= new Date());

/** All organisation ids at or below `rootId`. */
export function orgDescendants(rootId: string, rels: RelRow[]): Set<string> {
  const live = activeRels(rels);
  const out = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const r of live) {
      if (out.has(r.parent_org_id) && !out.has(r.child_org_id)) {
        out.add(r.child_org_id);
        added = true;
      }
    }
  }
  return out;
}

function ancestorChain(orgId: string, rels: RelRow[]): string[] {
  const live = activeRels(rels);
  const chain: string[] = [];
  const seen = new Set<string>([orgId]);
  let frontier = [orgId];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of live) {
        if (r.child_org_id === id && !seen.has(r.parent_org_id)) {
          seen.add(r.parent_org_id);
          chain.push(r.parent_org_id);
          next.push(r.parent_org_id);
        }
      }
    }
    frontier = next;
  }
  return chain;
}

/** Nearest real association at or above `orgId` (internal league orgs skipped). */
export function owningAssociation(orgId: string | null, orgs: OrgRow[], rels: RelRow[]): OrgRow | null {
  if (!orgId) return null;
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const self = byId.get(orgId);
  if (self && self.kind === "association" && !self.is_internal_league) return self;
  for (const id of ancestorChain(orgId, rels)) {
    const o = byId.get(id);
    if (o && o.kind === "association" && !o.is_internal_league) return o;
  }
  return null;
}

/** Nearest national body above `orgId`, falling back to the only federation. */
export function federationRoot(orgId: string | null, orgs: OrgRow[], rels: RelRow[]): OrgRow | null {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  if (orgId) {
    const self = byId.get(orgId);
    if (self?.kind === "national") return self;
    for (const id of ancestorChain(orgId, rels)) {
      const o = byId.get(id);
      if (o?.kind === "national") return o;
    }
  }
  return orgs.find((o) => o.kind === "national") || null;
}

/**
 * Nearest zone body above `orgId`, walking up through junior groupings only
 * (never the senior affiliation tree). Used to show a junior body's master zone.
 */
export function parentZoneOf<T extends Pick<OrgRow, "id" | "kind">>(orgId: string | null, orgs: T[], groupings: GroupingRow[]): T | null {
  if (!orgId) return null;
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const seen = new Set<string>([orgId]);
  let frontier = [orgId];
  while (frontier.length) {
    const direct = groupings.find((r) => r.mode === "include" && frontier.includes(r.child_org_id) && byId.get(r.parent_org_id)?.kind === "zone");
    if (direct) return byId.get(direct.parent_org_id) ?? null;
    const next: string[] = [];
    for (const r of groupings) {
      if (r.mode !== "include" || !frontier.includes(r.child_org_id) || seen.has(r.parent_org_id)) continue;
      seen.add(r.parent_org_id);
      next.push(r.parent_org_id);
    }
    frontier = next;
  }
  return null;
}

/** Junior/provincial grouping link (separate from the senior affiliation tree). */
export interface GroupingRow {
  parent_org_id: string;
  child_org_id: string;
  mode: "include" | "exclude" | string;
}

/**
 * Organisation ids inside a zone/provincial grouping: grouping levels, the full affiliation tree of each
 * included association, included clubs, minus clubs excluded at any grouping level.
 * Mirrors DB `org_grouping_descendants`.
 */
export function groupingOrgIds(rootId: string, orgs: Pick<OrgRow, "id" | "kind">[], rels: RelRow[], groupings: GroupingRow[]): Set<string> {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const g = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const r of groupings) {
      if (r.mode === "include" && g.has(r.parent_org_id) && !g.has(r.child_org_id)) {
        g.add(r.child_org_id);
        added = true;
      }
    }
  }
  const levels = [...g].filter((id) => ["zone", "provincial"].includes(byId.get(id)?.kind ?? ""));
  const excluded = new Set(groupings.filter((r) => r.mode === "exclude" && levels.includes(r.parent_org_id)).map((r) => r.child_org_id));
  const out = new Set<string>(levels);
  for (const id of g) {
    const k = byId.get(id)?.kind;
    if (k !== "association" && k !== "club") continue;
    // A directly grouped club wins over an exclude (club moved on its own to another provincial).
    orgDescendants(id, rels).forEach((d) => { if (d === id || !excluded.has(d)) out.add(d); });
  }
  return out;
}

/** Club ids (tenant clubs) inside a grouping. */
export function groupingClubIds(rootId: string, orgs: OrgRow[], rels: RelRow[], groupings: GroupingRow[]): string[] {
  const within = groupingOrgIds(rootId, orgs, rels, groupings);
  const ids = new Set<string>();
  orgs.forEach((o) => { if (o.kind === "club" && o.club_id && within.has(o.id)) ids.add(o.club_id); });
  return [...ids];
}

export interface ResolvedEligibility {
  clubIds: string[];
  /** Body the scope refers to — the club, the association or the federation. */
  scopeOrgName: string | null;
}

/**
 * Resolve the eligible club ids for a scope.
 * `ownerOrgId` is the body running the event; `clubId` the host club.
 */
export function resolveEligibleClubs(args: {
  scope: EligibilityScope | string;
  clubId: string | null;
  ownerOrgId: string | null;
  orgs: OrgRow[];
  rels: RelRow[];
  clubNames?: Map<string, string>;
  allClubIds?: string[];
  groupings?: GroupingRow[];
}): ResolvedEligibility {
  const { clubId, orgs, rels, clubNames, allClubIds, groupings = [] } = args;
  const scope = (args.scope || "club") as EligibilityScope;
  const byId = new Map(orgs.map((o) => [o.id, o]));

  let ownerOrgId = args.ownerOrgId;
  if (!ownerOrgId && clubId) {
    ownerOrgId = orgs.find((o) => o.kind === "club" && o.club_id === clubId)?.id || null;
  }

  if (scope === "club") {
    const ownerClub = ownerOrgId ? byId.get(ownerOrgId)?.club_id ?? null : null;
    const ids = Array.from(new Set([clubId, ownerClub].filter(Boolean) as string[]));
    return { clubIds: ids, scopeOrgName: (clubId && clubNames?.get(clubId)) || null };
  }

  if (scope === "provincial" || scope === "zone") {
    // Grouping scopes resolve only through an owning zone/provincial body; otherwise fail closed to the host club.
    const owner = ownerOrgId ? byId.get(ownerOrgId) : undefined;
    let grp: OrgRow | undefined;
    if (owner && owner.kind === scope) grp = owner;
    else if (owner?.kind === "provincial" && scope === "zone") {
      const parent = groupings.find((r) => r.mode === "include" && r.child_org_id === owner.id && byId.get(r.parent_org_id)?.kind === "zone");
      grp = parent ? byId.get(parent.parent_org_id) : undefined;
    }
    if (!grp) return { clubIds: clubId ? [clubId] : [], scopeOrgName: (clubId && clubNames?.get(clubId)) || null };
    return { clubIds: groupingClubIds(grp.id, orgs, rels, groupings), scopeOrgName: grp.name };
  }

  if (scope === "association") {
    const assoc = owningAssociation(ownerOrgId, orgs, rels);
    if (!assoc) {
      return {
        clubIds: clubId ? [clubId] : [],
        scopeOrgName: (clubId && clubNames?.get(clubId)) || null,
      };
    }
    const within = orgDescendants(assoc.id, rels);
    const ids = new Set<string>();
    orgs.forEach((o) => {
      if (o.kind === "club" && o.club_id && within.has(o.id)) ids.add(o.club_id);
    });
    // The organiser's club or association tenant is not automatically a
    // regional entrant club; the Federation tree alone determines this set.
    return { clubIds: Array.from(ids), scopeOrgName: assoc.name };
  }

  // open — federation-wide, including unaffiliated clubs
  const root = federationRoot(ownerOrgId, orgs, rels);
  const within = root ? orgDescendants(root.id, rels) : new Set<string>();
  const live = activeRels(rels);
  const ids = new Set<string>();
  orgs.forEach((o) => {
    if (o.kind !== "club" || !o.club_id) return;
    const affiliated = live.some((r) => r.child_org_id === o.id);
    if (within.has(o.id) || !affiliated) ids.add(o.club_id);
  });
  // clubs with no organisation row at all are still federation members
  const mapped = new Set(orgs.map((o) => o.club_id).filter(Boolean) as string[]);
  (allClubIds || []).forEach((cid) => {
    if (!mapped.has(cid)) ids.add(cid);
  });
  if (clubId) ids.add(clubId);
  return { clubIds: Array.from(ids), scopeOrgName: root?.name || null };
}

export function eligibilityLabel(scope: string): string {
  if (scope === "club") return "Members of the owning club";
  if (scope === "association") return "Members of the owning association";
  if (scope === "provincial") return "Clubs in the owning provincial association";
  if (scope === "zone") return "Clubs in the owning zone";
  return "Open to everyone";
}
