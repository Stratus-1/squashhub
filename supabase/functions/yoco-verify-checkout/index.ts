// Verifies a Yoco checkout by ID and finalizes the payment in our DB.
// Called from the frontend success-return page.
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

    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id) return json({ error: "Missing session_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: session } = await admin
      .from("yoco_payment_sessions")
      .select("*")
      .eq("id", session_id)
      .maybeSingle();
    if (!session) return json({ error: "Session not found" }, 404);
    if (session.user_id !== userId) return json({ error: "Forbidden" }, 403);

    if (session.status === "completed") {
      return json({ status: "completed", already: true });
    }

    // Fetch Yoco checkout status
    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", session.club_id)
      .maybeSingle();
    const secretKey = (secrets?.payment_gateway_credentials as any)?.secret_key;
    if (!secretKey) return json({ error: "Yoco key not configured" }, 400);

    const resp = await fetch(
      `https://payments.yoco.com/api/checkouts/${session.yoco_checkout_id}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ error: `Yoco verify failed [${resp.status}]: ${JSON.stringify(data)}` }, 502);
    }

    const yocoStatus: string = data?.status || "";
    // Yoco statuses: created, processing, completed, cancelled, failed, expired
    if (yocoStatus !== "completed") {
      await admin
        .from("yoco_payment_sessions")
        .update({ status: yocoStatus === "completed" ? "completed" : (["cancelled","failed","expired"].includes(yocoStatus) ? yocoStatus : "created") })
        .eq("id", session.id);
      return json({ status: yocoStatus });
    }

    // Mark session completed
    await admin
      .from("yoco_payment_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", session.id);

    const amount = Number(session.amount);
    const description =
      session.description ||
      (session.purpose === "topup"
        ? "Wallet top-up (Yoco)"
        : session.purpose === "tournament"
        ? "Tournament entry fee (Yoco)"
        : "Fee payment (Yoco)");

    // Record member_credit_transactions (skip for tournament — entry fees are not member-credit ledger items)
    if (session.purpose !== "tournament") {
      await admin.from("member_credit_transactions").insert({
        club_id: session.club_id,
        club_member_id: session.club_member_id,
        amount,
        type: "debit",
        method: "card",
        description: `${description} [Yoco]`,
        reference: session.yoco_checkout_id,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });
    }

    // For fee purpose, mark linked fees paid
    if (session.purpose === "fee" && Array.isArray(session.fee_ids) && session.fee_ids.length) {
      const { data: fees } = await admin
        .from("club_member_fee_payments")
        .select("id, amount")
        .in("id", session.fee_ids);

      const total = (fees || []).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const isPartial = amount < total - 0.001;

      if (!isPartial) {
        for (const f of fees || []) {
          await admin
            .from("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("id", f.id);
        }
      } else {
        let remaining = amount;
        for (const f of fees || []) {
          const feeAmt = Number(f.amount);
          const deduction = Math.min(remaining, feeAmt);
          remaining -= deduction;
          const newAmount = feeAmt - deduction;
          if (newAmount <= 0) {
            await admin
              .from("club_member_fee_payments")
              .update({ paid: true, paid_at: new Date().toISOString(), amount: 0 })
              .eq("id", f.id);
          } else {
            await admin
              .from("club_member_fee_payments")
              .update({ amount: newAmount })
              .eq("id", f.id);
          }
          if (remaining <= 0) break;
        }
      }
    }

    // For tournament purpose, mark the registration as paid
    if (session.purpose === "tournament" && session.champ_registration_id) {
      await admin
        .from("club_champs_registrations")
        .update({
          status: "paid",
          fee_paid_cents: Math.round(amount * 100),
          payment_ref: session.yoco_checkout_id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", session.champ_registration_id);
    }


    return json({ status: "completed", amount });
  } catch (e: any) {
    console.error("yoco-verify-checkout error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
