/**
 * Canonical tournament invitation links.
 *
 * One URL shape is used by every channel (in-app notification, email and —
 * once it ships — WhatsApp): https://<club>.squashhub.co.za/i/<token>
 *
 * The token is a 256-bit random string minted by the database
 * (`ensure_tournament_invite_tokens`). It never contains member ids or any
 * other identifying information.
 */

export const INVITE_PATH_PREFIX = "/i";
const ROOT_HOST = "squashhub.co.za";

export function inviteePath(token: string): string {
  return `${INVITE_PATH_PREFIX}/${encodeURIComponent(token)}`;
}

/** Absolute, tenant-aware invitation URL — the same link for email/app/WhatsApp. */
export function buildInviteUrl(token: string, subdomain?: string | null): string {
  const path = inviteePath(token);
  if (subdomain) return `https://${subdomain}.${ROOT_HOST}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}${path}`;
  return `https://${ROOT_HOST}${path}`;
}

export type InvitePayload = {
  found: boolean;
  champ_id?: string;
  tournament_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  registration_closes_at?: string | null;
  entry_fee_cents?: number | null;
  payment_required?: boolean | null;
  division_label?: string | null;
  invitee_name?: string | null;
  club_name?: string | null;
  status?: string | null;
  confirmed_at?: string | null;
  declined_at?: string | null;
  revoked?: boolean;
  registration_closed?: boolean;
  tournament_status?: string | null;
  is_invitee?: boolean;
  requires_login?: boolean;
  /** False when the invited membership has never been claimed by an account. */
  member_has_account?: boolean;
};

export type InviteState =
  | "not_found"
  | "revoked"
  | "declined"
  | "registered"
  | "payment_pending"
  | "closed"
  | "needs_login"
  | "needs_signup"
  | "actionable";


const PAID_STATUSES = new Set(["paid", "waived", "registered", "active"]);
const PENDING_PAYMENT_STATUSES = new Set(["pending_payment", "pending_eft", "payment_pending"]);

/** Single source of truth for what the landing page should offer the visitor. */
export function inviteState(payload: InvitePayload | null | undefined): InviteState {
  if (!payload || !payload.found) return "not_found";
  if (payload.revoked) return "revoked";

  const status = String(payload.status || "").toLowerCase();
  if (status === "cancelled" || payload.declined_at) return "declined";
  if (PAID_STATUSES.has(status)) return "registered";
  // Accepted but not yet paid — always route to payment, even after close.
  if (payload.confirmed_at && PENDING_PAYMENT_STATUSES.has(status)) return "payment_pending";
  if (payload.registration_closed) return "closed";
  if (!payload.is_invitee) {
    // The invited membership has never been claimed by a login — the visitor
    // has to create an account (or claim their membership) first.
    return payload.member_has_account === false ? "needs_signup" : "needs_login";
  }
  return "actionable";

}

export function inviteFeeCents(payload: InvitePayload | null | undefined): number {
  if (!payload?.payment_required) return 0;
  return Math.max(0, Number(payload.entry_fee_cents || 0));
}

/** Where to send the visitor after a successful accept. */
export function afterAcceptPath(champId: string, responseStatus: string | null | undefined): string {
  const status = String(responseStatus || "").toLowerCase();
  if (PENDING_PAYMENT_STATUSES.has(status)) return `/club-champs/${champId}?pay=1`;
  return `/club-champs/${champId}`;
}

/** Login round-trip that preserves the invitation context. */
export function inviteLoginPath(token: string): string {
  return `/auth?redirectTo=${encodeURIComponent(inviteePath(token))}`;
}

/** Sign-up / claim-membership round-trip that preserves the invitation context. */
export function inviteSignupPath(token: string): string {
  return `/auth?intent=claim&redirectTo=${encodeURIComponent(inviteePath(token))}`;
}

}
