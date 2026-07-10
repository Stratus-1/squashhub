// Creates a small (default R10) Stitch Express test payment link using the
// PLATFORM (head-office / Stratus) Stitch Express credentials stored in
// app_settings.platform_stitch_private_settings. Used from Super Admin →
// Subscriptions to validate the platform gateway before it's wired up to
// automated subscription invoices.
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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 200);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Must be a platform super admin
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return json({ error: "Platform admin only" }, 200);

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount ?? 10);
    const return_url = String(body?.return_url || "https://squashhub.co.za/admin/subscriptions");
    if (!(amount > 0)) return json({ error: "Invalid amount" }, 200);
    const amountCents = Math.round(amount * 100);
    if (amountCents < 100) return json({ error: "Minimum payment is R1.00" }, 200);

    // Load platform Stitch credentials from app_settings
    const { data: settingRow, error: settingErr } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "platform_stitch_private_settings")
      .maybeSingle();
    if (settingErr) return json({ error: settingErr.message }, 200);
    if (!settingRow?.value) return json({ error: "Platform Stitch credentials not configured" }, 200);

    let creds: Record<string, unknown> = {};
    try { creds = JSON.parse(settingRow.value as string); } catch { return json({ error: "Platform Stitch settings are corrupted" }, 200); }
    const clientId = String((creds as any).client_id || "").trim();
    const clientSecret = String((creds as any).client_secret || "").trim();
    const enabled = Boolean((creds as any).enabled);
    const testMode = Boolean((creds as any).test_mode);
    const looksLikeTest = /^test[-_]/i.test(clientId);
    if (!clientId || !clientSecret) return json({ error: "Client ID / Client Secret missing on platform settings" }, 200);
    if (!enabled) return json({ error: "Platform Stitch is disabled — enable it before testing" }, 200);
    if (testMode && !looksLikeTest) return json({ error: "Test mode is ON but Client ID does not look like a Stitch test credential ('test-...')." }, 200);
    if (!testMode && looksLikeTest) return json({ error: "Test mode is OFF but Client ID looks like a Stitch test credential." }, 200);

    // 1) Get bearer token
    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, scope: "client_paymentrequest" }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !(tokenJson as any)?.data?.accessToken) {
      const msg = (tokenJson as any)?.error?.message || (tokenJson as any)?.message || (tokenJson as any)?.error || "check Client ID / Client Secret";
      return json({ error: `Stitch Express auth failed [${tokenResp.status}]: ${msg}` }, 200);
    }
    const accessToken: string = (tokenJson as any).data.accessToken;

    // 2) Create the payment link
    const merchantReference = `SQHUB-TEST-${Date.now().toString().slice(-8)}`.slice(0, 50);
    const plBody: Record<string, unknown> = {
      amount: amountCents,
      payerName: "Platform Test",
      merchantReference,
      merchantRedirectUrl: return_url,
      redirectUrl: return_url,
      currency: "ZAR",
    };
    const plResp = await fetch(`${STITCH_BASE}/payment-links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(plBody),
    });
    const plJson = await plResp.json().catch(() => ({}));
    if (!plResp.ok || !(plJson as any)?.success || !(plJson as any)?.data?.payment?.link) {
      const msg = (plJson as any)?.error?.message || (plJson as any)?.message || ((plJson as any)?.errors && JSON.stringify((plJson as any).errors)) || `HTTP ${plResp.status}`;
      return json({ error: `Stitch Express API error: ${msg}` }, 200);
    }
    const payment = (plJson as any).data.payment;
    const link = payment.link as string;
    const redirect_url = `${link}${link.includes("?") ? "&" : "?"}redirect_url=${encodeURIComponent(return_url)}`;

    return json({
      redirect_url,
      request_id: payment.id,
      merchant_reference: merchantReference,
      mode: testMode ? "TEST" : "LIVE",
    });
  } catch (e: any) {
    console.error("platform-stitch-test-payment error:", e);
    return json({ error: e?.message || "Unexpected error" }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
