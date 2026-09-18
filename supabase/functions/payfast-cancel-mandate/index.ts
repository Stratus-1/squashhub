// Cancels a member's monthly PayFast card arrangement. Members may cancel
// their own; club admins may cancel one for their club.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveGatewayCreds } from "../_shared/gateway-creds.ts";
import { isSandboxCreds } from "../_shared/payfast.ts";
import { pfCancelToken } from "../_shared/payfast-recurring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { mandate_id } = (await req.json().catch(() => ({}))) || {};
    if (!mandate_id) return json({ error: "mandate_id is required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id, club_id, user_id, gateway, payfast_token, status")
      .eq("id", mandate_id)
      .maybeSingle();
    if (!mandate) return json({ error: "Arrangement not found" }, 404);

    let allowed = mandate.user_id === userId;
    if (!allowed) {
      const { data: adminRow } = await admin
        .from("club_members")
        .select("id")
        .eq("club_id", mandate.club_id)
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      allowed = !!adminRow;
    }
    if (!allowed) return json({ error: "Not allowed" }, 403);

    if (mandate.payfast_token) {
      const { data: secrets } = await admin
        .from("club_secrets")
        .select("payment_gateway_credentials")
        .eq("club_id", mandate.club_id)
        .maybeSingle();
      const creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "payfast");
      if (creds.merchant_id) {
        await pfCancelToken({
          token: mandate.payfast_token,
          merchantId: creds.merchant_id.trim(),
          passphrase: creds.passphrase,
          sandbox: isSandboxCreds(creds),
        });
      }
    }

    await admin
      .from("stitch_mandates")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        next_charge_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mandate_id);

    // Drop anything still waiting to be collected.
    await admin
      .from("stitch_collections")
      .update({ status: "skipped" })
      .eq("mandate_id", mandate_id)
      .in("status", ["queued", "approved"]);

    return json({ ok: true });
  } catch (e: any) {
    console.error("payfast-cancel-mandate error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
