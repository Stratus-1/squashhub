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

/**
 * Saved progress of an unfinished self-application (server-side, owner-only
 * via `get_my_application_progress` / `save_my_application_progress`), so the
 * applicant resumes on any device. Never holds passwords, tokens or photos;
 * fees and the fee category are only written when the steps are finished.
 */
export interface ApplicationProgress {
  v: 1;
  stepId: string;
  savedAt: string;
  answers: {
    name?: string;
    phone?: string;
    idNumber?: string;
    dateOfBirth?: string;
    gender?: string;
    address?: string;
    skillLevel?: string;
    feeCategoryId?: string;
    playsLeague?: boolean;
    leagueSelections?: Record<string, unknown>;
    rulesAccepted?: boolean;
    familyDrafts?: unknown[];
  };
}

const SECRET_KEYS = /pass(word)?|token|secret|otp|pin/i;

export function buildApplicationProgress(stepId: string, answers: ApplicationProgress["answers"], now = new Date()): ApplicationProgress {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (SECRET_KEYS.test(k) || v === undefined) continue;
    clean[k] = v;
  }
  return { v: 1, stepId, savedAt: now.toISOString(), answers: clean as ApplicationProgress["answers"] };
}

export function parseApplicationProgress(raw: unknown): ApplicationProgress | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  if (r.v !== 1 || typeof r.stepId !== "string" || !r.answers || typeof r.answers !== "object") return null;
  return r as ApplicationProgress;
}

/** Index to reopen at: the saved step if it still exists, never the final "done" step. */
export function resumeStepIndex(stepIds: string[], savedStepId: string): number {
  const i = stepIds.indexOf(savedStepId);
  if (i < 0) return 0;
  const doneAt = stepIds.indexOf("done");
  return doneAt >= 0 && i >= doneAt ? Math.max(doneAt - 1, 0) : i;
}
