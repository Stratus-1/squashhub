// Called by the app when the payer returns from PayFast. PayFast confirms
// payments through the ITN callback, so this endpoint only reports the
// current state of the member's session (and reconciles recent ones).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { session_id = null } = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let session: any | null = null;
    if (session_id) {
      const { data } = await admin
        .from("payfast_payment_sessions")
        .select("*")
        .eq("id", session_id)
        .maybeSingle();
      session = data;
    } else {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await admin
        .from("payfast_payment_sessions")
        .select("*")
        .eq("user_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      session = data;
    }
    if (!session) return json({ error: "Session not found" }, 404);
    if (session.user_id !== userId) return json({ error: "Forbidden" }, 403);

    if (session.status === "completed") {
      return json({ status: "completed", amount: Number(session.amount) });
    }

    // PayFast's ITN can land a moment after the payer is redirected back, so a
    // recent completed session for the same member counts as success.
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentDone } = await admin
      .from("payfast_payment_sessions")
      .select("id, amount")
      .eq("user_id", userId)
      .eq("club_id", session.club_id)
      .eq("club_member_id", session.club_member_id)
      .eq("status", "completed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentDone) return json({ status: "completed", amount: Number(recentDone.amount), already: true });

    return json({ status: session.status });
  } catch (e: any) {
    console.error("payfast-verify-checkout error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
