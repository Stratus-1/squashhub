/**
 * New-member application state, shared by the member dashboard (resume the
 * signup steps) and the admin applications panel.
 *
 * A club may auto-assign a member number the moment an applicant's account is
 * created, so "has a member number" can never mean "application finished".
 * An application is only complete once the applicant has saved the signup
 * steps, which always store a fee category.
 */
export interface ApplicationRow {
  role?: string | null;
  fee_category_id?: string | null;
  is_pending_approval?: boolean | null;
  applied_at?: string | null;
  joined_at?: string | null;
  billing_exempt?: boolean | null;
}

const SIGNUP_WINDOW_MS = 10 * 60 * 1000;

/** The row was created by the person's own sign-up (not imported or admin-created). */
export function isSelfApplication(row: ApplicationRow | null | undefined, ownerCreatedAt?: string | null): boolean {
  if (!row) return false;
  if (row.is_pending_approval === true || !!row.applied_at) return true;
  const joined = row.joined_at ? Date.parse(row.joined_at) : NaN;
  const created = ownerCreatedAt ? Date.parse(ownerCreatedAt) : NaN;
  return Number.isFinite(joined) && Number.isFinite(created) && Math.abs(joined - created) < SIGNUP_WINDOW_MS;
}

/** A self-application whose signup steps (details + category) were never saved. */
export function isApplicationIncomplete(row: ApplicationRow | null | undefined, ownerCreatedAt?: string | null): boolean {
  if (!row) return false;
  const role = String(row.role || "").toLowerCase();
  if (role === "visitor" || role === "admin" || role === "captain") return false;
  if (row.billing_exempt) return false;
  return !row.fee_category_id && isSelfApplication(row, ownerCreatedAt);
}

export type ApplicationStatus = "incomplete" | "awaiting_payment" | "awaiting_approval";

export function applicationStatus(
  row: ApplicationRow,
  opts: { ownerCreatedAt?: string | null; unpaidJoiningFees: number },
): ApplicationStatus {
  if (isApplicationIncomplete({ ...row, is_pending_approval: true }, opts.ownerCreatedAt)) return "incomplete";
  if (opts.unpaidJoiningFees > 0) return "awaiting_payment";
  return "awaiting_approval";
}
