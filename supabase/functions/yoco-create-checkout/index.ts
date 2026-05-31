// Creates a Yoco checkout for a member: fee payment or wallet top-up.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const YOCO_API = "https://payments.yoco.com/api/checkouts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    // Auth check
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json();
    const {
      club_id,
      club_member_id,
      amount,
      purpose,        // 'fee' | 'topup' | 'tournament'
      fee_ids = [],
      champ_registration_id = null,
      description,
      return_url,
    } = body || {};

    if (!club_id || !club_member_id || !amount || !purpose || !return_url) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!["fee", "topup", "tournament"].includes(purpose)) {
      return json({ error: "Invalid purpose" }, 400);
    }
    if (purpose === "tournament" && !champ_registration_id) {
      return json({ error: "champ_registration_id is required for tournament purpose" }, 400);
    }
    const amt = Number(amount);
    if (!(amt > 0)) return json({ error: "Invalid amount" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member, error: memberErr } = await admin
      .from("club_members")
      .select("id, club_id, user_id")
      .eq("id", club_member_id)
      .maybeSingle();
    if (memberErr || !member || member.club_id !== club_id || member.user_id !== userId) {
      return json({ error: "Member not found or not yours" }, 403);
    }

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, payment_gateway")
      .eq("id", club_id)
      .maybeSingle();
    if (!club || club.payment_gateway !== "yoco") {
      return json({ error: "Yoco is not configured for this club" }, 400);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id)
      .maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const secretKey = creds.secret_key;
    if (!secretKey) {
      return json({ error: "Yoco secret key not configured" }, 400);
    }
    if (!secretKey.startsWith("sk_live_")) {
      console.error("Yoco secret key mode mismatch", {
        club_id,
        expected: "sk_live_",
        actual_prefix: secretKey.slice(0, 8),
      });
      return json({ error: "Yoco live secret key required. Please save the sk_live_ key for this club." }, 400);
    }

    const defaultDesc =
      purpose === "topup" ? "Wallet top-up" :
      purpose === "tournament" ? "Tournament entry fee" :
      "Fee payment";

    const { data: session, error: sessErr } = await admin
      .from("yoco_payment_sessions")
      .insert({
        club_id,
        club_member_id,
        user_id: userId,
        amount: amt,
        purpose,
        fee_ids,
        champ_registration_id,
        description: description || defaultDesc,
        status: "created",
      })
      .select("id")
      .single();
    if (sessErr || !session) {
      return json({ error: sessErr?.message || "Could not create session" }, 500);
    }

    const paymentReturnUrl = `${SUPABASE_URL}/functions/v1/yoco-payment-return?target=${encodeURIComponent(return_url)}&yoco_session=${encodeURIComponent(session.id)}`;
    const successUrl = paymentReturnUrl;
    const cancelUrl = paymentReturnUrl;
    const failureUrl = paymentReturnUrl;

    // Call Yoco
    const yocoResp = await fetch(YOCO_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amt * 100), // ZAR cents
        currency: "ZAR",
        successUrl,
        cancelUrl,
        failureUrl,
        metadata: {
          session_id: session.id,
          club_id,
          club_member_id,
          purpose,
        },
      }),
    });
    const yocoData = await yocoResp.json().catch(() => ({}));
    if (!yocoResp.ok) {
      await admin
        .from("yoco_payment_sessions")
        .update({ status: "failed" })
        .eq("id", session.id);
      return json(
        { error: `Yoco error [${yocoResp.status}]: ${yocoData?.errorMessage || yocoData?.description || JSON.stringify(yocoData)}` },
        502,
      );
    }

    await admin
      .from("yoco_payment_sessions")
      .update({
        yoco_checkout_id: yocoData.id,
        yoco_redirect_url: yocoData.redirectUrl,
      })
      .eq("id", session.id);

    return json({
      session_id: session.id,
      redirect_url: yocoData.redirectUrl,
      checkout_id: yocoData.id,
    });
  } catch (e: any) {
    console.error("yoco-create-checkout error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function appendParam(url: string, key: string, value: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
