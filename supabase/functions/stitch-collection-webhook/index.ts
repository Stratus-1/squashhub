// Handles Stitch webhook events for in-flight collections.
// Settles the collection, marks the linked fee paid, manages the failure
// counter on the mandate, and suspends member access after 3 consecutive
// failures.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const payload = await req.json().catch(() => ({}));
    // Stitch wraps events under "data": { paymentEvent: { ... } } shapes vary.
    const ev = payload?.data || payload;
    const stitchId =
      ev?.paymentInitiationRequest?.id ||
      ev?.id ||
      ev?.externalReference ||
      null;
    const eventType: string =
      ev?.eventType || ev?.status || ev?.paymentInitiationRequest?.status || "";

    if (!stitchId) return json({ ok: true, ignored: true });

    // Look up the collection by stitch_collection_id OR by id (we used the
    // collection's own UUID as externalReference).
    let { data: col } = await admin
      .from("stitch_collections")
      .select("*")
      .eq("stitch_collection_id", stitchId)
      .maybeSingle();
    if (!col) {
      const { data: byExt } = await admin
        .from("stitch_collections").select("*").eq("id", stitchId).maybeSingle();
      col = byExt as any;
    }
    if (!col) return json({ ok: true, unknown: true });

    const isPaid = /complete|paid|settled|success/i.test(eventType);
    const isFailed = /fail|reject|expir|cancel/i.test(eventType);

    if (isPaid) {
      await admin.from("stitch_collections").update({
        status: "paid", settled_at: new Date().toISOString(),
      }).eq("id", col.id);

      if (col.fee_payable_id) {
        await admin.from("club_member_fee_payments").update({
          paid: true, paid_at: new Date().toISOString(),
        }).eq("id", col.fee_payable_id);
      }
      // Reset failure counter, refresh last_collection_at, clear suspension.
      await admin.from("stitch_mandates").update({
        consecutive_failures: 0,
        last_collection_at: new Date().toISOString(),
        suspended_at: null,
      }).eq("id", col.mandate_id);
      await admin.from("club_members").update({
        access_suspended_at: null,
      }).eq("id", col.club_member_id);
    } else if (isFailed) {
      await admin.from("stitch_collections").update({
        status: "failed", failed_reason: eventType.slice(0, 500),
      }).eq("id", col.id);

      const { data: mandate } = await admin
        .from("stitch_mandates")
        .select("id, consecutive_failures").eq("id", col.mandate_id).maybeSingle();
      const fails = (mandate?.consecutive_failures || 0) + 1;
      const suspend = fails >= 3;
      await admin.from("stitch_mandates").update({
        consecutive_failures: fails,
        suspended_at: suspend ? new Date().toISOString() : null,
        status: suspend ? "failed" : "active",
      }).eq("id", col.mandate_id);
      if (suspend) {
        await admin.from("club_members").update({
          access_suspended_at: new Date().toISOString(),
        }).eq("id", col.club_member_id);
      }

      // Schedule retries at +2 and +5 days (only on attempts 1 & 2).
      if (col.attempt_number < 3 && !suspend) {
        const offsetDays = col.attempt_number === 1 ? 2 : 5;
        const nextDue = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        await admin.from("stitch_collections").insert({
          club_id: col.club_id,
          mandate_id: col.mandate_id,
          club_member_id: col.club_member_id,
          fee_payable_id: col.fee_payable_id,
          amount_cents: col.amount_cents,
          due_date: nextDue,
          status: "approved",
          approval_required: false,
          attempt_number: col.attempt_number + 1,
          retry_of: col.id,
        });
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error("stitch-collection-webhook fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
