// Creates a Stitch Express payment link for a platform subscription invoice
// using the PLATFORM Stitch credentials (app_settings.platform_stitch_private_settings).
// Called by club admins from the Subscription tab.
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

    const body = await req.json().catch(() => ({}));
    const invoice_id = String(body?.invoice_id || "").trim();
    const return_url = String(body?.return_url || "https://squashhub.co.za/club-admin");
    if (!invoice_id) return json({ error: "invoice_id required" }, 200);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load invoice
    const { data: inv, error: invErr } = await admin
      .from("platform_subscription_invoices")
      .select("id, club_id, invoice_number, total, currency, status")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !inv) return json({ error: "Invoice not found" }, 200);
    if (inv.status === "paid" || inv.status === "void") {
      return json({ error: `Invoice is ${inv.status}` }, 200);
    }

    // Caller must be admin of the club that owns this invoice
    const { data: membership } = await admin
      .from("club_members")
      .select("id, role")
      .eq("club_id", inv.club_id)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper && (!membership || membership.role !== "admin")) {
      return json({ error: "Only club admins can pay this invoice" }, 200);
    }

    const amountCents = Math.round(Number(inv.total || 0) * 100);
    if (amountCents < 100) return json({ error: `Invoice total below minimum (${inv.currency || "ZAR"} 1.00)` }, 200);

    // Load platform Stitch credentials
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
    if (!clientId || !clientSecret) return json({ error: "Platform Stitch Client ID / Secret missing" }, 200);
    if (!enabled) return json({ error: "Platform Stitch is disabled" }, 200);
    if (testMode && !looksLikeTest) return json({ error: "Test mode is ON but Client ID is not a test credential" }, 200);
    if (!testMode && looksLikeTest) return json({ error: "Test mode is OFF but Client ID looks like a test credential" }, 200);

    // 1) Bearer token
    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, scope: "client_paymentrequest" }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !(tokenJson as any)?.data?.accessToken) {
      const msg = (tokenJson as any)?.error?.message || (tokenJson as any)?.message || `HTTP ${tokenResp.status}`;
      return json({ error: `Stitch auth failed: ${msg}` }, 200);
    }
    const accessToken: string = (tokenJson as any).data.accessToken;

    // 2) Payment link — use invoice_number as merchantReference
    const merchantReference = String(inv.invoice_number).slice(0, 50);
    const plBody: Record<string, unknown> = {
      amount: amountCents,
      payerName: "Club Subscription",
      merchantReference,
      merchantRedirectUrl: return_url,
      redirectUrl: return_url,
      currency: inv.currency || "ZAR",
    };
    const plResp = await fetch(`${STITCH_BASE}/payment-links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(plBody),
    });
    const plJson = await plResp.json().catch(() => ({}));
    if (!plResp.ok || !(plJson as any)?.success || !(plJson as any)?.data?.payment?.link) {
      const msg = (plJson as any)?.error?.message || (plJson as any)?.message || `HTTP ${plResp.status}`;
      return json({ error: `Stitch API error: ${msg}` }, 200);
    }
    const payment = (plJson as any).data.payment;
    const link = payment.link as string;
    const redirect_url = link;

    // Record the payment attempt on the invoice (best-effort)
    await admin.from("platform_subscription_invoices")
      .update({ stitch_payment_id: payment.id, stitch_payment_link: link })
      .eq("id", invoice_id);

    return json({ redirect_url, request_id: payment.id, merchant_reference: merchantReference });
  } catch (e: any) {
    console.error("stitch-pay-platform-invoice error:", e);
    return json({ error: e?.message || "Unexpected error" }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
