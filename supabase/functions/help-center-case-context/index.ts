// Product-owned, read-only support context for the Stratus Help Center.
// Access is on demand and fail-closed. This function never writes product data,
// exposes attachments or identities, or logs case content. Failures log only a
// sanitized diagnostic code (see diagnostics.ts); public responses are unchanged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.2.3";
import { fitContextPayload, parseOperatorEmails, projectMessages } from "./context-contract.ts";
import { dbDetail, type DiagCode, type DiagDetail, joseDetail, logDiag } from "./diagnostics.ts";

const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const IAP_KEYS = createRemoteJWKSet(new URL("https://www.gstatic.com/iap/verify/public_key-jwk"));
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_RESPONSE_BYTES = 15_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = new Set(["open", "pending", "waiting", "in_progress"]);
const CONTEXT_EVENT_TYPES = new Set(["case.created", "case.updated"]);

const reply = (status: number, error: string) => new Response(JSON.stringify({ error }), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
  },
});

/** Logs a sanitized code and returns the unchanged public fail-closed response. */
const fail = (status: 404 | 503, code: DiagCode, detail?: DiagDetail) => {
  logDiag(code, detail);
  return reply(status, "case_context_unavailable");
};

type AuthResult = { ok: true; tenantScope: string } | { ok: false; code: DiagCode; detail?: DiagDetail };

async function authorize(req: Request): Promise<AuthResult> {
  const audience = Deno.env.get("HELP_CENTER_READ_AUDIENCE") ?? "";
  const serviceAccount = (Deno.env.get("HELP_CENTER_CALLER_SERVICE_ACCOUNT") ?? "").trim().toLowerCase();
  const iapAudience = Deno.env.get("HELP_CENTER_IAP_AUDIENCE") ?? "";
  const tenantScope = Deno.env.get("HELP_CENTER_TENANT_SCOPE") ?? "";
  const operators = parseOperatorEmails(Deno.env.get("HELP_CENTER_OPERATOR_EMAILS"));
  const auth = req.headers.get("authorization") ?? "";
  const workloadToken = auth.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/)?.[1];
  const iapAssertion = req.headers.get("x-help-center-operator-assertion") ?? "";

  const missing: string[] = [];
  if (!audience) missing.push("HELP_CENTER_READ_AUDIENCE");
  if (!serviceAccount) missing.push("HELP_CENTER_CALLER_SERVICE_ACCOUNT");
  if (!iapAudience) missing.push("HELP_CENTER_IAP_AUDIENCE");
  if (!tenantScope) missing.push("HELP_CENTER_TENANT_SCOPE");
  if (missing.length) return { ok: false, code: "missing_config", detail: { missing } };
  // Absent, malformed or empty allowlists all parse to an empty set.
  if (!operators.size) return { ok: false, code: "missing_allowlist", detail: { missing: ["HELP_CENTER_OPERATOR_EMAILS"] } };
  if (!workloadToken) return { ok: false, code: "missing_workload_token" };
  if (!iapAssertion) return { ok: false, code: "missing_iap_assertion" };

  let workload;
  try {
    workload = await jwtVerify(workloadToken, GOOGLE_KEYS, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
      clockTolerance: 30,
    });
  } catch (error) {
    return { ok: false, code: "invalid_workload_token", detail: joseDetail(error) };
  }
  const workloadEmail = typeof workload.payload.email === "string" ? workload.payload.email.toLowerCase() : "";
  if (!workload.payload.sub || workloadEmail !== serviceAccount || workload.payload.email_verified !== true) {
    return { ok: false, code: "workload_identity_mismatch" };
  }

  let operator;
  try {
    operator = await jwtVerify(iapAssertion, IAP_KEYS, {
      algorithms: ["ES256"],
      issuer: "https://cloud.google.com/iap",
      audience: iapAudience,
      clockTolerance: 30,
    });
  } catch (error) {
    return { ok: false, code: "invalid_iap_assertion", detail: joseDetail(error) };
  }
  const email = typeof operator.payload.email === "string" ? operator.payload.email.toLowerCase() : "";
  if (!operator.payload.sub || !operators.has(email)) return { ok: false, code: "operator_not_allowlisted" };
  const now = Math.floor(Date.now() / 1000);
  const issuedAt = operator.payload.iat;
  const expiresAt = operator.payload.exp;
  if (typeof issuedAt !== "number" || typeof expiresAt !== "number"
    || issuedAt > now + 30 || expiresAt <= now - 30 || expiresAt - issuedAt > 660) {
    return { ok: false, code: "iap_time_bounds" };
  }

  if (req.headers.get("x-help-center-tenant-scope") !== tenantScope) return { ok: false, code: "tenant_mismatch" };
  return { ok: true, tenantScope };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return reply(405, "method_not_allowed");
  const access = await authorize(req);
  if (!access.ok) return fail(404, access.code, access.detail);

  const eventId = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (!UUID_RE.test(eventId)) return fail(404, "invalid_event_id");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    const missing = [!supabaseUrl && "SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean) as string[];
    return fail(503, "missing_service_config", { missing });
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: event, error: eventError } = await db.from("help_center_ticket_outbox")
    .select("event_id,ticket_id,status,revision,ticket_created_at,ticket_updated_at,event_type,held_at")
    .eq("event_id", eventId).maybeSingle();
  if (eventError) return fail(404, "event_lookup_failed", dbDetail(eventError));
  if (!event) return fail(404, "event_not_found");
  // Held rows are only observed here, never modified.
  if (event.held_at) return fail(404, "event_held");
  if (!CONTEXT_EVENT_TYPES.has(event.event_type)) return fail(404, "event_wrong_type");

  const [{ data: thread, error: threadError }, { data: latest, error: latestError }] = await Promise.all([
    db.rpc("help_center_case_context_thread", { p_ticket: event.ticket_id }).maybeSingle(),
    db.from("help_center_ticket_outbox").select("event_id,revision")
      .eq("ticket_id", event.ticket_id).order("revision", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const sourceThread = thread as {
    ticket_id: string; subject: string | null; status: string; created_at: string; updated_at: string;
  } | null;
  if (threadError) return fail(404, "thread_rpc_failed", dbDetail(threadError));
  if (!sourceThread) {
    // The RPC returns nothing for inactive tickets. A head-only count (no columns,
    // no content) separates a missing ticket from an inactive one for diagnosis.
    const { count, error: countError } = await db.from("support_threads")
      .select("id", { count: "exact", head: true }).eq("id", event.ticket_id);
    if (countError) return fail(404, "thread_rpc_failed", dbDetail(countError));
    return fail(404, count ? "ticket_inactive" : "thread_not_found");
  }
  if (!ACTIVE_STATUSES.has(sourceThread.status)) return fail(404, "ticket_inactive");
  if (event.status !== sourceThread.status) return fail(404, "event_status_mismatch");
  if (Date.parse(event.ticket_created_at) !== Date.parse(sourceThread.created_at)) return fail(404, "ticket_created_mismatch");
  if (latestError) return fail(404, "latest_event_lookup_failed", dbDetail(latestError));
  if (!latest || latest.event_id !== event.event_id) return fail(404, "stale_event");
  if (latest.revision !== event.revision) return fail(404, "stale_revision");

  const { data: sourceMessages, error: messagesError } = await db.rpc(
    "help_center_case_context_messages", { p_ticket: sourceThread.ticket_id },
  );
  if (messagesError || !sourceMessages) return fail(503, "messages_rpc_failed", dbDetail(messagesError));

  const messages = projectMessages(sourceMessages, MAX_MESSAGES, MAX_MESSAGE_CHARS);
  const status = sourceThread.status === "pending" ? "waiting" : sourceThread.status;
  const payload = {
    contract_version: "1.0",
    event_id: event.event_id,
    product_id: "squashhub",
    tenant_scope_ref: access.tenantScope,
    case_revision: event.revision,
    source_status: status,
    category: "product_help",
    priority: "normal",
    subject: typeof sourceThread.subject === "string" && sourceThread.subject.trim() ? sourceThread.subject.slice(0, 180) : "SquashHub support ticket",
    messages,
    context_policy_version: "squashhub-on-demand-context-v1",
    created_at: event.ticket_created_at,
    updated_at: sourceThread.updated_at,
  };
  const bounded = fitContextPayload(payload, MAX_RESPONSE_BYTES);
  if (!bounded) return fail(503, "message_projection_failed");
  logDiag("served", { messages: bounded.messages.length });
  const body = JSON.stringify(bounded);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
