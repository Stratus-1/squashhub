// Public scan-to-pay card checkout for the honesty bar.
// Creates a real Stitch card payment for a QR bar sale (visitor or member),
// records the sale as PENDING and returns the hosted checkout URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_BASE = "https://api.stitch.money/v2";
const STITCH_EXPRESS_BASE = "https://express.stitch.money/api/v1";
const PUBLIC_APP_ORIGIN = "https://www.squashhub.co.za";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { code, bar_item_id, quantity = 1, buyer_name = null, return_url = null } = body || {};

    // Tab-settlement mode: pay a whole open guest tab online by card.
    const tabId = body?.tab_id ? String(body.tab_id) : null;
    const tabToken = body?.tab_token ? String(body.tab_token) : null;
    const tabMode = !!(tabId && tabToken);

    // Cart support: `lines: [{ bar_item_id, quantity }]`. Single-item callers
    // keep working via bar_item_id/quantity.
    const rawLines: Array<{ bar_item_id: string; quantity: number }> =
      Array.isArray(body?.lines) && body.lines.length
        ? body.lines
        : bar_item_id
          ? [{ bar_item_id, quantity: Number(quantity) }]
          : [];
    const lines = rawLines
      .map((l) => ({ bar_item_id: String(l?.bar_item_id || ""), quantity: Number(l?.quantity) }))
      .filter((l) => l.bar_item_id && l.quantity >= 1 && l.quantity <= 50);
    if (!code || (!tabMode && (lines.length === 0 || lines.length > 30))) {
      return json({ error: "Missing or invalid payment details" });
    }

    const { data: qr } = await admin
      .from("qr_short_codes")
      .select("id, club_id, bar_item_id, active")
      .eq("code", code).maybeSingle();
    if (!qr || !qr.active) return json({ error: "This QR code is no longer active" });

    let amount = 0;
    let saleIds: string[] = [];
    let payerName = (buyer_name || "").trim();
    let tabRow: any = null;
    let itemMap = new Map<string, any>();

    if (tabMode) {
      // Resolve the open tab and charge its outstanding lines.
      const { data: t } = await admin
        .from("bar_guest_tabs")
        .select("id, club_id, guest_name, status")
        .eq("id", tabId).eq("token", tabToken).maybeSingle();
      if (!t || t.club_id !== qr.club_id) return json({ error: "Tab not found" });
      if (t.status !== "open") return json({ error: "This tab has already been settled" });
      tabRow = t;
      const { data: tabSales } = await admin
        .from("bar_visitor_sales")
        .select("id, total")
        .eq("guest_tab_id", t.id)
        .eq("payment_status", "on_tab");
      if (!tabSales?.length) return json({ error: "Your tab is empty" });
      saleIds = tabSales.map((s: any) => s.id);
      amount = tabSales.reduce((s: number, r: any) => s + Number(r.total), 0);
      payerName = String(t.guest_name || "").trim();
    } else {
      const { data: items } = await admin
        .from("bar_items")
        .select("id, name, price, club_id, active")
        .eq("club_id", qr.club_id)
        .in("id", lines.map((l) => l.bar_item_id));
      itemMap = new Map((items || []).filter((i: any) => i.active).map((i: any) => [i.id, i]));
      if (itemMap.size !== new Set(lines.map((l) => l.bar_item_id)).size) {
        return json({ error: "One or more items are not available" });
      }

      amount = lines.reduce(
        (sum, l) => sum + Number((itemMap.get(l.bar_item_id) as any).price) * l.quantity, 0,
      );
    }
    if (!(amount > 0)) return json({ error: "Invalid amount" });
    if (Math.round(amount * 100) < 100) {
      return json({ error: "Card payments must be at least R1.00 — please add another item or charge to your account." });
    }

    const { data: club } = await admin
      .from("clubs").select("id, name, subdomain, payment_gateway").eq("id", qr.club_id).maybeSingle();
    const gateway = String(club?.payment_gateway || "").toLowerCase();
    if (!club || !["stitch", "yoco"].includes(gateway)) {
      return json({ error: "Card payments are not enabled for this club" });
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials, payment_gateway_secret_key")
      .eq("club_id", club.id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    const yocoSecretKey = String(creds.secret_key || (secrets as any)?.payment_gateway_secret_key || "").trim();
    if (gateway === "stitch" && (!clientId || !clientSecret)) {
      return json({ error: "This club has not finished its card payment setup" });
    }
    if (gateway === "yoco" && !yocoSecretKey) {
      return json({ error: "This club has not finished its card payment setup" });
    }

    if (tabMode) {
      // Move the tab's lines into a pending card payment and start closing the tab.
      await admin.from("bar_visitor_sales")
        .update({ payment_method: "card", payment_status: "pending", note: "Bar tab · paid online by card" })
        .in("id", saleIds);
      await admin.from("bar_guest_tabs")
        .update({ status: "closing", settled_method: "online" })
        .eq("id", tabRow.id);
    } else {
      // Record the sale lines up-front as pending so stock/admin views stay accurate.
      const { data: sales, error: saleErr } = await admin
        .from("bar_visitor_sales")
        .insert(lines.map((l) => {
          const it = itemMap.get(l.bar_item_id) as any;
          return {
            club_id: club.id,
            bar_item_id: it.id,
            quantity: l.quantity,
            unit_price: Number(it.price),
            total: Number(it.price) * l.quantity,
            payment_method: "card",
            visitor_name: payerName || null,
            note: "Scan-to-pay (QR) · card checkout",
            payment_status: "pending",
          };
        }))
        .select("id");
      if (saleErr || !sales?.length) return json({ error: saleErr?.message || "Could not start the sale" });
      saleIds = sales.map((s: any) => s.id);
    }
    const sale = { id: saleIds[0] };

    // Revert helper: on gateway failure, tab lines go back onto the open tab.
    const failSales = async () => {
      if (tabMode) {
        await admin.from("bar_visitor_sales")
          .update({ payment_method: "tab", payment_status: "on_tab", note: "Open bar tab" })
          .in("id", saleIds);
        await admin.from("bar_guest_tabs")
          .update({ status: "open", settled_method: null })
          .eq("id", tabRow.id);
      } else {
        await admin.from("bar_visitor_sales").update({ payment_status: "failed" }).in("id", saleIds);
      }
    };

    const reference = `${tabMode ? "TAB" : "BAR"}-${String(sale.id).slice(0, 8)}`;
    const redirectUri = `${PUBLIC_APP_ORIGIN}/pay/return`;

    // ---- Yoco tenants -------------------------------------------------
    if (gateway === "yoco") {
      const cancelUrl = redirectUri.replace(/\/success$/, "");
      const resp = await fetch("https://payments.yoco.com/api/checkouts", {
        method: "POST",
        headers: { Authorization: `Bearer ${yocoSecretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency: "ZAR",
          successUrl: redirectUri,
          cancelUrl,
          failureUrl: cancelUrl,
          metadata: { sale_id: String(sale.id), reference, club_id: club.id, source: "bar-scan-to-pay" },
        }),
      });
      const yocoData = await resp.json().catch(() => ({}));
      const checkoutId = yocoData?.id || yocoData?.checkoutId || yocoData?.checkout_id;
      if (!resp.ok || !checkoutId || !yocoData?.redirectUrl) {
        await admin.from("bar_visitor_sales").update({ payment_status: "failed" }).in("id", saleIds);
        console.error("Yoco bar checkout failed", resp.status, yocoData);
        return json({ error: "Could not create the card payment" });
      }
      await admin.from("bar_visitor_sales")
        .update({ payment_reference: String(checkoutId) }).in("id", saleIds);
      return json({ sale_id: sale.id, sale_ids: saleIds, redirect_url: String(yocoData.redirectUrl) });
    }


    try {
      const request = await createPaymentRequest({
        clientId, clientSecret, amount, reference,
        payerName: (buyer_name || "Bar customer").slice(0, 40),
        payerId: String(sale.id),
        redirectUri,
      });
      await admin.from("bar_visitor_sales")
        .update({ payment_reference: request.id }).in("id", saleIds);
      return json({ sale_id: sale.id, sale_ids: saleIds, redirect_url: request.redirect_url });
    } catch (err) {
      console.warn("payment-request failed, trying Express link:", (err as Error)?.message || err);
    }

    // Express fallback
    const tokenResp = await fetch(`${STITCH_EXPRESS_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    const accessToken = tokenJson?.data?.accessToken;
    if (!tokenResp.ok || !accessToken) {
      await admin.from("bar_visitor_sales").update({ payment_status: "failed" }).in("id", saleIds);
      return json({ error: "Could not reach the card payment provider" });
    }
    const plResp = await fetch(`${STITCH_EXPRESS_BASE}/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "ZAR",
        payerName: (buyer_name || "Bar customer").slice(0, 40),
        merchantReference: reference,
      }),
    });
    const plJson = await plResp.json().catch(() => ({}));
    const link = plJson?.data?.payment?.link;
    if (!plResp.ok || !link) {
      await admin.from("bar_visitor_sales").update({ payment_status: "failed" }).in("id", saleIds);
      return json({ error: "Could not create the card payment" });
    }
    await admin.from("bar_visitor_sales")
      .update({ payment_reference: String(plJson.data.payment.id) }).in("id", saleIds);
    // Stitch Express permits only a small redirect allow-list. Every club uses
    // the one shared SquashHub callback; that page forwards back to the bar.
    return json({
      sale_id: sale.id,
      sale_ids: saleIds,
      redirect_url: await appendRedirectIfReachable(String(link), redirectUri),
    });

  } catch (e: any) {
    console.error("bar-card-pay error:", e);
    return json({ error: e?.message || "Unexpected error" });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function appendRedirectUrl(link: string, returnUrl: string) {
  if (!link || !returnUrl) return link;
  try {
    const url = new URL(link);
    url.searchParams.delete("redirect_uri");
    url.searchParams.set("redirect_url", returnUrl);
    return url.toString();
  } catch {
    const separator = link.includes("?") ? "&" : "?";
    return `${link}${separator}redirect_url=${encodeURIComponent(returnUrl)}`;
  }
}

async function appendRedirectIfReachable(link: string, returnUrl: string) {
  const candidate = appendRedirectUrl(link, returnUrl);
  try {
    const response = await fetch(candidate, { method: "GET", redirect: "follow" });
    if (response.ok) return candidate;
    console.warn(`[bar-card-pay] shared callback rejected (${response.status}); using bare hosted link`);
  } catch (error) {
    console.warn("[bar-card-pay] callback check failed; using bare hosted link", error);
  }
  return link;
}


async function getToken(clientId: string, clientSecret: string) {
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
  const token = data?.access_token || data?.accessToken;
  if (!resp.ok || !token) throw new Error(data?.detail || data?.error || `token HTTP ${resp.status}`);
  return String(token);
}

async function createPaymentRequest(opts: {
  clientId: string; clientSecret: string; amount: number; reference: string;
  payerName: string; payerId: string; redirectUri: string;
}) {
  const accessToken = await getToken(opts.clientId, opts.clientSecret);
  const resp = await fetch(`${STITCH_API_BASE}/payment-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "ZAR", quantity: Number(opts.amount.toFixed(2)) },
      externalReference: opts.reference,
      expireAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      payer: { identifier: opts.payerId, fullName: opts.payerName.trim().padEnd(3, " ") },
      metadata: { squashhubBarSale: opts.payerId },
      // The return destination belongs in the REQUEST BODY. Query params on the
      // hosted interaction URL are ignored (and `redirect_url` even 404s it).
      redirectUrl: opts.redirectUri,
      paymentMethods: {
        eft: { enabled: false },
        card: { enabled: true },
        crypto: { enabled: false },
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  const redirectBase = data?.interaction?.url;
  if (!resp.ok || !data?.id || !redirectBase) {
    throw new Error(data?.detail || data?.message || `payment request HTTP ${resp.status}`);
  }
  // Hand back the hosted URL exactly as Stitch issued it — never append params.
  return { id: String(data.id), redirect_url: String(redirectBase) };
}

