// Help Center ticket feed publisher.
// Drains public.help_center_ticket_outbox and POSTs redacted ticket metadata to the
// Help Center HMAC ingress. SquashHub stays authoritative; only opaque ticket UUID,
// status, revision and timestamps leave the platform, with static redacted text.
// Never exports subject, messages/previews, user identity, attachments, AI context
// or maintenance data. Fails closed until every config secret is set exactly.
import { createClient } from "npm:@supabase/supabase-js@2";

const REDACTION_POLICY = "squashhub-ticket-metadata-v1";
const CONTRACT_VERSION = "1.0";
const SIGN_METHOD = "POST";
const SIGN_PATH = "/v1/support/tickets";
const EVENT_TYPES = new Set(["case.created", "case.updated", "case.deleted"]);
const KEY_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const REDACTED_TITLE = "SquashHub support ticket";
const REDACTED_SUMMARY = "Details are held in SquashHub and are not exported.";
const TENANT_SCOPE_RE = /^[a-z0-9][a-z0-9._:-]{2,63}$/;
const ALLOWED_STATUS = new Set(["open", "waiting", "in_progress", "resolved", "closed"]);
// support_threads has no category/priority fields; receiver contract requires fixed values.
const CONTRACT_CATEGORY = "product_help";
const CONTRACT_PRIORITY = "normal";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 12;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256Hex(message: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(message)));
}
async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

type OutboxRow = {
  id: number; event_id: string; ticket_id: string; status: string; revision: number;
  ticket_created_at: string; ticket_updated_at: string; enqueued_at: string;
  event_type: string; correlation_id: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(500, { error: "runtime_unconfigured" });
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Dedicated dispatch secret (stored privately in the database, never the service role).
  const token = req.headers.get("x-dispatch-secret") ?? "";
  const { data: okToken, error: vErr } = await db.rpc("help_center_verify_dispatch", { p_token: token });
  if (vErr || okToken !== true) return json(401, { error: "unauthorized" });

  // Delivery gate (paused by default; pilot = server-side allowlist only). The
  // claim RPC enforces the same gate; this early exit also avoids touching cron.
  const { data: modeRaw, error: mErr } = await db.rpc("help_center_delivery_mode");
  const mode = !mErr && (modeRaw === "pilot" || modeRaw === "live") ? modeRaw : "paused";
  if (mode === "paused") {
    console.log(JSON.stringify({ fn: "help-center-ticket-feed", event: "paused" }));
    return json(200, { delivered: 0, failed: 0, mode });
  }

  // Fail closed until exact configuration exists.
  const ingressUrl = Deno.env.get("HELP_CENTER_INGRESS_URL") ?? "";
  const hmacKey = Deno.env.get("HELP_CENTER_HMAC_KEY") ?? "";
  const tenantScope = Deno.env.get("HELP_CENTER_TENANT_SCOPE") ?? "";
  const redactionPolicy = Deno.env.get("HELP_CENTER_REDACTION_POLICY") ?? "";
  const keyId = Deno.env.get("HELP_CENTER_KEY_ID") ?? "";
  const missing: string[] = [];
  let urlOk = false;
  try { const u = new URL(ingressUrl); urlOk = u.protocol === "https:" && u.pathname === SIGN_PATH && !u.search; } catch { /* invalid */ }
  if (!urlOk) missing.push("HELP_CENTER_INGRESS_URL");
  if (!KEY_ID_RE.test(keyId)) missing.push("HELP_CENTER_KEY_ID");
  if (hmacKey.length < 32) missing.push("HELP_CENTER_HMAC_KEY");
  if (!TENANT_SCOPE_RE.test(tenantScope)) missing.push("HELP_CENTER_TENANT_SCOPE");
  if (redactionPolicy !== REDACTION_POLICY) missing.push("HELP_CENTER_REDACTION_POLICY");
  if (hmacKey && (hmacKey === serviceKey || hmacKey === Deno.env.get("AGENT_ADMIN_KEY"))) {
    missing.push("HELP_CENTER_HMAC_KEY");
  }
  if (missing.length) {
    console.warn(JSON.stringify({ fn: "help-center-ticket-feed", event: "fail_closed", missing }));
    return json(503, { error: "not_configured", missing });
  }

  const { data: rows, error: cErr } = await db.rpc("help_center_outbox_claim", { p_limit: 25, p_lease_seconds: 120 });
  if (cErr) return json(500, { error: "claim_failed" });

  let delivered = 0, failed = 0;
  for (const r of (rows ?? []) as OutboxRow[]) {
    // Map source status to the receiver's strict enum; fail closed per event on unknown values.
    const mappedStatus = r.status === "pending" ? "waiting" : r.status;
    if (!ALLOWED_STATUS.has(mappedStatus)) {
      await db.rpc("help_center_outbox_result", {
        p_id: r.id, p_ok: false, p_error: "invalid_source_status", p_max_attempts: MAX_ATTEMPTS,
      });
      failed++;
      console.warn(JSON.stringify({ fn: "help-center-ticket-feed", event_id: r.event_id, ok: false, err: "invalid_source_status" }));
      continue;
    }
    const payload = {
      contract_version: CONTRACT_VERSION,
      event_id: r.event_id,
      event_type: EVENT_TYPES.has(r.event_type) ? r.event_type : "case.updated",
      product_case_ref: r.ticket_id,
      case_revision: r.revision,
      tenant_scope_ref: tenantScope,
      category: CONTRACT_CATEGORY,
      priority: CONTRACT_PRIORITY,
      source_status: mappedStatus,
      redacted_title: REDACTED_TITLE,
      redacted_summary: REDACTED_SUMMARY,
      redaction_policy_version: REDACTION_POLICY,
      created_at: r.ticket_created_at,
      updated_at: r.ticket_updated_at,
      correlation_id: r.correlation_id,
    };
    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    let ok = false, errCode = "";
    try {
      const canonical = `${SIGN_METHOD}\n${SIGN_PATH}\n${ts}\n${await sha256Hex(body)}`;
      const sig = await hmacHex(hmacKey, canonical);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(ingressUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": r.event_id,
          "X-Connector-Key-Id": keyId,
          "X-Connector-Timestamp": ts,
          "X-Connector-Signature": `sha256=${sig}`,
        },
        body,
      }).finally(() => clearTimeout(t));
      await res.body?.cancel();
      // 409 = already ingested under this idempotency key.
      ok = res.ok || res.status === 409;
      if (!ok) errCode = `http_${res.status}`;
    } catch (e) {
      errCode = (e as Error)?.name === "AbortError" ? "timeout" : "network";
    }
    await db.rpc("help_center_outbox_result", {
      p_id: r.id, p_ok: ok, p_error: ok ? null : errCode, p_max_attempts: MAX_ATTEMPTS,
    });
    ok ? delivered++ : failed++;
    console.log(JSON.stringify({ fn: "help-center-ticket-feed", event_id: r.event_id, ok, err: errCode || undefined }));
  }

  const { data: disarmed } = await db.rpc("help_center_outbox_disarm");
  return json(200, { delivered, failed, drained: disarmed === true });
});
