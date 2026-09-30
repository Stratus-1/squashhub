// Help Center ticket feed publisher.
// Drains public.help_center_ticket_outbox and POSTs redacted ticket metadata to the
// Help Center HMAC ingress. SquashHub stays authoritative; only opaque ticket UUID,
// status, revision and timestamps leave the platform, with static redacted text.
// Never exports subject, messages/previews, user identity, attachments, AI context
// or maintenance data. Fails closed until every config secret is set exactly.
import { createClient } from "npm:@supabase/supabase-js@2";

const REDACTION_POLICY = "squashhub-ticket-metadata-v1";
const REDACTED_TITLE = "SquashHub support ticket";
const REDACTED_SUMMARY = "Details are held in SquashHub and are not exported.";
const TENANT_SCOPE_RE = /^[a-z0-9][a-z0-9._:-]{2,63}$/;
const ALLOWED_STATUS = new Set(["open", "pending", "in_progress", "waiting", "resolved", "closed"]);
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 12;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type OutboxRow = {
  id: number; event_id: string; ticket_id: string; status: string; revision: number;
  ticket_created_at: string; ticket_updated_at: string; enqueued_at: string;
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

  // Fail closed until exact configuration exists.
  const ingressUrl = Deno.env.get("HELP_CENTER_INGRESS_URL") ?? "";
  const hmacKey = Deno.env.get("HELP_CENTER_HMAC_KEY") ?? "";
  const tenantScope = Deno.env.get("HELP_CENTER_TENANT_SCOPE") ?? "";
  const redactionPolicy = Deno.env.get("HELP_CENTER_REDACTION_POLICY") ?? "";
  const missing: string[] = [];
  if (!/^https:\/\/[^\s]+$/.test(ingressUrl)) missing.push("HELP_CENTER_INGRESS_URL");
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
    const payload = {
      schema: "squashhub.help_center.ticket.v1",
      redaction_policy: REDACTION_POLICY,
      tenant_scope: tenantScope,
      event_id: r.event_id,
      ticket: {
        id: r.ticket_id,
        status: ALLOWED_STATUS.has(r.status) ? r.status : "other",
        revision: r.revision,
        created_at: r.ticket_created_at,
        updated_at: r.ticket_updated_at,
        title: REDACTED_TITLE,
        summary: REDACTED_SUMMARY,
      },
      emitted_at: r.enqueued_at,
    };
    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    let ok = false, errCode = "";
    try {
      const sig = await hmacHex(hmacKey, `${ts}.${body}`);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(ingressUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": r.event_id,
          "X-HelpCenter-Tenant": tenantScope,
          "X-HelpCenter-Timestamp": ts,
          "X-HelpCenter-Signature": `sha256=${sig}`,
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
