// Verifies a Stitch Express payment for a PLATFORM subscription invoice.
// Called by SubscriptionTab after Stitch redirects the club admin back.
// Uses the PLATFORM Stitch credentials (app_settings.platform_stitch_private_settings)
// and marks the invoice paid when Stitch reports PAID.
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
    const invoice_number = String(body?.invoice_number || body?.reference || "").trim();
    const payment_id = String(body?.payment_id || "").trim();
    if (!invoice_number && !payment_id) return json({ error: "invoice_number or payment_id required" }, 200);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Locate invoice by number (preferred) or by stitch payment id
    let invQ = admin
      .from("platform_subscription_invoices")
      .select("id, club_id, invoice_number, total, currency, status, stitch_payment_id, stitch_payment_link");
    if (invoice_number) invQ = invQ.eq("invoice_number", invoice_number);
    else invQ = invQ.eq("stitch_payment_id", payment_id);
    const { data: inv, error: invErr } = await invQ.maybeSingle();
    if (invErr || !inv) return json({ error: "Invoice not found" }, 200);

    // Caller must be admin of that club (or platform super admin)
    const { data: membership } = await admin
      .from("club_members")
      .select("id, role")
      .eq("club_id", inv.club_id)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper && (!membership || membership.role !== "admin")) {
      return json({ error: "Forbidden" }, 200);
    }

    if (inv.status === "paid") return json({ status: "paid", already: true });
    if (inv.status === "void") return json({ status: "void" });

    const stitchId = payment_id || inv.stitch_payment_id;
    if (!stitchId) return json({ status: inv.status, stitch_state: "UNKNOWN" });

    // Platform Stitch credentials
    const { data: settingRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "platform_stitch_private_settings")
      .maybeSingle();
    if (!settingRow?.value) return json({ error: "Platform Stitch credentials not configured" }, 200);
    let creds: any = {};
    try { creds = JSON.parse(settingRow.value as string); } catch { return json({ error: "Platform Stitch settings corrupted" }, 200); }
    const clientId = String(creds.client_id || "").trim();
    const clientSecret = String(creds.client_secret || "").trim();
    if (!clientId || !clientSecret) return json({ error: "Platform Stitch keys missing" }, 200);

    // Token
    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, scope: "client_paymentrequest" }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !(tokenJson as any)?.data?.accessToken) {
      return json({ error: "Stitch auth failed" }, 200);
    }
    const accessToken: string = (tokenJson as any).data.accessToken;

    // Fetch payment link status
    const plResp = await fetch(`${STITCH_BASE}/payment-links/${encodeURIComponent(stitchId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const plJson = await plResp.json().catch(() => ({}));
    if (!plResp.ok) return json({ error: "Stitch verify failed", detail: plJson }, 200);

    const status: string = (plJson as any)?.data?.payment?.status || "PENDING";
    if (status === "PAID") {
      await admin
        .from("platform_subscription_invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stitch_payment_id: stitchId,
        })
        .eq("id", inv.id)
        .neq("status", "paid");
      return json({ status: "paid", stitch_state: status });
    }

    return json({ status: inv.status, stitch_state: status });
  } catch (e: any) {
    console.error("stitch-verify-platform-invoice error:", e);
    return json({ error: e?.message || "Unexpected error" }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
