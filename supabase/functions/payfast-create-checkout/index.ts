// Creates a PayFast (South Africa) payment for a member: fee payment, wallet
// top-up or tournament entry. PayFast hosts the checkout and redirects the
// payer back to return_url with our payfast_session param.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gatewayEnabled, resolveGatewayCreds } from "../_shared/gateway-creds.ts";
import {
  PAYFAST_LIVE_PROCESS,
  PAYFAST_SANDBOX_PROCESS,
  isSandboxCreds,
  pfEncode,
  pfSignature,
} from "../_shared/payfast.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";

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

    const body = await req.json();
    const {
      club_id,
      club_member_id,
      amount,
      purpose,
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

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id, name, email")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member || member.club_id !== club_id || member.user_id !== userId) {
      return json({ error: "Member not found or not yours" }, 403);
    }

    const { data: club, error: clubErr } = await admin
      .from("clubs")
      .select("id, name, payment_gateway, payment_gateways, currency_code")
      .eq("id", club_id)
      .maybeSingle();
    if (!club || !gatewayEnabled(club, "payfast")) {
      return json({ error: "PayFast is not configured for this club" }, 400);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id)
      .maybeSingle();
    const creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "payfast");
    const merchantId = (creds.merchant_id || "").trim();
    const merchantKey = (creds.merchant_key || "").trim();
    const passphrase = (creds.passphrase || "").trim();
    if (!merchantId || !merchantKey) {
      return json({
        error:
          "PayFast credentials not configured. Save the club's Merchant ID and Merchant Key in Admin → Banking.",
      }, 400);
    }

    const defaultDesc =
      purpose === "topup" ? "Wallet top-up" :
      purpose === "tournament" ? "Tournament entry fee" :
      "Fee payment";

    const { data: session, error: sessErr } = await admin
      .from("payfast_payment_sessions")
      .insert({
        club_id,
        club_member_id,
        user_id: userId,
        amount: amt,
        currency: (club as any).currency_code || "ZAR",
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

    const safeReturnUrl = sanitizeReturnUrl(return_url);
    const returnUrl = appendParam(safeReturnUrl, "payfast_session", session.id);
    const cancelUrl = appendParam(
      appendParam(safeReturnUrl, "payfast_session", session.id),
      "payfast_cancelled",
      "1",
    );
    const notifyUrl = `${SUPABASE_URL}/functions/v1/payfast-itn`;

    // Field order matters for the PayFast signature.
    const fields: Array<[string, string]> = [
      ["merchant_id", merchantId],
      ["merchant_key", merchantKey],
      ["return_url", returnUrl],
      ["cancel_url", cancelUrl],
      ["notify_url", notifyUrl],
      ["name_first", String(member.name || "").split(" ")[0].slice(0, 100)],
      ["name_last", String(member.name || "").split(" ").slice(1).join(" ").slice(0, 100)],
      ["email_address", (member.email || userData.user.email || "").slice(0, 100)],
      ["m_payment_id", session.id],
      ["amount", amt.toFixed(2)],
      ["item_name", `${club.name || "Club"} — ${(description || defaultDesc)}`.slice(0, 100)],
    ];

    const signature = pfSignature(fields, passphrase);
    const sandbox = isSandboxCreds(creds);
    const base = sandbox ? PAYFAST_SANDBOX_PROCESS : PAYFAST_LIVE_PROCESS;
    const query = fields
      .filter(([, v]) => String(v || "").trim() !== "")
      .map(([k, v]) => `${k}=${pfEncode(String(v).trim())}`)
      .join("&");
    const redirectUrl = `${base}?${query}&signature=${signature}`;

    await admin
      .from("payfast_payment_sessions")
      .update({ payfast_redirect_url: redirectUrl, updated_at: new Date().toISOString() })
      .eq("id", session.id);

    return json({ session_id: session.id, redirect_url: redirectUrl, sandbox });
  } catch (e: any) {
    console.error("payfast-create-checkout error:", e);
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
