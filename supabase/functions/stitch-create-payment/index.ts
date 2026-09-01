// Creates a Stitch EXPRESS payment link for a member.
// Stitch Express REST API: https://express.stitch.money/api/v1/
// This is a separate product from Stitch Enterprise (GraphQL). Most accounts
// are provisioned as Express — Enterprise requires a separate contract.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gatewayEnabled, resolveGatewayCreds } from "../_shared/gateway-creds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_BASE = "https://express.stitch.money/api/v1";
const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_BASE = "https://api.stitch.money/v2";
const PUBLIC_APP_ORIGIN = "https://www.squashhub.co.za";

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
    const amt = Number(amount);
    if (!(amt > 0)) return json({ error: "Invalid amount" }, 200);
    const amountCents = Math.round(amt * 100);
    if (amountCents < 100) return json({ error: "Minimum payment is R1.00" }, 200);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member, error: memberErr } = await admin
      .from("club_members")
      .select("id, club_id, user_id, name, email, phone, club_member_number")
      .eq("id", club_member_id).maybeSingle();
    if (memberErr) console.error("member lookup error", memberErr);
    if (!member || member.club_id !== club_id || member.user_id !== userId) {
      return json({ error: "Member not found or not yours" }, 200);
    }

    const { data: club } = await admin
      .from("clubs").select("id, name, subdomain, payment_gateway, payment_gateways")
      .eq("id", club_id).maybeSingle();
    if (!club || !gatewayEnabled(club, "stitch")) {
      return json({ error: "Stitch is not configured for this club" }, 200);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id).maybeSingle();
    const creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "stitch");
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    const testMode = String(creds.test_mode || "") === "true";
    const looksLikeTest = /^test[-_]/i.test(clientId);
    if (!clientId || !clientSecret) {
      return json({ error: "Stitch Express credentials incomplete. Required: Client ID and Client Secret." }, 200);
    }
    if (testMode && !looksLikeTest) {
      return json({ error: "Test mode is ON but the Client ID does not look like a Stitch test credential (expected to start with 'test-')." }, 200);
    }
    if (!testMode && looksLikeTest) {
      return json({ error: "Test mode is OFF but the Client ID looks like a Stitch test credential. Enable Test mode or paste live credentials." }, 200);
    }
    console.log(`[stitch-create-payment] mode=${testMode ? "TEST" : "LIVE"} club=${club.id}`);

    // 1. Insert local session
    const defaultDesc =
      purpose === "topup" ? "Wallet top-up" :
      purpose === "tournament" ? "Tournament entry fee" : "Fee payment";
    const refPrefix = (creds.merchant_payer_reference || (club.name || "Club"))
      .slice(0, 12).replace(/[^A-Za-z0-9 ]/g, "");

    const { data: session, error: sessErr } = await admin
      .from("stitch_payment_sessions").insert({
        club_id, club_member_id, user_id: userId,
        amount: amt, purpose, method,
        fee_ids, champ_registration_id,
        description: description || defaultDesc,
        payer_reference: refPrefix,
        status: "created",
      }).select("id").single();
    if (sessErr || !session) return json({ error: sessErr?.message || "Could not create session" }, 200);

    const merchantReference = `${refPrefix}-${String(session.id).slice(0, 8)}`
      .replace(/[^a-zA-Z0-9\s\-)]/g, "").slice(0, 50) || String(session.id).slice(0, 50);

    const safeReturnUrl = sanitizeReturnUrl(return_url);

    // 2. Prefer Stitch's documented Payment Request flow. Unlike Express
    // payment-links, this hosted URL honours `redirect_uri` after success.
    const payerName = (member.name || "Member").slice(0, 40).padEnd(3, " ");
    const safeReturnWithSession = safeReturnUrl;
    try {
      const request = await createPaymentRequestV2({
        clientId,
        clientSecret,
        amount: amt,
        method,
        merchantReference,
        payerName,
        payerEmail: member.email || undefined,
        payerPhone: member.phone || undefined,
        payerId: member.id,
        redirectUri: safeReturnWithSession,
      });
      await admin.from("stitch_payment_sessions").update({
        stitch_request_id: request.id,
        stitch_redirect_url: request.redirect_url,
      }).eq("id", session.id);

      return json({
        session_id: session.id,
        redirect_url: request.redirect_url,
        request_id: request.id,
        redirect_mode: "direct",
      });
    } catch (err) {
      console.warn("Stitch payment-request fallback to Express link:", (err as Error)?.message || err);
    }

    // 3. Fallback for Stitch Express tenants. Express DOES honour a
    // `redirect_url` query param on the hosted /pay link — this is how the flow
    // worked until 09 Aug 2026. Body-level redirect keys (merchantRedirectUrl /
    // redirectUrl) are silently dropped by Express, so they must NOT be relied
    // on. Re-verified 09 Aug 2026: /pay/<id>?redirect_url=... returns 200.

    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenJson?.data?.accessToken) {
      console.error("Stitch Express token error", tokenResp.status, JSON.stringify(tokenJson));
      const msg = tokenJson?.error?.message || tokenJson?.message || tokenJson?.error || "check Client ID / Client Secret";
      return json({ error: `Stitch Express auth failed [${tokenResp.status}]: ${msg}` }, 200);
    }
    const accessToken: string = tokenJson.data.accessToken;

    const plBody: Record<string, unknown> = {
      amount: amountCents,
      currency: "ZAR",
      payerName,
      payerPhoneNumber: member.phone || undefined,
      payerEmailAddress: member.email || undefined,
      merchantReference,
    };

    const plResp = await fetch(`${STITCH_BASE}/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(plBody),
    });
    const plJson = await plResp.json().catch(() => ({}));

    if (!plResp.ok || !plJson?.success || !plJson?.data?.payment?.link) {
      console.error("Stitch Express payment-link error", plResp.status, JSON.stringify(plJson));
      await admin.from("stitch_payment_sessions").update({ status: "failed" }).eq("id", session.id);
      const msg = plJson?.error?.message || plJson?.message || (plJson?.errors && JSON.stringify(plJson.errors)) || `HTTP ${plResp.status}`;
      return json({ error: `Stitch Express API error: ${msg}` }, 200);
    }

    const payment = plJson.data.payment;
    // All clubs share the single whitelisted SquashHub callback. The callback
    // resolves the session and forwards the payer to the correct club page.
    const redirectUrl = await appendRedirectIfReachable(payment.link as string, safeReturnWithSession);

    await admin.from("stitch_payment_sessions").update({
      stitch_request_id: payment.id, stitch_redirect_url: redirectUrl,
    }).eq("id", session.id);

    return json({ session_id: session.id, redirect_url: redirectUrl, request_id: payment.id, redirect_mode: "direct" });



  } catch (e: any) {
    console.error("stitch-create-payment error:", e);
    return json({ error: e?.message || "Unexpected error" }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function sanitizeReturnUrl(_raw: string) {
  const canonicalReturnUrl = `${PUBLIC_APP_ORIGIN}/pay/return`;
  return canonicalReturnUrl;
}

// CANONICAL helper (restored 17 Aug 2026 to the 09 Aug confirmed-working
// shape). Express honours `redirect_url` on a FRESH hosted link provided the
// host is the club's whitelisted tenant subdomain. A 404 here means the host is
// wrong / not whitelisted for that club's credentials — fix the host, never
// strip the parameter.
function appendExpressRedirectUrl(link: string, returnUrl: string) {
  if (!link || !returnUrl) return link;
  try {
    const url = new URL(link);
    url.searchParams.set("redirect_url", returnUrl);
    return url.toString();
  } catch {
    const sep = link.includes("?") ? "&" : "?";
    return `${link}${sep}redirect_url=${encodeURIComponent(returnUrl)}`;
  }
}

async function appendRedirectIfReachable(link: string, returnUrl: string) {
  const candidate = appendExpressRedirectUrl(link, returnUrl);
  try {
    const response = await fetch(candidate, { method: "GET", redirect: "follow" });
    if (response.ok) return candidate;
    console.warn(`[stitch-create-payment] shared callback rejected (${response.status}); using bare hosted link`);
  } catch (error) {
    console.warn("[stitch-create-payment] callback check failed; using bare hosted link", error);
  }
  return link;
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
  if (!resp.ok || !token) {
    const msg = data?.detail || data?.message || data?.error_description || data?.error || `HTTP ${resp.status}`;
    throw new Error(`token failed: ${msg}`);
  }
  return String(token);
}

async function createPaymentRequestV2(opts: {
  clientId: string;
  clientSecret: string;
  amount: number;
  method: string;
  merchantReference: string;
  payerName: string;
  payerEmail?: string;
  payerPhone?: string;
  payerId: string;
  redirectUri: string;
}) {
  const accessToken = await getPaymentRequestToken(opts.clientId, opts.clientSecret);
  // Link validity: 72h (we tell payers 24h in emails, so there is a grace buffer)
  const expires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const isCardOnly = opts.method === "card";
  const body: Record<string, unknown> = {
    amount: { currency: "ZAR", quantity: Number(opts.amount.toFixed(2)) },
    externalReference: opts.merchantReference,
    expireAt: expires,
    payer: {
      identifier: opts.payerId,
      email: opts.payerEmail,
      mobileNumber: opts.payerPhone,
      fullName: opts.payerName.trim(),
    },
    metadata: { squashhubSession: opts.merchantReference },
    // Item 1: the return destination goes in the BODY of the payment request.
    // Query params on the hosted interaction URL are ignored by Stitch.
    redirectUrl: opts.redirectUri,
    paymentMethods: {
      eft: isCardOnly ? { enabled: false } : {
        enabled: true,
        payerReference: opts.merchantReference.slice(0, 20),
        beneficiaryReference: opts.merchantReference.slice(0, 20),
      },
      card: { enabled: isCardOnly },
      crypto: { enabled: false },
    },
  };

  const resp = await fetch(`${STITCH_API_BASE}/payment-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  const redirectBase = data?.interaction?.url;
  if (!resp.ok || !data?.id || !redirectBase) {
    const msg = data?.detail || data?.message || data?.error_description || data?.error || `HTTP ${resp.status}`;
    throw new Error(`payment request failed: ${msg}`);
  }
  return {
    id: String(data.id),
    // Items 3 + 4: hand back the hosted URL exactly as issued — param-free.
    redirect_url: String(redirectBase),
  };
}
