/**
 * Visitor promotion — turn `club_visitors` sign-ins into real `club_members`
 * rows (role='visitor') so tournament tables (which only accept
 * club_member_id) can reference them.
 *
 * Idempotent: keyed by club_member_number='visitor:<visitor_id>', so
 * re-selecting the same visitor reuses the same member row instead of
 * creating duplicates. The visitor's phone is copied so WhatsApp/SMS
 * invitations can actually reach them.
 */
import { fromExt } from "@/lib/supabase-ext";

export type ClubVisitor = {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  home_club_name?: string | null;
  category?: string | null;
};

export const visitorDisplayName = (v: ClubVisitor) =>
  `${v.first_name ?? ""} ${v.last_name ?? ""}`.trim() || "Visitor";

export const visitorGender = (v: ClubVisitor) =>
  v.category === "Ladies" ? "Ladies" : "Men";

/** Fetch the club's registered visitors (sign-in page registry). */
export async function fetchClubVisitors(clubId: string): Promise<ClubVisitor[]> {
  const { data, error } = await fromExt("club_visitors")
    .select("id, first_name, last_name, phone, home_club_name, category")
    .eq("club_id", clubId)
    .order("first_name");
  if (error) throw error;
  return (data ?? []) as ClubVisitor[];
}

/**
 * Ensure every given visitor has a club_members row (role='visitor').
 * Returns visitor_id → club_member_id for every requested visitor.
 */
export async function promoteVisitors(
  clubId: string,
  visitors: ClubVisitor[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (visitors.length === 0) return out;
  const markers = visitors.map((v) => `visitor:${v.id}`);
  const { data: existing } = await fromExt("club_members")
    .select("id, club_member_number")
    .eq("club_id", clubId)
    .in("club_member_number", markers);
  for (const row of (existing || []) as any[]) {
    const vid = String(row.club_member_number || "").replace(/^visitor:/, "");
    if (vid) out.set(vid, row.id);
  }
  const missing = visitors.filter((v) => !out.has(v.id));
  if (missing.length > 0) {
    const rows = missing.map((v) => ({
      club_id: clubId,
      role: "visitor" as const,
      club_member_number: `visitor:${v.id}`,
      name: visitorDisplayName(v),
      gender: visitorGender(v),
      phone: v.phone || null,
      home_club_name: v.home_club_name || null,
      status: "active" as const,
    }));
    const { data: inserted, error } = await fromExt("club_members")
      .insert(rows)
      .select("id, club_member_number");
    if (error) throw error;
    for (const row of (inserted || []) as any[]) {
      const vid = String(row.club_member_number || "").replace(/^visitor:/, "");
      if (vid) out.set(vid, row.id);
    }
  }
  return out;
}
