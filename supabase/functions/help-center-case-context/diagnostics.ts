// Sanitized diagnostics for the private case-context boundary.
// Log lines carry only a fixed code plus allowlisted, value-free detail
// (config NAMES, jose error codes/claim names, PostgREST error codes).
// Never pass event/ticket IDs, emails, tenant values or message content here.

export type DiagCode =
  | "missing_config"
  | "missing_allowlist"
  | "missing_workload_token"
  | "missing_iap_assertion"
  | "invalid_workload_token"
  | "workload_identity_mismatch"
  | "invalid_iap_assertion"
  | "operator_not_allowlisted"
  | "iap_time_bounds"
  | "tenant_mismatch"
  | "invalid_event_id"
  | "missing_service_config"
  | "event_lookup_failed"
  | "event_not_found"
  | "event_held"
  | "event_wrong_type"
  | "thread_rpc_failed"
  | "thread_not_found"
  | "ticket_inactive"
  | "event_status_mismatch"
  | "ticket_created_mismatch"
  | "latest_event_lookup_failed"
  | "stale_event"
  | "stale_revision"
  | "messages_rpc_failed"
  | "message_projection_failed"
  | "served";

const CONFIG_NAMES = new Set([
  "HELP_CENTER_READ_AUDIENCE",
  "HELP_CENTER_CALLER_SERVICE_ACCOUNT",
  "HELP_CENTER_IAP_AUDIENCE",
  "HELP_CENTER_TENANT_SCOPE",
  "HELP_CENTER_OPERATOR_EMAILS",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
const CLAIMS = new Set(["aud", "iss", "exp", "nbf", "iat", "sub", "email", "email_verified"]);

export type DiagDetail = {
  missing?: string[];
  jose_code?: string;
  jose_claim?: string;
  db_code?: string;
  messages?: number;
};

/** Keeps only value-free fields; anything else is dropped. */
export function sanitizeDetail(detail: DiagDetail = {}): DiagDetail {
  const out: DiagDetail = {};
  if (Array.isArray(detail.missing)) {
    const names = detail.missing.filter((name) => CONFIG_NAMES.has(name));
    if (names.length) out.missing = names;
  }
  if (typeof detail.jose_code === "string" && /^ERR_[A-Z_]{1,64}$/.test(detail.jose_code)) out.jose_code = detail.jose_code;
  if (typeof detail.jose_claim === "string" && CLAIMS.has(detail.jose_claim)) out.jose_claim = detail.jose_claim;
  if (typeof detail.db_code === "string" && /^[A-Z0-9]{1,10}$/.test(detail.db_code)) out.db_code = detail.db_code;
  if (typeof detail.messages === "number" && Number.isInteger(detail.messages) && detail.messages >= 0 && detail.messages <= 100) out.messages = detail.messages;
  return out;
}

/** Extracts only the jose error code and claim name, never the message. */
export function joseDetail(error: unknown): DiagDetail {
  const e = error as { code?: unknown; claim?: unknown } | null;
  return sanitizeDetail({
    jose_code: typeof e?.code === "string" ? e.code : "ERR_UNKNOWN",
    jose_claim: typeof e?.claim === "string" ? e.claim : undefined,
  });
}

export function dbDetail(error: unknown): DiagDetail {
  const e = error as { code?: unknown } | null;
  return sanitizeDetail({ db_code: typeof e?.code === "string" ? e.code : undefined });
}

export function logDiag(code: DiagCode, detail?: DiagDetail): void {
  const line = JSON.stringify({ fn: "help-center-case-context", diag_code: code, ...sanitizeDetail(detail) });
  if (code === "served") console.log(line);
  else console.warn(line);
}
