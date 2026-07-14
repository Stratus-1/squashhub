// Verifies a Stitch Express payment by session and finalises it in our DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STITCH_BASE = "https://express.stitch.money/api/v1";

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
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    if (!clientId || !clientSecret) return json({ error: "Stitch Express keys missing" }, 400);

    // Token
    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, scope: "client_paymentrequest" }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenJson?.data?.accessToken) {
      console.error("Stitch Express token error", tokenResp.status, tokenJson);
      return json({ error: "Stitch Express auth failed" }, 502);
    }
    const accessToken: string = tokenJson.data.accessToken;

    // Stitch Express: poll the payment LINK we created (id returned from POST /payment-links).
    // The bare /payment/{id} route does not exist and returns 404.
    const plResp = await fetch(`${STITCH_BASE}/payment-links/${encodeURIComponent(session.stitch_request_id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const plJson = await plResp.json().catch(() => ({}));
    if (!plResp.ok) {
      console.error("Stitch Express status error", plResp.status, plJson);
      return json({ error: "Stitch verify failed" }, 502);
    }
    const payment = plJson?.data?.payment || plJson?.data || {};
    const status: string = String(payment.status || "PENDING").toUpperCase();
    const completed = status === "PAID";
    const failed = status === "EXPIRED" || status === "CANCELLED" || status === "FAILED";

    if (!completed) {
      const next = failed ? "failed" : "processing";
      await admin.from("stitch_payment_sessions").update({ status: next }).eq("id", session.id);
      return json({ status: next, stitch_state: status });
    }

    // Atomic claim
    const { data: claimed } = await admin.from("stitch_payment_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", session.id).neq("status", "completed").select("id");
    if (!claimed || claimed.length === 0) return json({ status: "completed", already: true });

    await finalisePayment(admin, session);
    return json({ status: "completed", amount: Number(session.amount) });
  } catch (e: any) {
    console.error("stitch-verify-payment error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

async function finalisePayment(admin: any, session: any) {
  const amount = Number(session.amount);
  const description = session.description || `${session.purpose} payment (Stitch)`;
  const methodLabel = session.method === "card" ? "card" : "eft";

  if (session.purpose !== "tournament") {
    const { error } = await admin.from("member_credit_transactions").insert({
      club_id: session.club_id, club_member_id: session.club_member_id,
      amount, type: "debit", method: methodLabel,
      description: `${description} [Stitch]`,
      reference: session.stitch_request_id,
      status: "confirmed", confirmed_at: new Date().toISOString(),
    });
    if (error && (error as any).code !== "23505") console.error("credit_tx insert:", error);
  }

  if (session.purpose === "fee" && Array.isArray(session.fee_ids) && session.fee_ids.length) {
    const { data: fees } = await admin.from("club_member_fee_payments").select("id, amount").in("id", session.fee_ids);
    const total = (fees || []).reduce((s: number, f: any) => s + Number(f.amount), 0);
    const isPartial = amount < total - 0.001;
    if (!isPartial) {
      for (const f of fees || []) {
        await admin.from("club_member_fee_payments")
          .update({ paid: true, paid_at: new Date().toISOString() }).eq("id", f.id);
      }
    } else {
      let remaining = amount;
      for (const f of fees || []) {
        const feeAmt = Number(f.amount);
        const deduction = Math.min(remaining, feeAmt);
        remaining -= deduction;
        const newAmount = feeAmt - deduction;
        if (newAmount <= 0) {
          await admin.from("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString(), amount: 0 }).eq("id", f.id);
        } else {
          await admin.from("club_member_fee_payments").update({ amount: newAmount }).eq("id", f.id);
        }
        if (remaining <= 0) break;
      }
    }
  }

  if (session.purpose === "tournament" && session.champ_registration_id) {
    const { data: regRow } = await admin.from("club_champs_registrations")
      .select("fee_payment_id").eq("id", session.champ_registration_id).maybeSingle();
    await admin.from("club_champs_registrations").update({
      status: "paid", fee_paid_cents: Math.round(amount * 100),
      payment_ref: session.stitch_request_id, paid_at: new Date().toISOString(),
    }).eq("id", session.champ_registration_id);
    if (regRow?.fee_payment_id) {
      await admin.from("club_member_fee_payments")
        .update({ paid: true, paid_at: new Date().toISOString() }).eq("id", regRow.fee_payment_id);
    }
    await admin.from("member_credit_transactions")
      .update({ status: "cancelled" })
      .eq("reference", `TOURN-REG-${session.champ_registration_id}`).eq("status", "pending");
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
