import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

/**
 * Paced club-email sender.
 *
 * Bulk club mail (tournament invitations especially) used to fire one SMTP
 * request per recipient at the same instant, which made Gmail temporarily block
 * the club's mailbox ("421-4.3.0 Temporary System Problem") halfway through a
 * send. Messages are now queued in public.email_outbox with a scheduled_for
 * spacing and drained here a few at a time.
 *
 * Safety rules (background job contract):
 *  - service-role callers only
 *  - single-flight lease held in email_outbox_state
 *  - bounded batch per run
 *  - progress written per message (idempotent: a claimed row is never re-claimed)
 */

const MAX_BATCH = 5;
const GAP_MS = 4000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const p = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(p.padEnd(Math.ceil(p.length / 4) * 4, "="))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Authorise: either the cron internal secret, or a service-role JWT.
  const internalHeader = req.headers.get("x-internal-secret") ?? "";
  let authorised = false;
  if (internalHeader) {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "email_private_internal_secret")
      .maybeSingle();
    authorised = !!data?.value && data.value === internalHeader;
  }
  if (!authorised) {
    const auth = req.headers.get("Authorization") || "";
    const claims = auth.startsWith("Bearer ") ? parseJwtClaims(auth.slice(7).trim()) : null;
    authorised = claims?.role === "service_role";
  }
  if (!authorised) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: batch, error: claimErr } = await supabase.rpc("claim_email_outbox_batch", {
    p_limit: MAX_BATCH,
    p_lease_seconds: 120,
  });
  if (claimErr) {
    console.error("[process-email-outbox] claim failed", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (batch || []) as any[];
  if (rows.length === 0) {
    await supabase.rpc("release_email_outbox_lease");
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: secretRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "email_private_internal_secret")
    .maybeSingle();
  const internalSecret = secretRow?.value as string | undefined;

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    if (!internalSecret) {
      await supabase
        .from("email_outbox")
        .update({ status: "queued", last_error: "Email internal secret is not configured" })
        .eq("id", row.id);
      failed++;
      continue;
    }

    let ok = false;
    let errorText = "";
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/email-notifications?action=send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret },
        body: JSON.stringify({
          targetEmail: row.recipient_email,
          targetName: row.recipient_name || "",
          ccEmails: Array.isArray(row.cc_emails) ? row.cc_emails : [],
          clubId: row.club_id,
          title: row.subject,
          body: row.body,
          message: row.body,
          url: row.url || "/notifications",
          type: row.kind || "admin",
          data: { outbox_id: row.id, suppress_email: "false" },
        }),
      });
      const text = await res.text().catch(() => "");
      ok = res.ok && !text.includes('"ok":false');
      if (!ok) errorText = text || `HTTP ${res.status}`;
    } catch (e) {
      errorText = (e as Error).message || String(e);
    }

    if (ok) {
      await supabase
        .from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      sent++;
    } else {
      const attempts = Number(row.attempts || 1);
      const giveUp = attempts >= MAX_ATTEMPTS;
      await supabase
        .from("email_outbox")
        .update({
          status: giveUp ? "failed" : "queued",
          last_error: errorText.slice(0, 2000),
          scheduled_for: giveUp
            ? row.scheduled_for
            : new Date(Date.now() + RETRY_DELAY_MINUTES * 60_000).toISOString(),
        })
        .eq("id", row.id);
      failed++;
    }

    await sleep(GAP_MS);
  }

  await supabase.rpc("release_email_outbox_lease");

  return new Response(JSON.stringify({ ok: true, processed: rows.length, sent, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
