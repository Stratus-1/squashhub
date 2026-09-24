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
