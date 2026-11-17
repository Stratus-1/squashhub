/**
 * Organiser Registrations list — quick filters behind the summary chips.
 * Each chip's count and the rows it shows come from the same predicate, so
 * "Paid 4" always lists exactly four players.
 */
import { isParticipatingEntrant, type EntrantRowLike } from "./entrant-status";

export type RegistrationFilter =
  | "all"
  | "registered"
  | "paid"
  | "account"
  | "pending"
  | "not_entered"
  | "proof"
  | "active"
  | "not_activated"
  | "no_account";

export interface SignupState { has_account: boolean; has_signed_in: boolean }

export interface RegistrationFilterCtx {
  feeRequired: boolean;
  signup?: (memberId: string) => SignupState | undefined;
}

type Row = EntrantRowLike & { proof_url?: string | null };

export const isPaidRow = (r: Row) => (r.fee_status ? r.fee_status === "paid" : r.status === "paid");
export const isPendingRow = (r: Row) =>
  r.fee_status ? r.fee_status === "pending" : r.status === "pending_payment" || r.status === "pending_eft";
export const awaitingProofCheck = (r: Row) =>
  !!r.proof_url && (r.status === "pending_eft" || r.status === "pending_payment");

export function matchesRegistrationFilter(r: Row, filter: RegistrationFilter, ctx: RegistrationFilterCtx): boolean {
  const s = ctx.signup?.(String(r.club_member_id || ""));
  switch (filter) {
    case "all": return true;
    case "registered": return isParticipatingEntrant(r, { paymentRequired: ctx.feeRequired });
    case "not_entered": return r.status !== "cancelled" && !isParticipatingEntrant(r, { paymentRequired: ctx.feeRequired });
    case "paid": return isPaidRow(r);
    case "account": return r.fee_status === "on_account";
    case "pending": return isPendingRow(r);
    case "proof": return awaitingProofCheck(r);
    case "active": return !!s?.has_signed_in;
    case "not_activated": return !!s?.has_account && !s?.has_signed_in;
    case "no_account": return !s?.has_account;
  }
}

export interface PairRow {
  member_a: string;
  member_b: string;
  group_number?: number | null;
  status?: string | null;
  a?: { name?: string | null } | null;
  b?: { name?: string | null } | null;
}

export interface PartnerInfo {
  partnerId: string;
  name: string | null;
  group: number | null;
  confirmed: boolean;
  status: string;
}

const DEAD_PAIR = new Set(["cancelled", "declined", "rejected", "withdrawn"]);

/**
 * Every live doubles partner of one player, one per category. The pairing board
 * (champ_doubles_pairs) wins; the registration's own partner column fills in
 * when no board row names that partner.
 */
export function partnersOf(
  memberId: string,
  pairs: PairRow[],
  registrationPartner?: { id?: string | null; name?: string | null; confirmed?: boolean | null } | null,
): PartnerInfo[] {
  const out: PartnerInfo[] = [];
  for (const p of pairs) {
    if (DEAD_PAIR.has(String(p.status || "").toLowerCase())) continue;
    const mine = p.member_a === memberId ? "a" : p.member_b === memberId ? "b" : null;
    if (!mine) continue;
    const partnerId = mine === "a" ? p.member_b : p.member_a;
    if (!partnerId) continue;
    const name = (mine === "a" ? p.b?.name : p.a?.name) ?? null;
    const status = String(p.status || "proposed");
    out.push({ partnerId, name, group: p.group_number ?? null, confirmed: status === "confirmed", status });
  }
  if (registrationPartner?.id && !out.some((x) => x.partnerId === registrationPartner.id)) {
    out.push({
      partnerId: registrationPartner.id,
      name: registrationPartner.name ?? null,
      group: null,
      confirmed: !!registrationPartner.confirmed,
      status: registrationPartner.confirmed ? "confirmed" : "proposed",
    });
  }
  return out.sort((x, y) => (x.group ?? 99) - (y.group ?? 99));
}
