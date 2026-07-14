// Creates a Stitch EXPRESS payment link for a member.
// Stitch Express REST API: https://express.stitch.money/api/v1/
// This is a separate product from Stitch Enterprise (GraphQL). Most accounts
// are provisioned as Express — Enterprise requires a separate contract.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_BASE = "https://express.stitch.money/api/v1";
const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_BASE = "https://api.stitch.money/v2";
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
      .from("clubs").select("id, name, subdomain, payment_gateway")
      .eq("id", club_id).maybeSingle();
    if (!club || club.payment_gateway !== "stitch") {
      return json({ error: "Stitch is not configured for this club" }, 200);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
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

    const safeReturnUrl = sanitizeReturnUrl(return_url, String((club as any).subdomain || "").trim());

    // 2. Prefer Stitch's documented Payment Request flow. Unlike Express
    // payment-links, this hosted URL honours `redirect_uri` after success.
    const payerName = (member.name || "Member").slice(0, 40).padEnd(3, " ");
    const safeReturnWithSession = appendSessionParams(safeReturnUrl, session.id, String((club as any).subdomain || "").trim());
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

    // 3. Fallback for older Stitch Express tenants. This may still land on
    // /pay/complete, so the frontend wraps it in a SquashHub bridge page.
    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, scope: "client_paymentrequest" }),
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
      merchantReference,
      merchantRedirectUrl: safeReturnWithSession,
      redirectUrl: safeReturnWithSession,
    };

    const plResp = await fetch(`${STITCH_BASE}/payment-links`, {
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
    const redirectUrl = payment.link as string;


    await admin.from("stitch_payment_sessions").update({
      stitch_request_id: payment.id, stitch_redirect_url: redirectUrl,
    }).eq("id", session.id);

    return json({ session_id: session.id, redirect_url: redirectUrl, request_id: payment.id });
  } catch (e: any) {
    console.error("stitch-create-payment error:", e);
    return json({ error: e?.message || "Unexpected error" }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function sanitizeReturnUrl(raw: string, clubSubdomain = "") {
  const canonicalReturnUrl = `${PUBLIC_APP_ORIGIN}/pay/return`;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "gbsquash:") return raw;
    if (parsed.hostname.endsWith(".supabase.co")) {
      return canonicalReturnUrl;
    }
    const host = parsed.hostname.toLowerCase();
    const allowed =
      host === "squashhub.co.za" ||
      host.endsWith(".squashhub.co.za") ||
      host === "squashhub.lovable.app" ||
      host.endsWith(".lovable.app") ||
      host === "localhost";
    if (!allowed) return canonicalReturnUrl;
    parsed.search = "";
    parsed.hash = "";
    if (host === "squashhub.co.za" || host.endsWith(".squashhub.co.za")) {
      return canonicalReturnUrl;
    }
    if (parsed.pathname === "/" || parsed.pathname === "") {
      parsed.pathname = "/pay/return";
    }
    return parsed.toString();
  } catch {
    return canonicalReturnUrl;
  }
}

function appendRedirectUri(link: string, returnUrl: string) {
  try {
    const url = new URL(link);
    url.searchParams.set("redirect_uri", returnUrl);
    return url.toString();
  } catch {
    const sep = link.includes("?") ? "&" : "?";
    return `${link}${sep}redirect_uri=${encodeURIComponent(returnUrl)}`;
  }
}

function appendSessionParams(returnUrl: string, _sessionId: string, _clubSubdomain = "") {
  // Stitch Express appears to validate the return URL as an exact whitelist
  // match. Any appended query params, even our own stitch_session/status, can
  // make Stitch keep the payer on /pay/complete instead of redirecting. The
  // browser already stores the pending session before checkout, and /pay/return
  // uses the apex cookie to route the payer back to their club subdomain.
  return returnUrl;
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
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
    redirect_url: appendRedirectUri(String(redirectBase), opts.redirectUri),
  };
}