// deno-lint-ignore-file no-explicit-any
//
// Cron worker: claims due scheduled campaigns and hands them to the
// send-comms-campaign dispatcher. Claiming flips the status first so a
// campaign can never be dispatched twice by overlapping runs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const nowIso = new Date().toISOString();
  const { data: due } = await admin
    .from("comms_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(10);

  const results: any[] = [];
  for (const c of due ?? []) {
    // Claim: only proceed if this run flipped it out of `scheduled`.
    const { data: claimed } = await admin
      .from("comms_campaigns")
      .update({ status: "sending", started_at: nowIso })
      .eq("id", c.id)
      .eq("status", "scheduled")
      .select("id");
    if (!claimed?.length) continue;

    // The dispatcher refuses `sending`, so hand it back as draft first.
    await admin.from("comms_campaigns").update({ status: "draft" }).eq("id", c.id);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-comms-campaign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ campaign_id: c.id }),
    });
    const out = await res.json().catch(() => ({}));
    results.push({ campaign_id: c.id, ok: res.ok, ...out });
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
