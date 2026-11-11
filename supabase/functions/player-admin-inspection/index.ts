// GCP Player API bridge. The service-role key stays inside this backend;
// every request must present the existing mobile internal secret, which is
// validated server-side by mobile_internal_secret_ok before any other work.
// Admin actions re-verify is_platform_admin inside the RPCs (and audit).
import { createClient } from "npm:@supabase/supabase-js@2";
import { gatewayEnabled, resolveGatewayCreds } from "../_shared/gateway-creds.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

type Body = {
  action?: string;
  adminUserId?: string;
  clubId?: string;
  memberId?: string;
  email?: string;
  search?: string;
  destination?: string;
  redirectPath?: string;
  lines?: Array<{ bar_item_id?: string; quantity?: number }>;
  requestId?: string;
  saleId?: string;
  tabId?: string;
  cancelled?: boolean;
  amount?: number | string;
  contentType?: string;
  extension?: string;
  path?: string;
};

// EFT top-up proof (mobile): same bucket, path shape and pending row as the
// web MyAccount EFT top-up; the bridge only ever issues its own random paths.
const EFT_PROOF_BUCKET = "payment-proofs";
const EFT_PROOF_MAX_BYTES = 10 * 1024 * 1024;
const EFT_PROOF_TYPES: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};
const EFT_PROOF_EXT_TO_TYPE: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
// Returns integer cents for R10.00–R100,000.00 with at most two decimals, else null.
const topupCents = (v: unknown): number | null => {
  let text: string;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    const scaled = v * 100;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return null;
    text = (Math.round(scaled) / 100).toFixed(2);
  } else if (typeof v === "string") {
    text = v.trim();
  } else return null;
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text);
  if (!m || m[0] !== text) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return cents >= 1000 && cents <= 10_000_000 ? cents : null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const secret = req.headers.get("x-squashhub-internal-secret") ?? "";
  if (secret.length < 32) return json(401, { error: "Unauthorized" });

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: secretOk } = await db.rpc("mobile_internal_secret_ok", { p_sync_secret: secret });
  if (secretOk !== true) return json(401, { error: "Unauthorized" });

  // ---------- Platform admin inspection (read-only, audited in RPC) ----------
  if (body.action === "clubs" || body.action === "club_overview") {
    if (!isUuid(body.adminUserId)) return json(400, { error: "adminUserId required" });
    const { data: isAdmin } = await db.rpc("is_platform_admin", { _user_id: body.adminUserId });
    if (isAdmin !== true) return json(403, { error: "Forbidden" });
    let res;
    if (body.action === "clubs") {
      res = await db.rpc("mobile_platform_admin_clubs", {
        p_sync_secret: secret, p_admin_user_id: body.adminUserId,
        p_search: typeof body.search === "string" && body.search.trim() ? body.search.slice(0, 80) : null,
      });
    } else {
      if (!isUuid(body.clubId)) return json(400, { error: "clubId required" });
      res = await db.rpc("mobile_platform_admin_club_overview", {
        p_sync_secret: secret, p_admin_user_id: body.adminUserId, p_club_id: body.clubId,
      });
    }
    if (res.error) {
      const code = res.error.code === "42501" ? 403 : res.error.code === "P0002" ? 404 : 500;
      return json(code, { error: code === 500 ? "Inspection failed" : res.error.message });
    }
    return json(200, res.data);
  }

  // ---------- Member-scoped actions ----------
  if (!["player_billing_link", "door_ble_config", "player_bar_data", "player_bar_order", "player_bar_online_checkout", "player_bar_verify_sale", "player_eft_topup_upload_url", "player_eft_topup_confirm"].includes(String(body.action))) {
    return json(400, { error: "Unknown action" });
  }
  if (!isUuid(body.clubId) || !isUuid(body.memberId)) return json(400, { error: "clubId and memberId required" });

  const { data: member } = await db
    .from("club_members")
    .select("id, club_id, user_id, name, role, status, suspension_status, suspension_manual")
    .eq("id", body.memberId)
    .eq("club_id", body.clubId)
    .maybeSingle();
  if (!member || member.status !== "active") return json(403, { error: "Member is not active at this club" });

  if (body.action === "player_billing_link") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !email.includes("@")) return json(400, { error: "email required" });
    if (!member.user_id) return json(403, { error: "Member has no linked login" });
    const { data: authUser } = await db.auth.admin.getUserById(member.user_id);
    if (!authUser?.user?.email || authUser.user.email.toLowerCase() !== email) {
      return json(403, { error: "Email does not match this member's login" });
    }
    const { data: club } = await db.from("clubs").select("subdomain").eq("id", body.clubId).maybeSingle();
    const origin = club?.subdomain
      ? `https://${club.subdomain}.squashhub.co.za`
      : "https://squashhub.co.za";
    let path = "/mobile-billing?mobile_token=session";
    if (body.destination === "payment-checkout") {
      // URLSearchParams encodes the comma separator as uppercase %2C; accept both encodings.
      const checkoutPath = /^\/mobile-checkout\?gateway=(?:yoco|stitch|paynow|payfast)&purpose=(?:fee&amount=\d+\.\d{2}&fee_ids=[0-9a-f-]+(?:(?:%2[cC]|,)[0-9a-f-]+)*|topup&amount=\d+\.\d{2})(?:&description=[^#]*)?$/;
      const match = typeof body.redirectPath === "string" ? checkoutPath.exec(body.redirectPath) : null;
      // Require a full-string match: JavaScript's $ may otherwise allow a trailing newline.
      if (!match || match[0] !== body.redirectPath) return json(400, { error: "Invalid checkout redirectPath" });
      path = body.redirectPath;
    } else if (body.destination === "account-topup") {
      // Opens the existing MyAccount Top Up dialog (EFT proof upload / configured
      // online checkout). Only `/my-account?topup=<amount>` with exactly two
      // decimals, no leading zeros, minimum R10; every other path/query is rejected.
      const topupPath = /^\/my-account\?topup=([1-9]\d*\.\d{2})$/;
      const match = typeof body.redirectPath === "string" ? topupPath.exec(body.redirectPath) : null;
      // Require a full-string match: JavaScript's $ may otherwise allow a trailing newline.
      if (!match || match[0] !== body.redirectPath || !(Number(match[1]) >= 10)) {
        return json(400, { error: "Invalid top-up redirectPath" });
      }
      path = body.redirectPath;
    }
    const redirectTo = `${origin}${path}`;
    const { data: link, error } = await db.auth.admin.generateLink({
      type: "magiclink", email: authUser.user.email, options: { redirectTo },
    });
    const actionLink = (link as { properties?: { action_link?: string } } | null)?.properties?.action_link;
    if (error || !actionLink) return json(500, { error: "Could not create billing link" });
    return json(200, { actionLink, redirectTo });
  }

  if (body.action === "player_eft_topup_upload_url" || body.action === "player_eft_topup_confirm") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !email.includes("@")) return json(400, { error: "email required" });
    if (!member.user_id) return json(403, { error: "Member has no linked login" });
    const { data: authUser } = await db.auth.admin.getUserById(member.user_id);
    if (!authUser?.user?.email || authUser.user.email.toLowerCase() !== email) {
      return json(403, { error: "Email does not match this member's login" });
    }
    const { data: club } = await db.from("clubs").select("accepted_payment_methods").eq("id", body.clubId).maybeSingle();
    const methods = Array.isArray(club?.accepted_payment_methods) ? club.accepted_payment_methods : [];
    if (!methods.some((m: unknown) => String(m).toLowerCase() === "eft")) {
      return json(403, { error: "EFT payments are not enabled at this club" });
    }
    const cents = topupCents(body.amount);
    if (cents === null) return json(400, { error: "amount must be between R10.00 and R100000.00 with at most two decimals" });
    const amount = cents / 100;
    const prefix = `${body.clubId}/${body.memberId}`;
    const storage = db.storage.from(EFT_PROOF_BUCKET);

    if (body.action === "player_eft_topup_upload_url") {
      const contentType = typeof body.contentType === "string" ? body.contentType.trim().toLowerCase() : "";
      const allowedExts = EFT_PROOF_TYPES[contentType];
      if (!allowedExts) return json(400, { error: "contentType must be application/pdf, image/jpeg, image/png or image/webp" });
      const extension = typeof body.extension === "string" ? body.extension.trim().toLowerCase().replace(/^\./, "") : "";
      if (!allowedExts.includes(extension)) return json(400, { error: "extension does not match contentType" });
      const path = `${prefix}/topup-${crypto.randomUUID()}.${extension}`;
      const { data: signed, error } = await storage.createSignedUploadUrl(path, { upsert: false });
      if (error || !signed?.signedUrl) return json(500, { error: "Could not create upload URL" });
      return json(200, { uploadUrl: signed.signedUrl, token: signed.token, path, contentType, maxBytes: EFT_PROOF_MAX_BYTES, amount: amount.toFixed(2) });
    }

    // player_eft_topup_confirm
    const path = typeof body.path === "string" ? body.path : "";
    const pathRe = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/(topup-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp))$/;
    const pm = pathRe.exec(path);
    // Full-string match against this exact club/member prefix (case-sensitive, as issued).
    if (!pm || pm[0] !== path || pm[1] !== body.clubId || pm[2] !== body.memberId) {
      return json(400, { error: "Invalid proof path" });
    }
    const fileName = pm[3];
    const { data: listed, error: listErr } = await storage.list(prefix, { search: fileName, limit: 10 });
    if (listErr) return json(500, { error: "Could not check the uploaded proof" });
    const obj = (listed || []).find((o: { name: string }) => o.name === fileName) as
      | { name: string; id?: string | null; metadata?: { size?: number; mimetype?: string } | null }
      | undefined;
    if (!obj || !obj.id) return json(404, { error: "Proof of payment has not been uploaded" });
    const size = Number(obj.metadata?.size ?? NaN);
    if (!Number.isFinite(size) || size <= 0) return json(400, { error: "Uploaded proof is empty" });
    if (size > EFT_PROOF_MAX_BYTES) return json(413, { error: "Proof of payment must be 10 MB or smaller" });

    const { data: existing, error: exErr } = await db.from("member_credit_transactions")
      .select("id, amount")
      .eq("club_id", body.clubId).eq("club_member_id", body.memberId).eq("proof_url", path)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (exErr) return json(500, { error: "Could not check existing top-up" });
    if (existing) {
      if (Math.round(Number(existing.amount) * 100) !== cents) {
        return json(409, { error: "This proof is already attached to a top-up with a different amount" });
      }
      return json(200, { ok: true, transactionId: existing.id });
    }

    const { data: inserted, error: insErr } = await db.from("member_credit_transactions").insert({
      club_id: body.clubId,
      club_member_id: body.memberId,
      amount,
      type: "debit",
      method: "eft",
      description: "Top-up via EFT",
      status: "pending",
      proof_url: path,
    }).select("id").single();
    if (insErr || !inserted?.id) return json(500, { error: "Could not record the top-up" });

    // Best-effort finance notification, as on web; never fails the confirm.
    try {
      const { error: nErr } = await db.functions.invoke("notify-pending-topup", { body: { transactionId: inserted.id } });
      if (nErr) console.warn("[player-admin-inspection] notify-pending-topup failed", nErr.message);
    } catch (e) {
      console.warn("[player-admin-inspection] notify-pending-topup failed", (e as Error).message);
    }
    return json(200, { ok: true, transactionId: inserted.id });
  }

  if (["player_bar_data", "player_bar_order", "player_bar_online_checkout", "player_bar_verify_sale"].includes(String(body.action))) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !email.includes("@")) return json(400, { error: "email required" });
    if (!member.user_id) return json(403, { error: "Member has no linked login" });
    const { data: authUser } = await db.auth.admin.getUserById(member.user_id);
    if (!authUser?.user?.email || authUser.user.email.toLowerCase() !== email) {
      return json(403, { error: "Email does not match this member's login" });
    }
    const { data: club } = await db.from("clubs")
      .select("id, name, subdomain, currency_code, currency_symbol, honesty_bar_enabled, bar_order_process_enabled, bar_account_tab_enabled, bar_pay_online_enabled, bar_card_swipe_enabled, payment_gateway, payment_gateways")
      .eq("id", body.clubId).maybeSingle();
    if (!club?.honesty_bar_enabled) return json(403, { error: "The club bar is not enabled" });

    // Match bar-card-pay's selection and credential checks, not every gateway
    // that could theoretically be enabled. The downstream function rechecks.
    const onlinePaymentAvailable = async () => {
      if (club.bar_pay_online_enabled === false) return false;
      const primary = String(club.payment_gateway || "").toLowerCase();
      const gateway = ["stitch", "yoco", "payfast"].includes(primary)
        ? primary : gatewayEnabled(club, "payfast") ? "payfast" : primary;
      if (!["stitch", "yoco", "payfast"].includes(gateway)) return false;
      const { data: settings, error } = await db.from("club_secrets")
        .select("payment_gateway_credentials, payment_gateway_secret_key")
        .eq("club_id", body.clubId).maybeSingle();
      if (error || !settings) return false;
      const creds = (settings.payment_gateway_credentials || {}) as Record<string, string>;
      if (gateway === "stitch") return !!((creds.client_id || "").trim() && (creds.client_secret || "").trim());
      if (gateway === "yoco") return !!String(creds.secret_key || settings.payment_gateway_secret_key || "").trim();
      const pf = resolveGatewayCreds(settings.payment_gateway_credentials, "payfast");
      return !!((pf.merchant_id || "").trim() && (pf.merchant_key || "").trim());
    };

    if (body.action === "player_bar_data") {
      const { data: qr } = await db.from("qr_short_codes").select("code")
        .eq("club_id", body.clubId).eq("active", true).is("bar_item_id", null)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (!qr?.code) return json(404, { error: "The club bar menu is not configured" });
      const { data: menu, error: menuError } = await db.rpc("resolve_qr_short_code", { _code: qr.code });
      if (menuError || !menu?.found || !menu?.bar_enabled && !menu?.club?.bar_enabled) {
        return json(404, { error: "The club bar menu is unavailable" });
      }
      const { data: tab } = await db.from("bar_guest_tabs")
        .select("id, status, opened_at")
        .eq("club_id", body.clubId).eq("club_member_id", body.memberId)
        .eq("opened_source", "in_app").in("status", ["open", "closing"])
        .order("opened_at", { ascending: false }).limit(1).maybeSingle();
      let activeTab = null;
      if (tab) {
        const { data: sales } = await db.from("bar_visitor_sales")
          .select("bar_item_id, quantity, unit_price, total, note, bar_items:bar_item_id(name)")
          .eq("club_id", body.clubId).eq("guest_tab_id", tab.id)
          .in("payment_status", ["on_tab", "pending"])
          .order("created_at", { ascending: true });
        activeTab = {
          id: tab.id,
          status: tab.status,
          total: (sales || []).reduce((sum, row) => sum + Number(row.total || 0), 0),
          lines: (sales || []).map((row: any) => ({
            itemId: row.bar_item_id, name: row.bar_items?.name || "Bar item",
            quantity: Number(row.quantity || 0), unitPrice: Number(row.unit_price || 0), total: Number(row.total || 0),
          })),
        };
      }
      const [orderStatus, preview, barOnlineEnabled] = await Promise.all([
        db.rpc("bar_order_process_status", { _club_id: body.clubId }),
        db.rpc("bar_account_charge_preview", { _club_member_id: body.memberId, _sync_secret: secret }),
        onlinePaymentAvailable(),
      ]);
      if (orderStatus.error || typeof orderStatus.data !== "boolean") return json(503, { error: "Could not read the club's bar order setting" });
      // An unavailable early warning never overrides the authoritative debit gate.
      const row = !preview.error && Array.isArray(preview.data) ? preview.data[0] : null;
      const accountChargePreview = row ? {
        bar_gated: row.bar_gated, shop_gated: row.shop_gated,
        current_owing: row.current_owing, allowance: row.allowance,
      } : null;
      return json(200, {
        club: {
          ...menu.club, currency_symbol: club.currency_symbol, currency_code: club.currency_code,
          bar_enabled: club.honesty_bar_enabled === true,
          account_tab_enabled: club.bar_account_tab_enabled !== false,
          pay_online_enabled: barOnlineEnabled,
          card_swipe_enabled: club.bar_card_swipe_enabled !== false,
        },
        menu: Array.isArray(menu.menu) ? menu.menu : [],
        orderProcessEnabled: orderStatus.data,
        accountTabEnabled: club.bar_account_tab_enabled !== false,
        onlinePaymentEnabled: barOnlineEnabled,
        cardSwipeEnabled: club.bar_card_swipe_enabled !== false,
        activeTab,
        accountChargePreview,
      });
    }

    if (body.action === "player_bar_verify_sale") {
      if (!isUuid(body.saleId)) return json(400, { error: "saleId required" });
      const { data: sale } = await db.from("bar_visitor_sales")
        .select("id, club_id, operator_member_id, guest_tab_id")
        .eq("id", body.saleId).eq("club_id", body.clubId).maybeSingle();
      if (!sale) return json(404, { error: "Bar payment not found" });
      const belongsToMember = sale.operator_member_id === body.memberId;
      let tabMatchesMember = false;
      if (sale.guest_tab_id) {
        const { data: tab } = await db.from("bar_guest_tabs").select("id")
          .eq("id", sale.guest_tab_id).eq("club_id", body.clubId)
          .eq("club_member_id", body.memberId).maybeSingle();
        tabMatchesMember = !!tab;
      }
      if (!belongsToMember && !tabMatchesMember) return json(403, { error: "Bar payment does not belong to this member" });
      const result = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/bar-card-verify`, {
        method: "POST", headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: body.saleId, cancelled: body.cancelled === true }),
      });
      const payload = await result.json().catch(() => null);
      if (!result.ok) return json(result.status, { error: payload?.error || "Could not verify bar payment" });
      return json(200, payload);
    }

    const { data: qr } = await db.from("qr_short_codes").select("code")
      .eq("club_id", body.clubId).eq("active", true).is("bar_item_id", null)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!qr?.code) return json(404, { error: "The club bar menu is not configured" });

    if (body.action === "player_bar_order") {
      const { data: orderProcessEnabled, error: modeError } = await db.rpc("bar_order_process_status", { _club_id: body.clubId });
      if (modeError || typeof orderProcessEnabled !== "boolean") return json(503, { error: "Could not read the club's bar order setting" });
      const accountTabEnabled = club.bar_account_tab_enabled !== false;
      if (!orderProcessEnabled && !accountTabEnabled) {
        return json(403, { error: "This club has disabled both bar order-ahead and member bar tabs" });
      }
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length || lines.length > 30) return json(400, { error: "Choose one or more available bar items" });
      const cleanLines = lines.map((line) => ({ bar_item_id: String(line.bar_item_id || ""), quantity: Number(line.quantity) }));
      if (cleanLines.some((line) => !isUuid(line.bar_item_id) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50)) {
        return json(400, { error: "One or more bar quantities are invalid" });
      }
      const requestId = typeof body.requestId === "string" && body.requestId.trim().length <= 100
        ? body.requestId.trim() : crypto.randomUUID();
      const { data: tab, error: tabError } = await db.rpc("open_my_bar_tab", {
        _club_id: body.clubId, _club_member_id: body.memberId, _sync_secret: secret,
      });
      if (tabError || !tab?.tab_id || !tab?.token) return json(400, { error: tabError?.message || "Could not open your club tab" });
      const { data: orderProcess, error: recheckError } = await db.rpc("bar_order_process_status", { _club_id: body.clubId });
      if (recheckError || typeof orderProcess !== "boolean") return json(503, { error: "Could not read the club's bar order setting" });
      const operation = orderProcess
        ? await db.rpc("bar_submit_guest_order", {
          _tab_id: tab.tab_id, _token: tab.token,
          _lines: cleanLines, _fulfilment: "collect", _location: "", _note: "", _idempotency_key: requestId,
        })
        : await db.rpc("add_to_bar_guest_tab", { _tab_id: tab.tab_id, _token: tab.token, _lines: cleanLines });
      if (operation.error) return json(400, { error: operation.error.message || "Could not add your order" });
      return json(200, {
        orderProcessEnabled: orderProcess,
        orderNumber: orderProcess ? operation.data?.order_number ?? null : null,
        message: orderProcess ? "Order sent to the bar" : "Items added to your club tab",
      });
    }

    if (body.action === "player_bar_online_checkout") {
      if (club.bar_pay_online_enabled === false) return json(403, { error: "Online bar payments are disabled by this club" });
      if (!await onlinePaymentAvailable()) return json(403, { error: "This club has no configured supported online bar gateway enabled" });
      if (club.bar_account_tab_enabled !== false && isUuid(body.tabId)) {
        const { data: tab } = await db.from("bar_guest_tabs")
          .select("id, token, status")
          .eq("id", body.tabId).eq("club_id", body.clubId)
          .eq("club_member_id", body.memberId).eq("opened_source", "in_app")
          .in("status", ["open", "closing"]).maybeSingle();
        if (!tab) return json(404, { error: "Your open club tab was not found" });
        if (tab.status !== "open") return json(409, { error: "This tab already has a payment being processed" });
        const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/bar-card-pay`, {
          method: "POST", headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "Content-Type": "application/json" },
          body: JSON.stringify({ code: qr.code, tab_id: tab.id, tab_token: tab.token, buyer_name: member.name }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.redirect_url || !payload?.sale_id) return json(response.status || 400, { error: payload?.error || "Could not start the club tab payment" });
        return json(200, { saleId: payload.sale_id, checkoutUrl: payload.redirect_url, code: qr.code });
      }
      const lines = Array.isArray(body.lines) ? body.lines : [];
      if (!lines.length || lines.length > 30) return json(400, { error: "Choose one or more bar items" });
      const cleanLines = lines.map((line) => ({ bar_item_id: String(line.bar_item_id || ""), quantity: Number(line.quantity) }));
      if (cleanLines.some((line) => !isUuid(line.bar_item_id) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50)) {
        return json(400, { error: "One or more bar quantities are invalid" });
      }
      const { data: menu, error: menuError } = await db.rpc("resolve_qr_short_code", { _code: qr.code });
      if (menuError || !menu?.found || !Array.isArray(menu.menu)) return json(404, { error: "The club menu is unavailable" });
      const validIds = new Set(menu.menu.map((item: any) => String(item.id)));
      if (cleanLines.some((line) => !validIds.has(line.bar_item_id))) return json(409, { error: "A selected item is no longer available. Refresh the menu." });
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/bar-card-pay`, {
        method: "POST", headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "Content-Type": "application/json" },
        body: JSON.stringify({ code: qr.code, lines: cleanLines, buyer_name: member.name, operator_member_id: body.memberId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.redirect_url || !payload?.sale_id) return json(response.status || 400, { error: payload?.error || "Could not start the club bar payment" });
      return json(200, { saleId: payload.sale_id, checkoutUrl: payload.redirect_url, code: qr.code });
    }
  }

  // door_ble_config
  const blocked = (member.suspension_manual &&
      (member.suspension_status === "suspended" || member.suspension_status === "manual_hold")) ||
    member.suspension_status === "suspended";
  if (blocked) return json(403, { error: "Door access is suspended for this member" });
  if (member.role === "visitor") {
    const { data: club } = await db.from("clubs").select("visitors_access_control").eq("id", body.clubId).maybeSingle();
    if (!club?.visitors_access_control) return json(403, { error: "Visitors do not have door access at this club" });
  }
  const { data: cfg } = await db
    .from("club_secrets")
    .select("shelly_door_ble_mac, shelly_ble_control_password, shelly_door_channel, shelly_door_pulse_ms")
    .eq("club_id", body.clubId)
    .maybeSingle();
  if (!cfg?.shelly_door_ble_mac) return json(404, { error: "No Bluetooth door configured for this club" });
  return json(200, {
    shelly_door_ble_mac: cfg.shelly_door_ble_mac,
    shelly_ble_control_password: cfg.shelly_ble_control_password,
    shelly_door_channel: cfg.shelly_door_channel,
    shelly_door_pulse_ms: cfg.shelly_door_pulse_ms,
  });
});
