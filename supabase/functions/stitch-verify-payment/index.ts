// Verifies a Stitch Express payment by session and finalises it in our DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STITCH_BASE = "https://express.stitch.money/api/v1";
const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_BASE = "https://api.stitch.money/v2";

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

    const status = await lookupStitchStatus(clientId, clientSecret, session.stitch_request_id, session.stitch_redirect_url);
    const completed = status === "PAID" || status === "COMPLETED" || status === "COMPLETE" || status === "PAYMENTINITIATIONREQUESTCOMPLETED";
    const failed = status === "EXPIRED" || status === "CANCELLED" || status === "CANCELED" || status === "FAILED" || status === "PAYMENTINITIATIONREQUESTCANCELLED" || status === "PAYMENTINITIATIONREQUESTEXPIRED";

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

async function lookupStitchStatus(clientId: string, clientSecret: string, requestId: string, redirectUrl?: string | null) {
  if (String(redirectUrl || "").includes("secure.stitch.money/connect/payment-request")) {
    try {
      const accessToken = await getPaymentRequestToken(clientId, clientSecret);
      const resp = await fetch(`${STITCH_API_BASE}/payment-requests/${encodeURIComponent(requestId)}`, {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) return String(data?.status || "pending").toUpperCase();
      console.error("Stitch payment-request status error", resp.status, data);
      return "PENDING";
    } catch (err) {
      console.error("Stitch payment-request lookup failed", (err as Error)?.message || err);
      return "PENDING";
    }
  }

  const tokenResp = await fetch(`${STITCH_BASE}/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, scope: "client_paymentrequest" }),
  });
  const tokenJson = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || !tokenJson?.data?.accessToken) {
    console.error("Stitch Express token error", tokenResp.status, tokenJson);
    return "PENDING";
  }
  const accessToken: string = tokenJson.data.accessToken;

  const plResp = await fetch(`${STITCH_BASE}/payments/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const plJson = await plResp.json().catch(() => ({}));
  if (!plResp.ok) {
    console.error("Stitch Express status error", plResp.status, plJson);
    return "PENDING";
  }
  const payment = plJson?.data?.payment || plJson?.data || {};
  return String(payment.status || "PENDING").toUpperCase();
}

async function getPaymentRequestToken(clientId: string, clientSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("audience", STITCH_TOKEN_URL);
  body.set("scope", "client_paymentrequest");
  body.set("client_secret", clientSecret);
  const resp = await fetch(STITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  const token = data?.access_token || data?.accessToken || data?.token;
  if (!resp.ok || !token) throw new Error(data?.detail || data?.message || data?.error || `HTTP ${resp.status}`);
  return String(token);
}
