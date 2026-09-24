/**
 * Event owner + venue rules for the Beta builder.
 * OWNER (event level + organisation) is separate from AUDIENCE, and
 * EVENT VENUE(S) (where the tournament may be played) is separate from
 * round/fixture court allocation on Schedule, which must stay inside the venue set.
 */
import { allStages, type TournamentDefinition } from "./definition";
import type { EventScope } from "./scope";

export type OrgKind = "club" | "association" | "national";

/** Which organisation kind can own an event at each level. */
export const ORG_KIND_FOR_SCOPE: Record<EventScope, OrgKind> = { club: "club", regional: "association", national: "national" };
export const SCOPE_LABEL: Record<EventScope, string> = {
  club: "Club event", regional: "Regional association event", national: "National federation event",
};
export const OWNER_KIND_FOR_SCOPE: Record<EventScope, "club" | "association" | "federation"> = {
  club: "club", regional: "association", national: "federation",
};

export interface OrgLite { id: string; name: string; kind: OrgKind | string; club_id: string | null }

/** Organisations the user may pick as owner at a level. */
export function ownerChoices(scope: EventScope | null | undefined, permitted: OrgLite[]): OrgLite[] {
  if (!scope) return [];
  return permitted.filter((o) => o.kind === ORG_KIND_FOR_SCOPE[scope]);
}

/** Owner is valid only when an organisation of the right kind is chosen. */
export function ownerValid(def: TournamentDefinition, orgs?: OrgLite[]): boolean {
  const ev = def.event ?? {};
  if (!ev.scope || !ev.ownerId) return false;
  if (!orgs) return true;
  const o = orgs.find((x) => x.id === ev.ownerId);
  return !!o && o.kind === ORG_KIND_FOR_SCOPE[ev.scope as EventScope];
}

/** Clubs under an owner, walking the organisation hierarchy (parent → child). */
export function subordinateClubIds(ownerId: string, orgs: OrgLite[], rels: Array<{ parent_org_id: string; child_org_id: string }>): string[] {
  const seen = new Set<string>([ownerId]);
  const queue = [ownerId];
  while (queue.length) {
    const p = queue.shift()!;
    for (const r of rels) if (r.parent_org_id === p && !seen.has(r.child_org_id)) { seen.add(r.child_org_id); queue.push(r.child_org_id); }
  }
  return orgs.filter((o) => seen.has(o.id) && o.club_id).map((o) => o.club_id!) ;
}

export function eventVenues(def: TournamentDefinition) {
  const v = def.event?.venues;
  return { clubIds: v?.clubIds ?? [], names: v?.names ?? [], mode: v?.mode ?? null };
}

/** At least one venue unless the owner explicitly said none is needed; single mode means exactly one. */
export function venuesValid(def: TournamentDefinition): boolean {
  if (def.event?.noVenue) return true;
  const v = eventVenues(def);
  if (!v.mode || !v.clubIds.length) return false;
  if ((def.event?.venuesStale ?? []).length) return false;
  // Every selected venue must contribute at least one real court.
  if (def.event?.venues?.courtIds && v.clubIds.some((id) => !(def.event!.venues!.courtIds![id]?.length))) return false;
  return v.mode === "single" ? v.clubIds.length === 1 : v.clubIds.length >= 1;
}

/** Schedule entries (defaults + stages) that name a venue outside the event venue set. */
export function venuesOutsideSet(def: TournamentDefinition): Array<{ where: string; venue: string }> {
  const v = eventVenues(def);
  if (def.event?.noVenue || !v.clubIds.length) return [];
  const okIds = new Set(v.clubIds), okNames = new Set(v.names.map((n) => n.trim().toLowerCase()));
  const out: Array<{ where: string; venue: string }> = [];
  const check = (where: string, ids?: string[] | null, names?: string[] | null) => {
    if (ids?.length) ids.forEach((id, i) => { if (!okIds.has(id)) out.push({ where, venue: names?.[i] ?? id }); });
    else (names ?? []).forEach((n) => { if (!okNames.has(n.trim().toLowerCase())) out.push({ where, venue: n }); });
  };
  const sd: any = def.scheduleDefaults ?? {};
  check("Tournament defaults", sd.venueClubIds, sd.venueNames);
  allStages(def).forEach(({ stage }) => check(stage.name, stage.schedule?.venueClubIds, stage.schedule?.venueNames));
  return out;
}

/* ───── Hierarchy-backed venues + real court records ───── */

/** A real court record (from `courts`, via tournament_host_courts). Devices never appear here. */
export interface CourtLite { court_id: number; name: string; club_id: string; is_external?: boolean; venue_name?: string | null; active?: boolean }

/** Clubs that may host at this level. Club → the owning club only. Regional/National → clubs under the owner. No fallback to unrelated clubs. */
export function eligibleVenueClubIds(scope: EventScope | null | undefined, owner: OrgLite | undefined, orgs: OrgLite[], rels: Array<{ parent_org_id: string; child_org_id: string }>): string[] {
  if (!scope || !owner) return [];
  if (scope === "club") return owner.club_id ? [owner.club_id] : [];
  return subordinateClubIds(owner.id, orgs, rels);
}

/** Regions (associations) under a national body, for Region → Club → Courts navigation. */
export function regionsUnder(nationalId: string, orgs: OrgLite[], rels: Array<{ parent_org_id: string; child_org_id: string }>): OrgLite[] {
  const seen = new Set<string>([nationalId]); const q = [nationalId];
  while (q.length) { const p = q.shift()!; for (const r of rels) if (r.parent_org_id === p && !seen.has(r.child_org_id)) { seen.add(r.child_org_id); q.push(r.child_org_id); } }
  return orgs.filter((o) => o.id !== nationalId && seen.has(o.id) && o.kind === "association");
}

/** Only active court records count as tournament courts. */
export function tournamentCourts(courts: CourtLite[], clubId?: string): CourtLite[] {
  return courts.filter((c) => c.active !== false && (!clubId || c.club_id === clubId));
}

export function selectedCourtIds(def: TournamentDefinition, clubId: string): number[] {
  return def.event?.venues?.courtIds?.[clubId] ?? [];
}

/** The scheduling pool: every selected court at every selected venue. */
export function selectedCourtPool(def: TournamentDefinition): Array<{ clubId: string; courtId: number }> {
  if (def.event?.noVenue) return [];
  return eventVenues(def).clubIds.flatMap((clubId) => selectedCourtIds(def, clubId).map((courtId) => ({ clubId, courtId })));
}

/** Selected venues that are no longer eligible for the current owner/level. */
export function venueScopeIssues(def: TournamentDefinition, eligibleIds: string[]): string[] {
  const ok = new Set(eligibleIds);
  return eventVenues(def).clubIds.filter((id) => !ok.has(id));
}

/** Rotation works over selected venue IDs that contribute courts; meaningful only with 2+. */
export function rotationVenueIds(def: TournamentDefinition): string[] {
  if (def.event?.noVenue) return [];
  return eventVenues(def).clubIds.filter((id) => selectedCourtIds(def, id).length > 0);
}

/** Round-robin venue per round number over the selected venue IDs only. */
export function rotatedVenueFor(def: TournamentDefinition, round: number): string | null {
  const ids = rotationVenueIds(def);
  return ids.length ? ids[(Math.max(1, round) - 1) % ids.length] : null;
}

/** What removing courts would do: played games keep them (blocked), unplayed games need moving first. */
export function courtRemovalImpact(removed: number[], matches: Array<{ court_id?: number | null; status?: string | null }>) {
  const set = new Set(removed);
  const on = matches.filter((m) => m.court_id != null && set.has(m.court_id));
  const history = [...new Set(on.filter((m) => m.status === "completed").map((m) => m.court_id!))];
  const future = [...new Set(on.filter((m) => m.status !== "completed").map((m) => m.court_id!))].filter((c) => !history.includes(c));
  return { history, future, free: removed.filter((c) => !history.includes(c) && !future.includes(c)), blocked: history.length + future.length > 0 };
}

/** tournament_venues rows (the existing authoritative venue table) from the Design selection. */
export function venueRowsFromDefinition(def: TournamentDefinition, primaryClubId?: string) {
  const ids = eventVenues(def).clubIds;
  const primary = primaryClubId && ids.includes(primaryClubId) ? primaryClubId : ids[0];
  return ids.map((club_id) => ({ club_id, court_ids: [...selectedCourtIds(def, club_id)].sort((a, b) => a - b), is_primary: club_id === primary }));
}
