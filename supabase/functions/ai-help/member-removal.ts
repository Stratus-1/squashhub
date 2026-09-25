// Remove a member from a club's member list = end THAT club membership.
// Reuses the Members roster's own non-destructive action (status -> "resigned"
// on the club_members row, under the caller's RLS). It never deletes the
// club_members row, the national `people` record, or memberships elsewhere.
// Pure helpers (no Deno/network) so they can be unit-tested.

export type MemberRow = {
  id: string; name: string; status: string | null; club_id: string;
  person_id: string | null; user_id: string | null; role: string | null;
};

export type RemovalCode =
  | "permission_denied" | "ambiguous_member" | "member_not_found"
  | "missing_required_data" | "already_removed" | "needs_person";

export type RemovalPlan =
  | { ok: false; code: RemovalCode; reason: string; candidates?: string[] }
  | {
      ok: true; target: MemberRow; summary: string; changes: string[]; affected: string[];
      consequences: string[]; unchanged: string[]; resolved: Record<string, unknown>; before: Record<string, unknown>;
    };

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

/** Exact (case/space-insensitive) name matches win; otherwise every word must appear. */
export function matchClubMembers(rows: MemberRow[], query: string): MemberRow[] {
  const q = norm(query);
  if (!q) return [];
  const exact = rows.filter((r) => norm(r.name) === q);
  if (exact.length) return exact;
  const parts = q.split(" ");
  return rows.filter((r) => parts.every((p) => norm(r.name).includes(p)));
}

export function planRemoval(i: {
  canManage: boolean; query: string; clubName: string; rows: MemberRow[];
  callerMemberId: string | null; otherMembershipCount: (m: MemberRow) => number;
}): RemovalPlan {
  if (!i.canManage) {
    return { ok: false, code: "permission_denied", reason: `Only a club admin of ${i.clubName} can remove members from its member list. Your account doesn't have that right here.` };
  }
  if (!norm(i.query)) return { ok: false, code: "missing_required_data", reason: "Which member should I remove? Please give their full name." };
  const all = matchClubMembers(i.rows, i.query);
  const live = all.filter((r) => (r.status ?? "active") !== "resigned");
  if (!live.length) {
    if (all.length) return { ok: false, code: "already_removed", reason: `${all[0].name} is already off ${i.clubName}'s active member list (marked resigned).` };
    return { ok: false, code: "member_not_found", reason: `I couldn't find a member called "${i.query}" at ${i.clubName}.` };
  }
  if (live.length > 1) {
    const names = live.slice(0, 6).map((r) => r.name);
    return { ok: false, code: "ambiguous_member", reason: `More than one ${i.clubName} member matches "${i.query}": ${names.join(", ")}. Which one?`, candidates: names };
  }
  const t = live[0];
  if (t.id === i.callerMemberId) return { ok: false, code: "needs_person", reason: "You can't remove your own membership through the assistant." };
  if (t.role === "admin") return { ok: false, code: "needs_person", reason: `${t.name} is a club admin. Remove their admin rights on the Members page first, then ask again.` };
  const others = i.otherMembershipCount(t);
  return {
    ok: true, target: t,
    summary: `Remove ${t.name} from ${i.clubName}'s member list? This removes her/his ${i.clubName} membership; it does not delete the person record or memberships at other clubs.`,
    changes: [`${t.name}'s ${i.clubName} membership: ${t.status ?? "active"} → resigned`],
    affected: [`${i.clubName} member list: ${t.name}`],
    consequences: [`${t.name} no longer appears as an active ${i.clubName} member (same as choosing "Resigned" on the Members page).`],
    unchanged: [
      "The national person record is kept",
      others ? `${others} membership(s) at other clubs/associations stay as they are` : "No other club memberships exist to change",
      "Past results, fees, payments and history are kept",
      "The login account is not deleted",
    ],
    resolved: { member_id: t.id, club_id: t.club_id, name: t.name, person_id: t.person_id, previous_status: t.status ?? "active" },
    before: { member_id: t.id, status: t.status ?? "active" },
  };
}

/** Guarded execute: only flips a row that is still not resigned (a repeat does nothing). */
export async function executeRemoval(
  update: (memberId: string, clubId: string) => Promise<{ data: { id: string; status: string } | null; error: { message: string } | null }>,
  currentStatus: (memberId: string) => Promise<string | null>,
  r: Record<string, unknown>,
): Promise<{ ok: boolean; message: string; after?: unknown; reversible?: boolean }> {
  const id = String(r.member_id ?? ""), club = String(r.club_id ?? "");
  if (!id || !club) return { ok: false, message: "The preview is missing the member — nothing was changed." };
  const { data, error } = await update(id, club);
  if (error) return { ok: false, message: error.message };
  if (!data) {
    const now = await currentStatus(id);
    return { ok: false, message: now === "resigned" ? "Already removed — nothing was changed again." : "You're not allowed to change that membership." };
  }
  if (data.status !== "resigned") return { ok: false, message: "The update ran but the membership isn't marked resigned — flagged for review." };
  return { ok: true, message: `Done — ${r.name} is removed from the member list (membership marked resigned). The person record and other memberships are unchanged.`, after: { member_id: id, club_id: club, status: "resigned", person_id: r.person_id ?? null }, reversible: true };
}
