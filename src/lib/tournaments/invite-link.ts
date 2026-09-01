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

export type InviteDivision = {
  group_number: number;
  label: string;
  gender?: string | null;
  format?: string | null;
  match_type?: string | null;
};

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
  /** Divisions this invitee may enter — a player may pick more than one. */
  divisions?: InviteDivision[] | null;
  /** Divisions already chosen by this invitee. */
  selected_divisions?: number[] | null;
  /** 'time_capped_points' = Bells: all leagues run at once, so only one entry. */
  scoring_mode?: string | null;

  /** 'club' = courts booked by the club, 'self' = players arrange their own games. */
  scheduling_mode?: string | null;
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
  /** True when the token can be answered without signing in. */
  can_respond_public?: boolean;
  /** What lightweight detail the visitor must supply to prove the link is theirs. */
  verification_kind?: "none" | "phone_last4" | "surname" | null;
  /** Set by the organiser-only preview payload — nothing may be mutated. */
  test?: boolean;
  /** False when the invited membership has never been claimed by an account. */
  member_has_account?: boolean;
};

/** Normalised division list from an invite payload. */
export function inviteDivisions(payload: InvitePayload | null | undefined): InviteDivision[] {
  const raw = Array.isArray(payload?.divisions) ? payload!.divisions! : [];
  return raw
    .map((d) => ({
      group_number: Number((d as any)?.group_number),
      label: String((d as any)?.label || "").trim() || `League ${(d as any)?.group_number}`,
      gender: (d as any)?.gender ?? null,
      format: (d as any)?.format ?? null,
      match_type: (d as any)?.match_type ?? null,
    }))
    .filter((d) => Number.isFinite(d.group_number) && d.group_number > 0);
}

/** The invitee must pick when the tournament runs more than one division. */
export function requiresDivisionChoice(payload: InvitePayload | null | undefined): boolean {
  return inviteDivisions(payload).length > 1;
}

/**
 * What to pre-tick: whatever the invitee already chose, otherwise the single
 * division when there is only one to enter.
 */
export function defaultDivisionSelection(payload: InvitePayload | null | undefined): number[] {
  const divisions = inviteDivisions(payload);
  const chosen = (payload?.selected_divisions || [])
    .map((n) => Number(n))
    .filter((n) => divisions.some((d) => d.group_number === n));
  if (chosen.length > 0) return chosen;
  return divisions.length === 1 ? [divisions[0].group_number] : [];
}


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
  // A recipient-specific token is proof of invitation. Anyone holding it may
  // respond without a SquashHub login; a forwarded link is stopped by the
  // token-bound verification step below, not by a login wall.
  if (payload.can_respond_public) return "actionable";
  if (!payload.is_invitee) {
    // Legacy payloads (pre public-response RPC) still fall back to login.
    return payload.member_has_account === false ? "needs_signup" : "needs_login";
  }
  return "actionable";

}

/**
 * Lightweight recipient check required before a public (not signed-in)
 * visitor may accept or decline. Signed-in invitees are already proven.
 */
export function inviteVerificationKind(
  payload: InvitePayload | null | undefined,
): "none" | "phone_last4" | "surname" {
  if (!payload || payload.is_invitee) return "none";
  const kind = payload.verification_kind;
  return kind === "phone_last4" || kind === "surname" ? kind : "none";
}

export function inviteVerificationLabel(kind: "none" | "phone_last4" | "surname"): string {
  if (kind === "phone_last4") return "Last 4 digits of your cellphone number";
  if (kind === "surname") return "Your surname";
  return "";
}

/** Client-side sanity check so obvious typos never hit the server. */
export function isInviteVerificationComplete(
  kind: "none" | "phone_last4" | "surname",
  value: string,
): boolean {
  if (kind === "none") return true;
  const v = (value || "").trim();
  if (kind === "phone_last4") return v.replace(/\D/g, "").length >= 4;
  return v.length >= 2;
}

/** Organiser test-invite landing page — always non-mutating. */
export function inviteTestPath(champId: string): string {
  return `${INVITE_PATH_PREFIX}/test/${encodeURIComponent(champId)}`;
}

export function buildInviteTestUrl(champId: string, subdomain?: string | null): string {
  const path = inviteTestPath(champId);
  if (subdomain) return `https://${subdomain}.${ROOT_HOST}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}${path}`;
  return `https://${ROOT_HOST}${path}`;
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
