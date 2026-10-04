/**
 * "Members not yet registered" audience: active memberships with no linked login.
 * Linked state is authoritative (club_members.user_id), never inferred from past sends.
 * The sender re-applies the same rule at send time.
 */
export type AudienceMember = { id: string; user_id?: string | null; status?: string | null; email?: string | null };

export const hasUsableEmail = (m: AudienceMember) => {
  const e = String(m.email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
};

export function isUnlinkedEligible(m: AudienceMember) {
  return !m.user_id && (m.status ?? "active") === "active";
}

export function summariseUnlinkedAudience(members: AudienceMember[], emailOnly: boolean) {
  let linked = 0, inactive = 0, noEmail = 0;
  const included: AudienceMember[] = [];
  for (const m of members) {
    if (m.user_id) { linked++; continue; }
    if ((m.status ?? "active") !== "active") { inactive++; continue; }
    if (emailOnly && !hasUsableEmail(m)) { noEmail++; continue; }
    included.push(m);
  }
  return { included, linked, inactive, noEmail };
}
