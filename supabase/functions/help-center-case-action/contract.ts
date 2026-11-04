// Pure request-contract helpers for help-center-case-action (no I/O).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{16,128}$/;
export const TARGET_STATUSES = new Set(["open", "waiting", "in_progress", "resolved", "closed"]);
export const MAX_REPLY_CHARS = 4000;

export type CaseAction =
  | { action: "reply"; event_id: string; expected_revision: number; tenant_scope_ref: string; idempotency_key: string; message: string }
  | { action: "set_status"; event_id: string; expected_revision: number; tenant_scope_ref: string; idempotency_key: string; target_status: string };

const BASE_KEYS = ["contract_version", "action", "event_id", "expected_revision", "tenant_scope_ref", "idempotency_key"];

/** Strict shape check: unknown keys (e.g. a caller-supplied recipient) are rejected. */
export function parseCaseAction(input: unknown): CaseAction | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const b = input as Record<string, unknown>;
  const extra = b.action === "reply" ? "message" : b.action === "set_status" ? "target_status" : null;
  if (!extra) return null;
  const keys = Object.keys(b);
  if (keys.length !== BASE_KEYS.length + 1 || !keys.every((k) => k === extra || BASE_KEYS.includes(k))) return null;
  if (b.contract_version !== "1.0" || typeof b.event_id !== "string" || !UUID_RE.test(b.event_id)) return null;
  if (typeof b.expected_revision !== "number" || !Number.isSafeInteger(b.expected_revision) || b.expected_revision < 1) return null;
  if (typeof b.tenant_scope_ref !== "string" || !b.tenant_scope_ref || b.tenant_scope_ref.length > 128) return null;
  if (typeof b.idempotency_key !== "string" || !IDEMPOTENCY_RE.test(b.idempotency_key)) return null;
  const base = {
    event_id: b.event_id.toLowerCase(), expected_revision: b.expected_revision,
    tenant_scope_ref: b.tenant_scope_ref, idempotency_key: b.idempotency_key,
  };
  if (b.action === "reply") {
    if (typeof b.message !== "string" || !b.message.trim() || b.message.length > MAX_REPLY_CHARS) return null;
    return { action: "reply", ...base, message: b.message.trim() };
  }
  if (typeof b.target_status !== "string" || !TARGET_STATUSES.has(b.target_status)) return null;
  return { action: "set_status", ...base, target_status: b.target_status };
}

/**
 * Hash of the request identity (the reply text is hashed, never stored).
 * expected_revision is deliberately excluded: a retry of the same key may carry
 * an advanced revision and must replay the saved receipt. First application
 * still enforces expected_revision against the latest event in the RPC.
 */
export async function requestHash(a: CaseAction): Promise<string> {
  const canonical = JSON.stringify([a.action, a.event_id, a.tenant_scope_ref,
    a.action === "reply" ? a.message : a.target_status]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const ERROR_STATUS: Record<string, number> = {
  invalid_request: 400, forbidden: 403, event_unavailable: 404, ticket_inactive: 409,
  event_held: 409, stale_revision: 409, idempotency_conflict: 409, status_unchanged: 409,
};
export const httpStatusFor = (code: string) => ERROR_STATUS[code] ?? 503;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Identical to help-center-case-context's exact operator allowlist parser (kept local so the function bundles alone). */
export function parseOperatorEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 32 || values.some((value) => typeof value !== "string" || !EMAIL_RE.test(value.trim()))) return new Set();
    return new Set(values.map((value: string) => value.trim().toLowerCase()));
  } catch {
    return new Set();
  }
}
