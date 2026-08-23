/**
 * Doubles partner selection for tournament registration.
 *
 * A player may only choose a partner who has ALREADY accepted/registered for
 * the same doubles division. Pairing is mutual: the proposal sits at `pending`
 * until the chosen partner accepts (or the two players proposed each other, in
 * which case the database confirms it immediately).
 *
 * Everything here is token-aware so the whole journey works from the secure
 * invitation link without a SquashHub login.
 */
import { supabase } from "@/integrations/supabase/client";
import type { InviteDivision } from "./invite-link";

/** Fields the partner picker is allowed to show. Nothing private, ever. */
export type PartnerOption = {
  member_id: string;
  display_name: string;
  club_id: string | null;
  club_name: string | null;
  gender: string | null;
  ladder_position: number | null;
};

export const PARTNER_OPTION_FIELDS = [
  "member_id",
  "display_name",
  "club_id",
  "club_name",
  "gender",
  "ladder_position",
] as const;

export type PairStatus = "pending" | "confirmed" | "rejected" | "cancelled";

export type MyPair = {
  id: string;
  group_number: number;
  status: PairStatus;
  proposed_by_me: boolean;
  partner_member_id: string;
  partner_name: string | null;
  partner_club: string | null;
  created_at?: string | null;
  responded_at?: string | null;
};

export type PairingState = {
  member_id: string | null;
  locked: boolean;
  pairs: MyPair[];
};

export const PARTNER_MUST_REGISTER_MESSAGE =
  "Your partner must register first before you can select them.";

/** Defence in depth: never let anything but the safe fields reach the UI. */
export function sanitizePartnerOption(raw: any): PartnerOption | null {
  const id = raw?.member_id ? String(raw.member_id) : "";
  const name = String(raw?.display_name || "").trim();
  if (!id || !name) return null;
  return {
    member_id: id,
    display_name: name,
    club_id: raw?.club_id ? String(raw.club_id) : null,
    club_name: raw?.club_name ? String(raw.club_name) : null,
    gender: raw?.gender ? String(raw.gender) : null,
    ladder_position:
      raw?.ladder_position === null || raw?.ladder_position === undefined
        ? null
        : Number(raw.ladder_position),
  };
}

export function sanitizePartnerOptions(rows: any): PartnerOption[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(sanitizePartnerOption).filter((o): o is PartnerOption => !!o);
}

/** Divisions the invitee entered that actually need a partner. */
export function doublesDivisions(
  divisions: InviteDivision[],
  chosen: number[],
): InviteDivision[] {
  const picked = new Set(chosen);
  return divisions.filter(
    (d) => picked.has(d.group_number) && String(d.match_type || "").toLowerCase() === "doubles",
  );
}

export function pairForDivision(pairs: MyPair[], groupNumber: number): MyPair | null {
  const active = pairs.filter(
    (p) => p.group_number === groupNumber && (p.status === "pending" || p.status === "confirmed"),
  );
  return active.find((p) => p.status === "confirmed") || active[0] || null;
}

/** What the player is asked to do next for one doubles division. */
export type PairAction = "choose" | "awaiting_partner" | "respond" | "confirmed" | "locked";

export function pairAction(pair: MyPair | null, locked: boolean): PairAction {
  if (pair?.status === "confirmed") return locked ? "locked" : "confirmed";
  if (locked) return "locked";
  if (!pair) return "choose";
  return pair.proposed_by_me ? "awaiting_partner" : "respond";
}

export function pairStatusLabel(pair: MyPair | null): string {
  if (!pair) return "No partner yet";
  if (pair.status === "confirmed") return `Paired with ${pair.partner_name || "your partner"}`;
  if (pair.proposed_by_me) return `Waiting for ${pair.partner_name || "your partner"} to accept`;
  return `${pair.partner_name || "A player"} asked to pair with you`;
}

export function partnerOptionSubtitle(option: PartnerOption): string {
  const bits: string[] = [];
  if (option.club_name) bits.push(option.club_name);
  if (option.ladder_position) bits.push(`Ladder #${option.ladder_position}`);
  return bits.join(" · ");
}

// ── API wrappers ────────────────────────────────────────────────────────────

type TokenAuth = { token?: string | null; verify?: string | null };

export async function fetchPartnerOptions(
  champId: string,
  groupNumber: number,
  auth: TokenAuth = {},
  search?: string,
): Promise<PartnerOption[]> {
  const { data, error } = await (supabase as any).rpc("list_doubles_partner_options", {
    p_champ_id: champId,
    p_group_number: groupNumber,
    p_token: auth.token || null,
    p_verify: auth.verify || null,
    p_search: search?.trim() || null,
    p_limit: 50,
  });
  if (error) throw error;
  return sanitizePartnerOptions(data);
}

export async function fetchPairingState(
  champId: string,
  auth: TokenAuth = {},
): Promise<PairingState> {
  const { data, error } = await (supabase as any).rpc("get_doubles_pairing_state", {
    p_champ_id: champId,
    p_token: auth.token || null,
    p_verify: auth.verify || null,
  });
  if (error) throw error;
  return {
    member_id: data?.member_id ?? null,
    locked: !!data?.locked,
    pairs: Array.isArray(data?.pairs) ? (data.pairs as MyPair[]) : [],
  };
}

export async function proposePartner(
  champId: string,
  groupNumber: number,
  partnerMemberId: string,
  auth: TokenAuth = {},
) {
  const { data, error } = await (supabase as any).rpc("propose_doubles_partner", {
    p_champ_id: champId,
    p_group_number: groupNumber,
    p_partner_member_id: partnerMemberId,
    p_token: auth.token || null,
    p_verify: auth.verify || null,
  });
  if (error) throw error;
  return data as { id: string; status: PairStatus };
}

export async function respondToPair(pairId: string, accept: boolean, auth: TokenAuth = {}) {
  const { data, error } = await (supabase as any).rpc("respond_doubles_pair", {
    p_pair_id: pairId,
    p_accept: accept,
    p_token: auth.token || null,
    p_verify: auth.verify || null,
  });
  if (error) throw error;
  return data as { id: string; status: PairStatus };
}

export async function cancelPair(pairId: string, auth: TokenAuth = {}) {
  const { data, error } = await (supabase as any).rpc("cancel_doubles_pair", {
    p_pair_id: pairId,
    p_token: auth.token || null,
    p_verify: auth.verify || null,
  });
  if (error) throw error;
  return data as { id: string; status: PairStatus };
}

export type OrganiserPair = {
  id: string;
  group_number: number;
  status: PairStatus;
  member_a: string;
  member_a_name: string | null;
  member_b: string;
  member_b_name: string | null;
  proposed_by: string;
  created_at?: string | null;
  responded_at?: string | null;
};

export async function fetchOrganiserPairs(
  champId: string,
): Promise<{ locked: boolean; pairs: OrganiserPair[] }> {
  const { data, error } = await (supabase as any).rpc("tournament_doubles_pairs", {
    p_champ_id: champId,
  });
  if (error) throw error;
  return { locked: !!data?.locked, pairs: Array.isArray(data?.pairs) ? data.pairs : [] };
}

export async function setPairingLocked(champId: string, locked: boolean) {
  const { error } = await (supabase as any).rpc("set_doubles_pairing_locked", {
    p_champ_id: champId,
    p_locked: locked,
  });
  if (error) throw error;
}
