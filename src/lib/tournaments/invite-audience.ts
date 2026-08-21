/**
 * Tournament INVITATION AUDIENCE — who receives the invitation.
 *
 * This is deliberately independent from the tournament STRUCTURE / draw source
 * (which leagues/teams feed division assignment and seeding). A club member who
 * plays no league must still be able to receive a club championship invite, so
 * nothing in here ever falls back to the Structure league selection.
 *
 *  - all_club    → every eligible active member of the owning club/pool,
 *                  league player or not.
 *  - leagues     → only members registered in the chosen leagues / teams
 *                  (canonical season → level → team ids; an invite filter only).
 *  - individuals → an explicit, searchable member list (league or not).
 *
 * Leagues + individuals can be combined explicitly via `includeIndividuals`.
 */

export type InviteAudienceMode = "all_club" | "leagues" | "individuals";

export interface AudienceMemberRow {
  id: string;
  status?: string | null;
  role?: string | null;
}

/** A member may be invited when they are an active, non-visitor member. */
export function isInvitableMember(m: AudienceMemberRow | undefined | null): boolean {
  if (!m || !m.id) return false;
  const status = String(m.status ?? "active").toLowerCase();
  if (status && status !== "active") return false;
  return String(m.role ?? "member").toLowerCase() !== "visitor";
}

export interface ResolvedAudience {
  memberIds: string[];
  /** Plain-English description of who was resolved and why. */
  summary: string;
}

export function resolveInviteAudience(input: {
  mode: InviteAudienceMode;
  /** Eligible population (host club, or the wider eligibility pool). */
  members: AudienceMemberRow[];
  /** Invite filter only — never the Structure/draw source. */
  leagueIds?: string[];
  registrationsByLeague?: Map<string, string[]>;
  individualIds?: string[];
  /** leagues mode: also invite the explicitly picked individuals. */
  includeIndividuals?: boolean;
  excludedIds?: Iterable<string>;
}): ResolvedAudience {
  const invitable = new Map<string, AudienceMemberRow>();
  (input.members || []).forEach((m) => {
    if (isInvitableMember(m)) invitable.set(m.id, m);
  });
  const excluded = new Set(Array.from(input.excludedIds || []));
  const keep = (ids: Iterable<string>) =>
    Array.from(new Set(Array.from(ids))).filter((id) => invitable.has(id) && !excluded.has(id));

  if (input.mode === "all_club") {
    const ids = keep(invitable.keys());
    return {
      memberIds: ids,
      summary: `All ${ids.length} active club member${ids.length === 1 ? "" : "s"} — league membership is not required.`,
    };
  }

  if (input.mode === "individuals") {
    const ids = keep(input.individualIds || []);
    return {
      memberIds: ids,
      summary: `${ids.length} individually selected member${ids.length === 1 ? "" : "s"}.`,
    };
  }

  const leagueIds = Array.from(new Set((input.leagueIds || []).filter(Boolean)));
  const fromLeagues = new Set<string>();
  leagueIds.forEach((lid) => {
    (input.registrationsByLeague?.get(lid) || []).forEach((mid) => fromLeagues.add(mid));
  });
  const extras = input.includeIndividuals ? input.individualIds || [] : [];
  const ids = keep([...fromLeagues, ...extras]);
  const extraCount = ids.filter((id) => !fromLeagues.has(id)).length;
  return {
    memberIds: ids,
    summary:
      `${ids.length} member${ids.length === 1 ? "" : "s"} from ${leagueIds.length} selected league team${leagueIds.length === 1 ? "" : "s"}` +
      (extraCount > 0 ? ` plus ${extraCount} individually added.` : "."),
  };
}

/**
 * Accepted entrants are never rejected for lacking a league mapping: those
 * without a confident division go to organiser review before draw generation.
 */
export function partitionAcceptedEntrants(input: {
  acceptedMemberIds: string[];
  /** memberId → division number the organiser/league mapping produced. */
  divisionByMember?: Map<string, number | null | undefined>;
}): { assigned: string[]; unassigned: string[] } {
  const assigned: string[] = [];
  const unassigned: string[] = [];
  Array.from(new Set(input.acceptedMemberIds || [])).forEach((id) => {
    const gn = input.divisionByMember?.get(id);
    if (typeof gn === "number" && gn > 0) assigned.push(id);
    else unassigned.push(id);
  });
  return { assigned, unassigned };
}

export function audienceLabel(mode: InviteAudienceMode): string {
  if (mode === "all_club") return "Invite all members of the club (open invitation)";
  if (mode === "leagues") return "Selected leagues / league teams";
  return "Selected individual members";
}
