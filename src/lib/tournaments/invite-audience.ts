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

export type InviteAudienceMode = "all_club" | "leagues" | "individuals" | "clubs";

/**
 * Tournament scope → the audience choices that make sense at that level.
 * Scope values (`club` / `association` / `open`) are unchanged in the database;
 * only the wording and the option set follow participation, not ownership.
 */
export function eligibilityScopeLabel(scope: string | null | undefined): string {
  if (scope === "association") return "Regional league";
  if (scope === "open") return "National & international";
  return "Club members";
}

export function audienceModesForScope(scope: string | null | undefined): InviteAudienceMode[] {
  if (scope === "association" || scope === "open") return ["all_club", "clubs", "leagues", "individuals"];
  return ["all_club", "leagues", "individuals"];
}


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
  /** clubs mode: the clubs the organiser ticked in the scope tree. */
  clubIds?: string[];
  /**
   * clubs mode: clubId → member references resolved SERVER-SIDE
   * (`tournament_invite_member_ids`). Those rows are already filtered to real
   * active non-visitor members, so they are trusted without a local pool row.
   */
  memberIdsByClub?: Map<string, string[]>;
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



  if (input.mode === "clubs") {
    const clubIds = Array.from(new Set((input.clubIds || []).filter(Boolean)));
    const ids: string[] = [];
    const seen = new Set<string>();
    clubIds.forEach((cid) => {
      (input.memberIdsByClub?.get(cid) || []).forEach((mid) => {
        if (!mid || seen.has(mid) || excluded.has(mid)) return;
        // A local pool row may exist for the host club — respect it when it does.
        const local = invitable.has(mid);
        const known = (input.members || []).some((m) => m?.id === mid);
        if (known && !local) return;
        seen.add(mid);
        ids.push(mid);
      });
    });
    // Also include individually selected members from the expandable club tree.
    (input.individualIds || []).forEach((mid) => {
      if (!mid || seen.has(mid) || excluded.has(mid)) return;
      const local = invitable.has(mid);
      const known = (input.members || []).some((m) => m?.id === mid);
      if (known && !local) return;
      seen.add(mid);
      ids.push(mid);
    });
    const individualCount = ids.length - (clubIds.length ? 0 : 0);
    const fromIndividuals = (input.individualIds || []).filter((id) => seen.has(id)).length;
    return {
      memberIds: ids,
      excluded: excludedCounts,
      summary:
        `${ids.length} member${ids.length === 1 ? "" : "s"} from ${clubIds.length} selected club${clubIds.length === 1 ? "" : "s"}` +
        (fromIndividuals > 0 ? ` plus ${fromIndividuals} individually picked.` : "."),
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

export interface RecipientMemberRow {
  id: string;
  role?: string | null;
  club_member_number?: string | null;
}

/**
 * Fail-closed visitor guard for INVITE SENDS.
 *
 * Visitors may sit in a tournament's player pool (they can be drawn into a
 * division), but they must never be mailed/notified unless the organiser
 * explicitly ticked "include visitors". Promoted visitor rows keep the
 * `visitor:<id>` member number even if their role is later edited, so both
 * signals are treated as visitor.
 */
export function visitorMemberIds(rows: Array<RecipientMemberRow | null | undefined>): Set<string> {
  const out = new Set<string>();
  (rows || []).forEach((r) => {
    if (!r?.id) return;
    const role = String(r.role ?? "").toLowerCase();
    const num = String(r.club_member_number ?? "").toLowerCase();
    if (role === "visitor" || num.startsWith("visitor:")) out.add(r.id);
  });
  return out;
}

/** Drop visitor registrations from an invite send unless explicitly allowed. */
export function filterVisitorRecipients<T extends { club_member_id?: string | null }>(
  registrations: T[],
  memberRows: Array<RecipientMemberRow | null | undefined>,
  includeVisitors: boolean,
): { kept: T[]; removed: number } {
  if (includeVisitors) return { kept: registrations || [], removed: 0 };
  const visitors = visitorMemberIds(memberRows);
  if (visitors.size === 0) return { kept: registrations || [], removed: 0 };
  const kept = (registrations || []).filter((r) => !(r.club_member_id && visitors.has(r.club_member_id)));
  return { kept, removed: (registrations || []).length - kept.length };
}

export function audienceLabel(mode: InviteAudienceMode, scope?: string | null): string {
  const wide = scope === "association" || scope === "open";
  if (mode === "all_club") {
    if (scope === "association") return "Everyone in the regional league (open invitation)";
    if (scope === "open") return "Everyone in the federation (open invitation)";
    return "Invite all members of the club (open invitation)";
  }
  if (mode === "clubs") return scope === "open" ? "Selected associations / clubs" : "Selected clubs";
  if (mode === "leagues") return wide ? "Selected league teams" : "Selected leagues / league teams";
  return "Selected individual members";

}
