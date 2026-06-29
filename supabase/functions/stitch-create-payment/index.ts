// Creates a Stitch LinkPay request for a member: PayByBank or card.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_GRAPHQL = "https://api.stitch.money/graphql";
const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 200);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      club_id, club_member_id, amount, purpose,
      method = "paybybank",
      fee_ids = [], champ_registration_id = null,
      description, return_url,
    } = body || {};

    if (!club_id || !club_member_id || !amount || !purpose || !return_url) {
      return json({ error: "Missing required fields" }, 200);
    }
    if (!["fee", "topup", "tournament"].includes(purpose)) return json({ error: "Invalid purpose" }, 200);
    if (!["paybybank", "card"].includes(method)) return json({ error: "Invalid method" }, 200);
    const amt = Number(amount);
    if (!(amt > 0)) return json({ error: "Invalid amount" }, 200);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id, full_name, club_member_number")
      .eq("id", club_member_id).maybeSingle();
    if (!member || member.club_id !== club_id || member.user_id !== userId) {
      return json({ error: "Member not found or not yours" }, 200);
    }

    const { data: club } = await admin
      .from("clubs").select("id, name, payment_gateway")
      .eq("id", club_id).maybeSingle();
    if (!club || club.payment_gateway !== "stitch") {
      return json({ error: "Stitch is not configured for this club" }, 200);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = creds.client_id;
    const clientSecret = creds.client_secret;
    const merchantRef = (creds.merchant_payer_reference || (club.name || "Club")).slice(0, 12).replace(/[^A-Za-z0-9 ]/g, "");
    if (!clientId || !clientSecret) {
      return json({ error: "Stitch client_id / client_secret not configured for this club." }, 200);
    }

    // OAuth token (client_credentials)
    const tokenResp = await fetch(STITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "client_paymentrequest",
        audience: "https://secure.stitch.money",
      }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenJson.access_token) {
      console.error("Stitch token error", tokenResp.status, JSON.stringify(tokenJson));
      return json({ error: `Stitch auth failed [${tokenResp.status}]: ${tokenJson?.error_description || tokenJson?.error || "check client_id / client_secret"}` }, 200);
    }
    const accessToken: string = tokenJson.access_token;

    // Insert session
    const defaultDesc =
      purpose === "topup" ? "Wallet top-up" :
      purpose === "tournament" ? "Tournament entry fee" : "Fee payment";
    const payerRef = `${merchantRef}${member.club_member_number ? "-" + member.club_member_number : ""}`.slice(0, 18);

    const { data: session, error: sessErr } = await admin
      .from("stitch_payment_sessions").insert({
        club_id, club_member_id, user_id: userId,
        amount: amt, purpose, method,
        fee_ids, champ_registration_id,
        description: description || defaultDesc,
        payer_reference: payerRef,
        status: "created",
      }).select("id").single();
    if (sessErr || !session) return json({ error: sessErr?.message || "Could not create session" }, 200);

    const safeReturnUrl = sanitizeReturnUrl(return_url);
    const successUrl = appendParam(appendParam(safeReturnUrl, "stitch_session", session.id), "stitch_status", "success");

    // Stitch LinkPay (clientPaymentInitiationRequestCreate) presents the user
    // with a hosted checkout that supports PayByBank and Card. We use the same
    // mutation for both methods — Stitch shows the appropriate payment options
    // on the hosted page based on the merchant's enabled methods.
    const mutation = `
      mutation CreatePaymentRequest($input: ClientPaymentInitiationRequestInput!) {
        clientPaymentInitiationRequestCreate(input: $input) {
          paymentInitiationRequest { id url }
        }
      }`;
    const variables: Record<string, unknown> = {
      input: {
        amount: { quantity: amt.toFixed(2), currency: "ZAR" },
        payerReference: payerRef,
        beneficiaryReference: payerRef,
        externalReference: session.id,
        beneficiary: { bankAccount: { name: club.name, bankId: "fnb", accountNumber: creds.beneficiary_account_number || "" } },
      },
    };

    const gqlResp = await fetch(STITCH_GRAPHQL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: mutation, variables }),
    });
    const gqlData = await gqlResp.json().catch(() => ({}));
    if (!gqlResp.ok || gqlData.errors) {
      console.error("Stitch GraphQL error", gqlResp.status, JSON.stringify(gqlData));
      await admin.from("stitch_payment_sessions").update({ status: "failed" }).eq("id", session.id);
      const msg = gqlData?.errors?.[0]?.message || gqlData?.error_description || `HTTP ${gqlResp.status}`;
      return json({ error: `Stitch API error: ${msg}` }, 200);
    }

    const node = gqlData.data?.clientPaymentInitiationRequestCreate?.paymentInitiationRequest;
    if (!node?.id || !node?.url) {
      await admin.from("stitch_payment_sessions").update({ status: "failed" }).eq("id", session.id);
      return json({ error: "Stitch did not return a redirect URL." }, 200);
    }

    await admin.from("stitch_payment_sessions").update({
      stitch_request_id: node.id, stitch_redirect_url: node.url,
    }).eq("id", session.id);

    return json({ session_id: session.id, redirect_url: node.url, request_id: node.id });
  } catch (e: any) {
    console.error("stitch-create-payment error:", e);
    return json({ error: e?.message || "Unexpected error" }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function appendParam(url: string, key: string, value: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}
function sanitizeReturnUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "gbsquash:") return raw;
    if (parsed.hostname.endsWith(".supabase.co")) {
      return `${PUBLIC_APP_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    const path = String(raw || "/my-account").startsWith("/") ? String(raw) : `/${String(raw || "my-account")}`;
    return `${PUBLIC_APP_ORIGIN}${path}`;
  }
}
