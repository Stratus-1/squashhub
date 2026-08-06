// Cron sweep: polls Stitch Express for every pending mandate and flips the
// local status to active/failed/cancelled. Runs unauthenticated but requires
// x-internal-secret so only cron can trigger it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  stitchExpressToken,
  listStitchSubscriptions,
  getStitchCardConsentStatus,
  mapStitchMandateStatus,
} from "../_shared/stitch-mandate-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // The caller must present the shared cron key. It lives in app_settings so
  // the pg_cron job and this function always read the same value (env secrets
  // and the DB can otherwise drift out of sync).
  const { data: keyRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "stitch_private_internal_secret")
    .maybeSingle();
  const expected = (keyRow?.value as string | undefined)
    || Deno.env.get("STITCH_INTERNAL_SECRET")
    || Deno.env.get("MAINTENANCE_INTERNAL_SECRET")
    || Deno.env.get("PUSH_INTERNAL_SECRET")
    || "";
  const got = req.headers.get("x-internal-secret") || "";
  if (!expected || got !== expected) {
    console.warn(`reconcile auth rejected: haveKey=${!!expected} haveHeader=${!!got}`);
    return json({ error: "Unauthorized" }, 401);
  }


  // Sweep mandates that are still pending, plus recently-activated ones so a
  // row that was marked active by hand gets corrected if Stitch disagrees.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await admin
    .from("stitch_mandates")
    .select("id, club_id, stitch_mandate_id, mandate_type, status, created_at")
    .in("status", ["pending", "active"])
    .gte("created_at", cutoff)
    .not("stitch_mandate_id", "is", null);
  if (error) return json({ error: error.message }, 500);

  const rows = pending || [];
  if (rows.length === 0) return json({ ok: true, scanned: 0 });

  // Per-club token + subscription list cache. Stitch Express has no
  // GET /subscriptions/{id}; the list endpoint is the only read path.
  const tokenCache = new Map<string, string | null>();
  const subsCache = new Map<string, Map<string, string>>();
  let updated = 0, unchanged = 0, failed = 0, notFound = 0;
  const changes: Array<Record<string, unknown>> = [];

  for (const m of rows) {
    try {
      let token = tokenCache.get(m.club_id);
      if (token === undefined) {
        const { data: secrets } = await admin
          .from("club_secrets")
          .select("payment_gateway_credentials")
          .eq("club_id", m.club_id).maybeSingle();
        const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
        const clientId = (creds.client_id || "").trim();
        const clientSecret = (creds.client_secret || "").trim();
        if (!clientId || !clientSecret) {
          tokenCache.set(m.club_id, null);
          continue;
        }
        try {
          token = await stitchExpressToken(clientId, clientSecret);
          tokenCache.set(m.club_id, token);
        } catch (e) {
          console.error("token failed for club", m.club_id, e);
          tokenCache.set(m.club_id, null);
          continue;
        }
      }
      if (!token) continue;

      let raw: string | null = null;
      if (m.mandate_type === "subscription") {
        let subs = subsCache.get(m.club_id);
        if (!subs) {
          subs = await listStitchSubscriptions(token);
          subsCache.set(m.club_id, subs);
        }
        raw = subs.get(String(m.stitch_mandate_id)) ?? null;
      } else {
        raw = await getStitchCardConsentStatus(token, String(m.stitch_mandate_id));
      }

      if (!raw) { notFound++; continue; }
      const newStatus = mapStitchMandateStatus(raw);
      if (!newStatus || newStatus === m.status) { unchanged++; continue; }

      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "active") patch.authorised_at = new Date().toISOString();
      if (newStatus === "cancelled") patch.cancelled_at = new Date().toISOString();
      await admin.from("stitch_mandates").update(patch).eq("id", m.id);
      changes.push({ id: m.id, from: m.status, to: newStatus, raw });
      if (newStatus === "active") {
        // Book the up-front charge as a payment on the member's account,
        // dated from the day the mandate came into effect.
        const { error: recErr } = await admin.rpc("record_mandate_initial_payment", { _mandate_id: m.id });
        if (recErr) console.error("initial payment record failed", m.id, recErr.message);
      }
      updated++;
    } catch (e) {
      console.error("reconcile row failed", m.id, e);
      failed++;
    }
  }

  console.log(`reconcile: scanned=${rows.length} updated=${updated} unchanged=${unchanged} notFound=${notFound} failed=${failed}`, JSON.stringify(changes));
  return json({ ok: true, scanned: rows.length, updated, unchanged, not_found: notFound, failed, changes });
});
