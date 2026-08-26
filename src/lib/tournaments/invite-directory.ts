/**
 * Privacy-safe player directory for tournament invitations.
 *
 * Business rule: a tournament may be opened to the host club, a regional
 * association, or the whole federation. The organiser must be able to FIND and
 * INVITE players from other clubs — but selecting a player must never hand the
 * organiser that player's private contact or admin data. Invite delivery uses
 * the player's email/phone strictly server-side.
 *
 * Everything here therefore goes through the `tournament_invite_directory`
 * SECURITY DEFINER RPC, which enforces the organiser's rights and the
 * tournament's eligibility scope, and returns only the safe projection below.
 * Base-table RLS on club_members/profiles is NOT loosened.
 */

import { supabase } from "@/integrations/supabase/client";

/** The complete set of fields the directory is ever allowed to expose. */
export const SAFE_DIRECTORY_FIELDS = [
  "member_id",
  "display_name",
  "club_id",
  "club_name",
  "gender",
  "ladder_position",
  "ranking_points",
  "is_own_club",
  "invite_status",
] as const;

/**
 * Fields that must NEVER reach the organiser through this path, even for
 * players of their own club. Kept explicit so a future schema change that
 * widens the RPC fails loudly in tests instead of silently leaking.
 */
export const FORBIDDEN_DIRECTORY_FIELDS = [
  "email",
  "phone",
  "mobile",
  "cell",
  "cellphone",
  "whatsapp",
  "address",
  "postal_address",
  "id_number",
  "date_of_birth",
  "dob",
  "birth_date",
  "emergency_contact",
  "emergency_contact_name",
  "emergency_contact_phone",
  "medical_notes",
  "notes",
  "user_id",
  "auth_user_id",
  "fee_category_id",
  "billing_exempt",
  "suspension_reason",
  "suspension_outstanding",
  "face_provider_person_id",
] as const;

export interface DirectoryPlayer {
  member_id: string;
  display_name: string;
  club_id: string | null;
  club_name: string | null;
  gender: string | null;
  ladder_position: number | null;
  ranking_points: number | null;
  is_own_club: boolean;
  /** Existing registration status for this tournament, if any. */
  invite_status: string | null;
}

const SAFE = new Set<string>(SAFE_DIRECTORY_FIELDS as readonly string[]);

/**
 * Defence in depth: drop anything the RPC did not promise, and refuse the row
 * outright if a known-sensitive key ever appears.
 */
export function sanitizeDirectoryRow(row: Record<string, unknown>): DirectoryPlayer {
  const leaked = Object.keys(row || {}).filter(
    (k) => (FORBIDDEN_DIRECTORY_FIELDS as readonly string[]).includes(k),
  );
  if (leaked.length > 0) {
    throw new Error(`Tournament directory returned private fields: ${leaked.join(", ")}`);
  }
  const out: Record<string, unknown> = {};
  Object.keys(row || {}).forEach((k) => {
    if (SAFE.has(k)) out[k] = (row as any)[k];
  });
  return {
    member_id: String(out.member_id ?? ""),
    display_name: String(out.display_name ?? "Unknown player"),
    club_id: (out.club_id as string) ?? null,
    club_name: (out.club_name as string) ?? null,
    gender: (out.gender as string) ?? null,
    ladder_position: (out.ladder_position as number) ?? null,
    ranking_points: (out.ranking_points as number) ?? null,
    is_own_club: out.is_own_club === true,
    invite_status: (out.invite_status as string) ?? null,
  };
}

export function sanitizeDirectory(rows: Record<string, unknown>[]): DirectoryPlayer[] {
  return (rows || []).map(sanitizeDirectoryRow).filter((p) => !!p.member_id);
}

/** Group the directory by club so cross-club results stay readable. */
export function groupByClub(players: DirectoryPlayer[]): { clubId: string; clubName: string; players: DirectoryPlayer[] }[] {
  const groups = new Map<string, { clubId: string; clubName: string; players: DirectoryPlayer[] }>();
  players.forEach((p) => {
    const key = p.club_id || "unknown";
    if (!groups.has(key)) {
      groups.set(key, { clubId: key, clubName: p.club_name || "Unaffiliated", players: [] });
    }
    groups.get(key)!.players.push(p);
  });
  // Own club first, then alphabetically.
  return Array.from(groups.values()).sort((a, b) => {
    const ao = a.players.some((p) => p.is_own_club) ? 0 : 1;
    const bo = b.players.some((p) => p.is_own_club) ? 0 : 1;
    return ao - bo || a.clubName.localeCompare(b.clubName);
  });
}

export function directoryScopeLabel(scope: string | null | undefined): string {
  if (scope === "association") return "Players from every club that plays in this association / region";
  if (scope === "open") return "Players from every club in the federation";
  return "Players from this club";
}

export async function fetchInviteDirectory(input: {
  tournamentId?: string | null;
  clubId?: string | null;
  scope?: string | null;
  search?: string | null;
  limit?: number;
  /** Narrow the search to the clubs ticked in the scope tree. */
  clubIds?: string[] | null;
}): Promise<DirectoryPlayer[]> {
  const { data, error } = await (supabase as any).rpc("tournament_invite_directory", {
    p_tournament_id: input.tournamentId || null,
    p_club_id: input.clubId || null,
    p_scope: input.scope || null,
    p_search: input.search?.trim() || null,
    p_limit: input.limit ?? 200,
    p_club_ids: input.clubIds && input.clubIds.length > 0 ? input.clubIds : null,
  });
  if (error) throw error;
  return sanitizeDirectory((data as Record<string, unknown>[]) || []);
}

