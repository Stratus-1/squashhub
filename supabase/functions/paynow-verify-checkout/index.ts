// Verifies a Paynow transaction by polling its pollurl and finalizes the
// payment in our DB. Called from the frontend success-return page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isPaynowPaid } from "../_shared/paynow.ts";
import { pollPaynow, mapStatus, settlePaynowSession } from "../_shared/paynow-settlement.ts";
import { resolveGatewayCreds } from "../_shared/gateway-creds.ts";

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
        .from("paynow_payment_sessions")
        .select("*")
        .eq("id", session_id)
        .maybeSingle();
      session = data;
    } else {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await admin
        .from("paynow_payment_sessions")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["created", "processing", "sent"])
        .gte("created_at", since)
        .not("paynow_poll_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      session = data;
    }
    if (!session) return json({ error: "Session not found" }, 404);
    if (session.user_id !== userId) return json({ error: "Forbidden" }, 403);
    if (!session.paynow_poll_url) {
      return json({ error: "Missing Paynow poll URL for this session. Please start a new payment." }, 400);
    }
    if (session.status === "completed") return json({ status: "completed", already: true });

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", session.club_id)
      .maybeSingle();
    const integrationKey = (resolveGatewayCreds(secrets?.payment_gateway_credentials, "paynow").integration_key || "").trim();
    if (!integrationKey) return json({ error: "Paynow key not configured" }, 400);

    // Reconcile recent pending sessions, same as Yoco verify does.
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentSessions } = await admin
      .from("paynow_payment_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("club_id", session.club_id)
      .eq("club_member_id", session.club_member_id)
      .in("status", ["created", "processing", "sent", "cancelled", "failed"])
      .gte("created_at", since)
      .not("paynow_poll_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);

    const sessionsToCheck = [session, ...(recentSessions || []).filter((s: any) => s.id !== session.id)];
    let requestedStatus = session.status;
    let completedSession: any | null = null;

    for (const candidate of sessionsToCheck) {
      const paynowStatus = await pollPaynow(candidate.paynow_poll_url, integrationKey);
      if (paynowStatus == null) {
        if (candidate.id === session.id) {
          return json({ error: "Paynow status check failed. Please try again." }, 502);
        }
        continue;
      }
      console.log("Paynow poll status", { session_id: candidate.id, status: paynowStatus });

      if (candidate.id === session.id) requestedStatus = mapStatus(paynowStatus);
      if (isPaynowPaid(paynowStatus)) {
        completedSession = candidate;
        break;
      }

      await admin
        .from("paynow_payment_sessions")
        .update({ status: mapStatus(paynowStatus), updated_at: new Date().toISOString() })
        .eq("id", candidate.id);
    }

    if (!completedSession) return json({ status: requestedStatus });
    session = completedSession;

    // Atomically claim — only one caller writes the credit.
    const { data: claimed, error: claimErr } = await admin
      .from("paynow_payment_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", session.id)
      .neq("status", "completed")
      .select("id");
    if (claimErr) return json({ error: `Failed to claim session: ${claimErr.message}` }, 500);
    if (!claimed || claimed.length === 0) {
      return json({ status: "completed", already: true });
    }

    await settlePaynowSession(admin, session);
    return json({ status: "completed", amount: Number(session.amount) });
  } catch (e: any) {
    console.error("paynow-verify-checkout error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
