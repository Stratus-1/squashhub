// Help Center product action API: approved human reply or explicit status transition.
// Same workload/IAP/operator/tenant rules as help-center-case-context, plus a product-side
// SquashHub platform-admin check for the IAP email. Fail closed; never logs case content.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.2.3";
import { parseOperatorEmails } from "../help-center-case-context/context-contract.ts";
import { httpStatusFor, parseCaseAction, requestHash } from "./contract.ts";
import { sendAppEmail } from "../_shared/send-app-email.ts";

const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const IAP_KEYS = createRemoteJWKSet(new URL("https://www.gstatic.com/iap/verify/public_key-jwk"));
const MAX_BODY_BYTES = 16_384;
const SITE_ORIGIN = "https://squashhub.co.za";

const respond = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
  },
});

/** Mirrors help-center-case-context authorization exactly; returns the verified operator email. */
async function authorize(req: Request): Promise<{ tenantScope: string; operatorEmail: string } | null> {
  const audience = Deno.env.get("HELP_CENTER_READ_AUDIENCE") ?? "";
  const serviceAccount = (Deno.env.get("HELP_CENTER_CALLER_SERVICE_ACCOUNT") ?? "").trim().toLowerCase();
  const iapAudience = Deno.env.get("HELP_CENTER_IAP_AUDIENCE") ?? "";
  const tenantScope = Deno.env.get("HELP_CENTER_TENANT_SCOPE") ?? "";
  const operators = parseOperatorEmails(Deno.env.get("HELP_CENTER_OPERATOR_EMAILS"));
  const auth = req.headers.get("authorization") ?? "";
  const workloadToken = auth.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/)?.[1];
  const iapAssertion = req.headers.get("x-help-center-operator-assertion") ?? "";
  if (!audience || !serviceAccount || !iapAudience || !tenantScope || !operators.size || !workloadToken || !iapAssertion) return null;
  let email = "";
  try {
    const workload = await jwtVerify(workloadToken, GOOGLE_KEYS, {
      algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"], audience, clockTolerance: 30,
    });
    const workloadEmail = typeof workload.payload.email === "string" ? workload.payload.email.toLowerCase() : "";
    if (!workload.payload.sub || workloadEmail !== serviceAccount || workload.payload.email_verified !== true) return null;
    const operator = await jwtVerify(iapAssertion, IAP_KEYS, {
      algorithms: ["ES256"], issuer: "https://cloud.google.com/iap", audience: iapAudience, clockTolerance: 30,
    });
    email = typeof operator.payload.email === "string" ? operator.payload.email.toLowerCase() : "";
    const now = Math.floor(Date.now() / 1000);
    const iat = operator.payload.iat;
    const exp = operator.payload.exp;
    if (!operator.payload.sub || !operators.has(email) || typeof iat !== "number" || typeof exp !== "number"
      || iat > now + 30 || exp <= now - 30 || exp - iat > 660) return null;
  } catch {
    return null;
  }
  if (req.headers.get("x-help-center-tenant-scope") !== tenantScope) return null;
  return { tenantScope, operatorEmail: email };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return respond(405, { error: "method_not_allowed" });
  const access = await authorize(req);
  if (!access) return respond(404, { error: "case_action_unavailable" });

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return respond(400, { error: "invalid_request" });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return respond(400, { error: "invalid_request" }); }
  const action = parseCaseAction(parsed);
  if (!action) return respond(400, { error: "invalid_request" });
  // Exact tenant mapping: body, header and configured scope must all match.
  if (action.tenant_scope_ref !== access.tenantScope) return respond(404, { error: "case_action_unavailable" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond(503, { error: "case_action_unavailable" });
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Product authority: the IAP email must be exactly one existing auth user with the platform admin role.
  const { data: actor, error: actorError } = await db.rpc("help_center_resolve_platform_operator", { p_email: access.operatorEmail });
  if (actorError) return respond(503, { error: "case_action_unavailable" });
  if (typeof actor !== "string" || !actor) return respond(403, { error: "forbidden" });

  const { data: result, error } = await db.rpc("help_center_apply_case_action", {
    p_action: action.action,
    p_event_id: action.event_id,
    p_expected_revision: action.expected_revision,
    p_idempotency_key: action.idempotency_key,
    p_request_hash: await requestHash(action),
    p_actor_user_id: actor,
    p_message: action.action === "reply" ? action.message : null,
    p_target_status: action.action === "set_status" ? action.target_status : null,
  });
  const r = result as Record<string, unknown> | null;
  if (error || !r) return respond(503, { error: "case_action_unavailable" });
  if (r.ok !== true) return respond(httpStatusFor(String(r.error)), { error: String(r.error) });

  let notification: "sent" | "skipped" | "failed" | "not_applicable" = "not_applicable";
  if (action.action === "reply" && r.replayed !== true && typeof r.ticket_id === "string" && typeof r.message_id === "string") {
    notification = "failed";
    try {
      const { data: thread } = await db.from("support_threads").select("id,user_id,subject").eq("id", r.ticket_id).maybeSingle();
      // Recipient is always the ticket owner; the caller can never choose one.
      if (!thread?.user_id || thread.user_id === actor) notification = "skipped";
      else {
        const { data: owner } = await db.from("profiles").select("email,name").eq("id", thread.user_id).maybeSingle();
        if (!owner?.email) notification = "skipped";
        else {
          const sent = await sendAppEmail({
            templateName: "support-admin-reply",
            recipientEmail: owner.email,
            idempotencyKey: `support-reply-${r.message_id}`,
            templateData: {
              subject: thread.subject,
              message: action.message,
              threadUrl: `${SITE_ORIGIN}/support?threadId=${thread.id}`,
              recipientName: owner.name || "",
            },
          });
          notification = sent.ok ? "sent" : "failed";
        }
      }
    } catch {
      notification = "failed";
    }
  }

  return respond(200, {
    contract_version: "1.0",
    action: r.action,
    source_revision: r.source_revision,
    resulting_status: r.resulting_status,
    replayed: r.replayed === true,
    notification,
  });
});
