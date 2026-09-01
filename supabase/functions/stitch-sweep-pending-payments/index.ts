// Safety net for once-off Stitch payments where the payer never returns to the
// browser — e.g. Capitec Pay, which is approved inside the banking app.
//
// Re-checks every once-off session that is still unverified 15+ minutes after
// it was created (up to 3 days old) and settles it exactly like the return-page
// verification does. Recurring mandate collections are NOT touched.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  finalisePayment,
  isCompletedState,
  isFailedState,
  lookupStitchStatus,
} from "../_shared/stitch-settlement.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_AGE_MS = 15 * 60 * 1000;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const BATCH = 40;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();

    const { data: sessions, error } = await admin.from("stitch_payment_sessions")
      .select("*")
      .in("status", ["created", "processing"])
      .not("stitch_request_id", "is", null)
      .lte("created_at", new Date(now - MIN_AGE_MS).toISOString())
      .gte("created_at", new Date(now - MAX_AGE_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (error) return json({ error: error.message }, 500);

    const credsCache = new Map<string, { clientId: string; clientSecret: string } | null>();
    let settled = 0, failed = 0, pending = 0, skipped = 0;

    for (const session of sessions || []) {
      let creds = credsCache.get(session.club_id);
      if (creds === undefined) {
        const { data: secretRow } = await admin.from("club_secrets")
          .select("payment_gateway_credentials").eq("club_id", session.club_id).maybeSingle();
        const c = (secretRow?.payment_gateway_credentials || {}) as Record<string, string>;
        const clientId = (c.client_id || "").trim();
        const clientSecret = (c.client_secret || "").trim();
        creds = clientId && clientSecret ? { clientId, clientSecret } : null;
        credsCache.set(session.club_id, creds);
      }
      if (!creds) { skipped++; continue; }

      let status = "PENDING";
      let detectedMethod: "card" | "paybybank" | null = null;
      try {
        const res = await lookupStitchStatus(creds.clientId, creds.clientSecret, session.stitch_request_id, session.stitch_redirect_url);
        status = res.status;
        detectedMethod = res.detectedMethod;
      } catch (e) {
        console.error("sweep lookup failed", session.id, (e as Error).message);
        skipped++;
        continue;
      }

      if (!isCompletedState(status)) {
        if (isFailedState(status)) {
          await admin.from("stitch_payment_sessions").update({ status: "failed" }).eq("id", session.id);
          failed++;
        } else {
          await admin.from("stitch_payment_sessions").update({ status: "processing" }).eq("id", session.id);
          pending++;
        }
        continue;
      }

      if (detectedMethod && detectedMethod !== session.method) {
        await admin.from("stitch_payment_sessions").update({ method: detectedMethod }).eq("id", session.id);
        session.method = detectedMethod;
      }

      // Atomic claim so a concurrent return-page verification can never double-post.
      const { data: claimed } = await admin.from("stitch_payment_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session.id).neq("status", "completed").select("id");
      if (!claimed || claimed.length === 0) { skipped++; continue; }

      await finalisePayment(admin, session);
      settled++;
      console.log("sweep settled stitch session", session.id, session.stitch_request_id, session.amount);
    }

    return json({ ok: true, checked: (sessions || []).length, settled, failed, pending, skipped });
  } catch (e) {
    console.error("stitch-sweep-pending-payments fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
