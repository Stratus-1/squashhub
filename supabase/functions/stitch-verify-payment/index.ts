// Verifies a Stitch Express payment by session and finalises it in our DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveGatewayCreds } from "../_shared/gateway-creds.ts";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { session_id = null } = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let session: any | null = null;
    if (session_id) {
      const { data } = await admin.from("stitch_payment_sessions").select("*").eq("id", session_id).maybeSingle();
      session = data;
    } else {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await admin.from("stitch_payment_sessions").select("*")
        .eq("user_id", userId).in("status", ["created", "processing"]).gte("created_at", since)
        .not("stitch_request_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      session = data;
    }
    if (!session) return json({ error: "Session not found" }, 404);
    if (session.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (session.status === "completed") return json({ status: "completed", already: true });
    if (!session.stitch_request_id) return json({ error: "Session not initiated with Stitch" }, 400);

    const { data: secrets } = await admin.from("club_secrets")
      .select("payment_gateway_credentials").eq("club_id", session.club_id).maybeSingle();
    const creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "stitch");
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    if (!clientId || !clientSecret) return json({ error: "Stitch Express keys missing" }, 400);

    const { status, detectedMethod } = await lookupStitchStatus(clientId, clientSecret, session.stitch_request_id, session.stitch_redirect_url);
    const completed = isCompletedState(status);
    const failed = isFailedState(status);

    if (!completed) {
      const next = failed ? "failed" : "processing";
      await admin.from("stitch_payment_sessions").update({ status: next }).eq("id", session.id);
      return json({ status: next, stitch_state: status });
    }

    // Persist the actual method Stitch reported (card vs eft/paybybank).
    // The session.method reflects the requested method — payers can switch to
    // card on Stitch's hosted page, so we must trust Stitch's response.
    if (detectedMethod && detectedMethod !== session.method) {
      await admin.from("stitch_payment_sessions").update({ method: detectedMethod }).eq("id", session.id);
      session.method = detectedMethod;
    }

    // Atomic claim
    const { data: claimed } = await admin.from("stitch_payment_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", session.id).neq("status", "completed").select("id");
    if (!claimed || claimed.length === 0) return json({ status: "completed", already: true });

    await finalisePayment(admin, session);
    return json({ status: "completed", amount: Number(session.amount), method: session.method });
  } catch (e: any) {
    console.error("stitch-verify-payment error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
