// Starts a monthly card arrangement for a member through PayFast.
//
// The member is sent to a normal PayFast checkout flagged as a tokenisation
// payment (subscription_type=2). The first monthly instalment is charged there
// and PayFast returns a card token on the ITN, which we then charge each month
// ourselves (see payfast-charge-mandates).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gatewayEnabled, resolveGatewayCreds } from "../_shared/gateway-creds.ts";
import {
  PAYFAST_LIVE_PROCESS,
  PAYFAST_SANDBOX_PROCESS,
  isSandboxCreds,
  pfEncode,
  pfSignature,
} from "../_shared/payfast.ts";
import { nextChargeDate } from "../_shared/payfast-recurring.ts";

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

    const body = await req.json().catch(() => ({}));
    const {
      club_id,
      club_member_id,
      fee_category_id = null,
      monthly_amount,
      debit_day = 1,
      months_total = null,
      return_url,
    } = body || {};

    if (!club_id || !club_member_id || !monthly_amount || !return_url) {
      return json({ error: "Missing required fields" }, 400);
    }
    const amt = Number(monthly_amount);
    if (!(amt > 0)) return json({ error: "Invalid monthly amount" }, 400);
    const day = Math.min(Math.max(Math.round(Number(debit_day) || 1), 1), 31);

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
    if (clubErr) {
      console.error("payfast-create-mandate: club lookup failed:", clubErr.message);
      return json({ error: `Club lookup failed: ${clubErr.message}` }, 500);
    }
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

    // One live arrangement per member at a time.
    const { data: existing } = await admin
      .from("stitch_mandates")
      .select("id, status")
      .eq("club_member_id", club_member_id)
      .eq("gateway", "payfast")
      .in("status", ["pending", "active"])
      .maybeSingle();
    if (existing?.status === "active") {
      return json({ error: "You already have a monthly card payment set up." }, 400);
    }
    if (existing?.status === "pending") {
      // Reuse the pending row rather than stacking half-finished setups.
      await admin.from("stitch_mandates").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", existing.id);
    }

    const { data: mandate, error: mandErr } = await admin
      .from("stitch_mandates")
      .insert({
        club_id,
        club_member_id,
        user_id: userId,
        gateway: "payfast",
        rail: "card",
        mandate_type: "subscription",
        frequency: "monthly",
        max_amount_cents: Math.round(amt * 100),
        debit_day: day,
        months_total: months_total ? Number(months_total) : null,
        fee_category_id,
        status: "pending",
      })
      .select("id")
      .single();
    if (mandErr || !mandate) {
      return json({ error: mandErr?.message || "Could not create arrangement" }, 500);
    }

    const { data: session, error: sessErr } = await admin
      .from("payfast_payment_sessions")
      .insert({
        club_id,
        club_member_id,
        user_id: userId,
        amount: amt,
        currency: (club as any).currency_code || "ZAR",
        purpose: "topup",
        description: "Monthly card payment — first instalment",
        status: "created",
        mandate_id: mandate.id,
        is_tokenisation: true,
      })
      .select("id")
      .single();
    if (sessErr || !session) {
      return json({ error: sessErr?.message || "Could not create session" }, 500);
    }

    const safeReturnUrl = sanitizeReturnUrl(return_url);
    const returnUrl = appendParam(safeReturnUrl, "payfast_session", session.id);
    const cancelUrl = appendParam(returnUrl, "payfast_cancelled", "1");
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
      ["item_name", `${club.name || "Club"} — monthly fees`.slice(0, 100)],
      ["subscription_type", "2"],
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

    await admin
      .from("stitch_mandates")
      .update({ auth_url: redirectUrl, next_charge_date: nextChargeDate(day) })
      .eq("id", mandate.id);

    return json({ mandate_id: mandate.id, session_id: session.id, redirect_url: redirectUrl, sandbox });
  } catch (e: any) {
    console.error("payfast-create-mandate error:", e);
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
