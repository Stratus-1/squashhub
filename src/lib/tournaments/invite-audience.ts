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
  /** Placeholder/visitor-slot rows kept out of billing are never real people. */
  billing_exempt?: boolean | null;
  is_placeholder?: boolean | null;
}

/**
 * A member may be invited only when they are a real, active, non-visitor
 * member of the club. Visitors (role='visitor'), resigned/suspended members
 * and placeholder/billing-exempt slot rows are never invited.
 */
export function isInvitableMember(m: AudienceMemberRow | undefined | null): boolean {
  if (!m || !m.id) return false;
  const status = String(m.status ?? "active").toLowerCase();
  if (status && status !== "active") return false;
  const role = String(m.role ?? "member").toLowerCase();
  if (role === "visitor") return false;
  if (m.billing_exempt === true || m.is_placeholder === true) return false;
  return true;
}

export interface ResolvedAudience {
  memberIds: string[];
  /** Plain-English description of who was resolved and why. */
  summary: string;
  /** Why people were left out — shown so the organiser can verify the count. */
  excluded: { visitors: number; inactive: number; placeholders: number };
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
  const excludedCounts = { visitors: 0, inactive: 0, placeholders: 0 };
  (input.members || []).forEach((m) => {
    if (!m || !m.id) return;
    if (isInvitableMember(m)) {
      invitable.set(m.id, m);
      return;
    }
    const status = String(m.status ?? "active").toLowerCase();
    const role = String(m.role ?? "member").toLowerCase();
    if (role === "visitor") excludedCounts.visitors += 1;
    else if (status !== "active") excludedCounts.inactive += 1;
    else excludedCounts.placeholders += 1;
  });
  const excluded = new Set(Array.from(input.excludedIds || []));
  const keep = (ids: Iterable<string>) =>
    Array.from(new Set(Array.from(ids))).filter((id) => invitable.has(id) && !excluded.has(id));

  const suffix = (() => {
    const bits: string[] = [];
    if (excludedCounts.visitors) bits.push(`${excludedCounts.visitors} visitor${excludedCounts.visitors === 1 ? "" : "s"}`);
    if (excludedCounts.inactive) bits.push(`${excludedCounts.inactive} inactive`);
    if (excludedCounts.placeholders) bits.push(`${excludedCounts.placeholders} placeholder`);
    return bits.length ? ` Excluded: ${bits.join(", ")}.` : "";
  })();

  if (input.mode === "all_club") {
    const ids = keep(invitable.keys());
    return {
      memberIds: ids,
      excluded: excludedCounts,
      summary:
        `All ${ids.length} active club member${ids.length === 1 ? "" : "s"} — league membership is not required.` + suffix,
    };
  }


  if (input.mode === "individuals") {
    const ids = keep(input.individualIds || []);
    return {
      memberIds: ids,
      excluded: excludedCounts,
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
    excluded: excludedCounts,
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
