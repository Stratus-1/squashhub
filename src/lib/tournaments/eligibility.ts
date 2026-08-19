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

export type EligibilityScope = "club" | "association" | "open";

export interface OrgRow {
  id: string;
  kind: string;
  name: string;
  club_id: string | null;
  is_internal_league?: boolean | null;
}

export interface RelRow {
  parent_org_id: string;
  child_org_id: string;
  effective_to?: string | null;
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
}): ResolvedEligibility {
  const { clubId, orgs, rels, clubNames, allClubIds } = args;
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
    if (clubId) ids.add(clubId);
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
  return "Open to everyone";
}
