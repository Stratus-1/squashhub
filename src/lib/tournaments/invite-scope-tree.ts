/**
 * Association → Club selection tree for tournament invitations.
 *
 * The organiser picks WHO gets invited at the level that matches the
 * tournament's scope:
 *   club        → their own club only
 *   association → every club that PLAYS IN the regional league(s) their club
 *                 takes part in (participation, never ownership)
 *   open        → every club under the federation, grouped by association
 *
 * Only counts and public club/association names travel to the browser. Member
 * references are resolved server-side through `tournament_invite_member_ids`
 * and contact details are never returned to the organiser.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ScopeTreeClub {
  clubId: string;
  clubName: string;
  isOwnClub: boolean;
  memberCount: number;
  registeredCount: number;
  /** Members with either a member-level email or a linked user email — the ones who can receive an email invite. */
  emailReachCount: number;
}

export interface ScopeTreeAssociation {
  associationId: string | null;
  associationName: string;
  clubs: ScopeTreeClub[];
  memberCount: number;
}

export type TickState = "none" | "some" | "all";

export function buildScopeTree(rows: Record<string, unknown>[]): ScopeTreeAssociation[] {
  const groups = new Map<string, ScopeTreeAssociation>();
  (rows || []).forEach((raw) => {
    const clubId = String((raw as any).club_id ?? "");
    if (!clubId) return;
    const associationId = ((raw as any).association_id as string) ?? null;
    const associationName = String((raw as any).association_name || "Unaffiliated clubs");
    const key = associationId || `name:${associationName}`;
    if (!groups.has(key)) {
      groups.set(key, { associationId, associationName, clubs: [], memberCount: 0 });
    }
    const g = groups.get(key)!;
    const club: ScopeTreeClub = {
      clubId,
      clubName: String((raw as any).club_name || "Unnamed club"),
      isOwnClub: (raw as any).is_own_club === true,
      memberCount: Number((raw as any).member_count || 0),
      registeredCount: Number((raw as any).registered_count || 0),
      emailReachCount: Number((raw as any).email_reach_count || 0),
    };
    g.clubs.push(club);
    g.memberCount += club.memberCount;
  });
  const list = Array.from(groups.values());
  list.forEach((g) => {
    g.clubs.sort((a, b) => Number(b.isOwnClub) - Number(a.isOwnClub) || a.clubName.localeCompare(b.clubName));
  });
  // The organiser's own association first, then alphabetically.
  return list.sort((a, b) => {
    const ao = a.clubs.some((c) => c.isOwnClub) ? 0 : 1;
    const bo = b.clubs.some((c) => c.isOwnClub) ? 0 : 1;
    return ao - bo || a.associationName.localeCompare(b.associationName);
  });
}

export function associationTickState(group: ScopeTreeAssociation, selected: Set<string>): TickState {
  const total = group.clubs.length;
  if (total === 0) return "none";
  const picked = group.clubs.filter((c) => selected.has(c.clubId)).length;
  if (picked === 0) return "none";
  return picked === total ? "all" : "some";
}

export function toggleAssociation(
  group: ScopeTreeAssociation,
  selected: Iterable<string>,
): string[] {
  const next = new Set(Array.from(selected));
  const state = associationTickState(group, next);
  group.clubs.forEach((c) => {
    if (state === "all") next.delete(c.clubId);
    else next.add(c.clubId);
  });
  return Array.from(next);
}

export function toggleClub(clubId: string, selected: Iterable<string>): string[] {
  const next = new Set(Array.from(selected));
  if (next.has(clubId)) next.delete(clubId);
  else next.add(clubId);
  return Array.from(next);
}

export function allClubIds(tree: ScopeTreeAssociation[]): string[] {
  return tree.flatMap((g) => g.clubs.map((c) => c.clubId));
}

/** Plain-English summary of the ticked branch, used above the send button. */
export function scopeSelectionSummary(tree: ScopeTreeAssociation[], selected: Set<string>): string {
  const clubs = tree.flatMap((g) => g.clubs).filter((c) => selected.has(c.clubId));
  if (clubs.length === 0) return "No clubs selected yet.";
  const members = clubs.reduce((n, c) => n + c.memberCount, 0);
  const registered = clubs.reduce((n, c) => n + c.registeredCount, 0);
  const emailReach = clubs.reduce((n, c) => n + c.emailReachCount, 0);
  return (
    `${clubs.length} club${clubs.length === 1 ? "" : "s"} · ${members} member${members === 1 ? "" : "s"}` +
    (emailReach > 0 ? ` · ${emailReach} with email` : "") +
    (registered > 0 ? ` · ${registered} entered` : "")
  );
}

export async function fetchScopeTree(input: {
  tournamentId?: string | null;
  clubId?: string | null;
  scope?: string | null;
}): Promise<ScopeTreeAssociation[]> {
  const { data, error } = await (supabase as any).rpc("tournament_invite_scope_tree", {
    p_tournament_id: input.tournamentId || null,
    p_club_id: input.clubId || null,
    p_scope: input.scope || null,
  });
  if (error) throw error;
  return buildScopeTree((data as Record<string, unknown>[]) || []);
}

/** Member references only — no names, no contact details. */
export async function fetchScopeMemberIds(input: {
  tournamentId?: string | null;
  clubId?: string | null;
  scope?: string | null;
  clubIds?: string[] | null;
}): Promise<Map<string, string[]>> {
  const { data, error } = await (supabase as any).rpc("tournament_invite_member_ids", {
    p_tournament_id: input.tournamentId || null,
    p_club_id: input.clubId || null,
    p_scope: input.scope || null,
    p_club_ids: input.clubIds && input.clubIds.length > 0 ? input.clubIds : null,
  });
  if (error) throw error;
  const out = new Map<string, string[]>();
  ((data as any[]) || []).forEach((r) => {
    const cid = String(r.club_id ?? "");
    const mid = String(r.member_id ?? "");
    if (!cid || !mid) return;
    if (!out.has(cid)) out.set(cid, []);
    out.get(cid)!.push(mid);
  });
  return out;
}
