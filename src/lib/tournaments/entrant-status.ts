/**
 * Tournament entrant status — single source of truth.
 *
 * The database stores a payment-flavoured status on
 * `club_champs_registrations` (invited / pending_payment / pending_eft / paid /
 * waived / cancelled) plus `confirmed_at` + `confirmation_source` for the
 * acceptance event. Neither column on its own answers the question organisers
 * actually ask: "who is in the tournament?".
 *
 * This module maps the raw row to one authoritative participation category and
 * the label the UI shows, so the Players list, the allocation step and the draw
 * counts never disagree.
 */

export type RawEntrantStatus =
  | "invited"
  | "pending_payment"
  | "pending_eft"
  | "paid"
  | "waived"
  | "cancelled"
  | (string & {});

export type EntrantCategory =
  | "pending_invite"      // invited, no response yet
  | "accepted"            // accepted the invite, entry fee still outstanding
  | "payment_pending"     // payment started/awaited without an explicit acceptance
  | "registered"          // fully in: paid, waived, or free tournament acceptance
  | "declined";           // declined / withdrawn / cancelled

export interface EntrantRowLike {
  status?: string | null;
  confirmed_at?: string | null;
  confirmation_source?: string | null;
  paid_at?: string | null;
  fee_paid_cents?: number | null;
  invited_at?: string | null;
  invited_by_admin?: boolean | null;
  club_member_id?: string | null;
}

export interface EntrantContext {
  /** Tournament charges an entry fee AND payment is required before entry counts. */
  paymentRequired?: boolean;
}

const REGISTERED_STATUSES = new Set(["paid", "waived", "registered", "active"]);
const DECLINED_STATUSES = new Set(["cancelled", "declined", "withdrawn"]);
const PAYMENT_STATUSES = new Set(["pending_payment", "pending_eft"]);

export function normalizeEntrantStatus(status?: string | null): RawEntrantStatus {
  return String(status || "").trim().toLowerCase();
}

export function hasPaid(row: EntrantRowLike): boolean {
  const s = normalizeEntrantStatus(row.status);
  return REGISTERED_STATUSES.has(s) || !!row.paid_at || Number(row.fee_paid_cents || 0) > 0;
}

export function hasAccepted(row: EntrantRowLike): boolean {
  if (DECLINED_STATUSES.has(normalizeEntrantStatus(row.status))) return false;
  return !!row.confirmed_at || hasPaid(row);
}

export function classifyEntrant(row: EntrantRowLike, ctx: EntrantContext = {}): EntrantCategory {
  const s = normalizeEntrantStatus(row.status);
  if (DECLINED_STATUSES.has(s)) return "declined";
  if (hasPaid(row)) return "registered";
  if (row.confirmed_at) {
    // Accepted. Only a mandatory-fee tournament keeps them out of the draw.
    return ctx.paymentRequired ? "accepted" : "registered";
  }
  if (PAYMENT_STATUSES.has(s)) return "payment_pending";
  return "pending_invite";
}

export const ENTRANT_CATEGORY_LABEL: Record<EntrantCategory, string> = {
  pending_invite: "Invited — no response",
  accepted: "Accepted — fee due",
  payment_pending: "Payment pending",
  registered: "Registered",
  declined: "Declined",
};

export const ENTRANT_CATEGORY_VARIANT: Record<
  EntrantCategory,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending_invite: "outline",
  accepted: "secondary",
  payment_pending: "outline",
  registered: "default",
  declined: "destructive",
};

export function entrantStatusLabel(row: EntrantRowLike, ctx: EntrantContext = {}): string {
  return ENTRANT_CATEGORY_LABEL[classifyEntrant(row, ctx)];
}

/**
 * Is this entrant actually taking part? Only these rows may appear on the
 * Players list, feed the allocation step, or count towards the draw size.
 */
export function isParticipatingEntrant(row: EntrantRowLike, ctx: EntrantContext = {}): boolean {
  return classifyEntrant(row, ctx) === "registered";
}

export function filterParticipatingEntrants<T extends EntrantRowLike>(
  rows: T[] | null | undefined,
  ctx: EntrantContext = {},
): T[] {
  return (rows || []).filter((r) => isParticipatingEntrant(r, ctx));
}

export function countEntrantsByCategory(
  rows: EntrantRowLike[] | null | undefined,
  ctx: EntrantContext = {},
): Record<EntrantCategory, number> {
  const counts: Record<EntrantCategory, number> = {
    pending_invite: 0,
    accepted: 0,
    payment_pending: 0,
    registered: 0,
    declined: 0,
  };
  for (const r of rows || []) counts[classifyEntrant(r, ctx)] += 1;
  return counts;
}

/**
 * Split participating entrants into those the organiser can place in a division
 * (they belong to one of the tournament's source leagues) and those who accepted
 * an open "all club members" invitation with no league of their own.
 */
export function partitionByDivisionAssignment<T extends EntrantRowLike>(
  rows: T[] | null | undefined,
  memberLeagueIds: Map<string, string[]> | ((memberId: string) => boolean),
  ctx: EntrantContext = {},
): { assigned: T[]; needsDivision: T[] } {
  const has = typeof memberLeagueIds === "function"
    ? memberLeagueIds
    : (id: string) => (memberLeagueIds.get(id) || []).length > 0;
  const assigned: T[] = [];
  const needsDivision: T[] = [];
  for (const r of filterParticipatingEntrants(rows, ctx)) {
    const id = r.club_member_id || "";
    if (id && has(id)) assigned.push(r);
    else needsDivision.push(r);
  }
  return { assigned, needsDivision };
}
