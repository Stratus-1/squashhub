// Product-owned, read-only support context for the Stratus Help Center.
// Access is on demand and fail-closed. This function never writes product data,
// exposes attachments or identities, or logs case content.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.2.3";
import { fitContextPayload, parseOperatorEmails, projectMessages } from "./context-contract.ts";

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

async function authorize(req: Request): Promise<{ tenantScope: string } | null> {
  const audience = Deno.env.get("HELP_CENTER_READ_AUDIENCE") ?? "";
  const serviceAccount = (Deno.env.get("HELP_CENTER_CALLER_SERVICE_ACCOUNT") ?? "").trim().toLowerCase();
  const iapAudience = Deno.env.get("HELP_CENTER_IAP_AUDIENCE") ?? "";
  const tenantScope = Deno.env.get("HELP_CENTER_TENANT_SCOPE") ?? "";
  const operators = parseOperatorEmails(Deno.env.get("HELP_CENTER_OPERATOR_EMAILS"));
  const auth = req.headers.get("authorization") ?? "";
  const workloadToken = auth.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/)?.[1];
  const iapAssertion = req.headers.get("x-help-center-operator-assertion") ?? "";
  if (!audience || !serviceAccount || !iapAudience || !tenantScope || !operators.size || !workloadToken || !iapAssertion) return null;

  try {
    const workload = await jwtVerify(workloadToken, GOOGLE_KEYS, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
      clockTolerance: 30,
    });
    const workloadEmail = typeof workload.payload.email === "string" ? workload.payload.email.toLowerCase() : "";
    if (!workload.payload.sub || workloadEmail !== serviceAccount || workload.payload.email_verified !== true) return null;

    const operator = await jwtVerify(iapAssertion, IAP_KEYS, {
      algorithms: ["ES256"],
      issuer: "https://cloud.google.com/iap",
      audience: iapAudience,
      clockTolerance: 30,
    });
    const email = typeof operator.payload.email === "string" ? operator.payload.email.toLowerCase() : "";
    const now = Math.floor(Date.now() / 1000);
    const issuedAt = operator.payload.iat;
    const expiresAt = operator.payload.exp;
    if (!operator.payload.sub || !operators.has(email)
      || typeof issuedAt !== "number" || typeof expiresAt !== "number"
      || issuedAt > now + 30 || expiresAt <= now - 30 || expiresAt - issuedAt > 660) return null;
  } catch {
    return null;
  }

  if (req.headers.get("x-help-center-tenant-scope") !== tenantScope) return null;
  return { tenantScope };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return reply(405, "method_not_allowed");
  const access = await authorize(req);
  if (!access) return reply(404, "case_context_unavailable");

  const eventId = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (!UUID_RE.test(eventId)) return reply(404, "case_context_unavailable");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply(503, "case_context_unavailable");

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: event, error: eventError } = await db.from("help_center_ticket_outbox")
    .select("event_id,ticket_id,status,revision,ticket_created_at,ticket_updated_at,event_type,held_at")
    .eq("event_id", eventId).maybeSingle();
  if (eventError || !event || event.held_at || !CONTEXT_EVENT_TYPES.has(event.event_type)) return reply(404, "case_context_unavailable");

  const [{ data: allowed }, { data: thread, error: threadError }, { data: latest }] = await Promise.all([
    db.from("help_center_pilot_allowlist").select("ticket_id").eq("ticket_id", event.ticket_id).maybeSingle(),
    db.rpc("help_center_case_context_thread", { p_ticket: event.ticket_id }).maybeSingle(),
    db.from("help_center_ticket_outbox").select("event_id,revision")
      .eq("ticket_id", event.ticket_id).order("revision", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const sourceThread = thread as {
    ticket_id: string; subject: string | null; status: string; created_at: string; updated_at: string;
  } | null;
  if (!allowed || threadError || !sourceThread || !ACTIVE_STATUSES.has(sourceThread.status) || event.status !== sourceThread.status
    || Date.parse(event.ticket_created_at) !== Date.parse(sourceThread.created_at)
    || !latest || latest.event_id !== event.event_id || latest.revision !== event.revision) {
    return reply(404, "case_context_unavailable");
  }

  const { data: sourceMessages, error: messagesError } = await db.rpc(
    "help_center_case_context_messages", { p_ticket: sourceThread.ticket_id },
  );
  if (messagesError || !sourceMessages) return reply(503, "case_context_unavailable");

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
  if (!bounded) return reply(503, "case_context_unavailable");
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
