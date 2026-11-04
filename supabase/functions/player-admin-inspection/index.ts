// GCP Player API bridge. The service-role key stays inside this backend;
// every request must present the existing mobile internal secret, which is
// validated server-side by mobile_internal_secret_ok before any other work.
// Admin actions re-verify is_platform_admin inside the RPCs (and audit).
import { createClient } from "npm:@supabase/supabase-js@2";

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
  if (body.action !== "player_billing_link" && body.action !== "door_ble_config") {
    return json(400, { error: "Unknown action" });
  }
  if (!isUuid(body.clubId) || !isUuid(body.memberId)) return json(400, { error: "clubId and memberId required" });

  const { data: member } = await db
    .from("club_members")
    .select("id, club_id, user_id, role, status, suspension_status, suspension_manual")
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
      const checkoutPath = /^\/mobile-checkout\?(?:gateway=(?:yoco|stitch|paynow|payfast)&purpose=fee&amount=\d+\.\d{2}&fee_ids=[0-9a-f-]+(?:(?:%2c|,)[0-9a-f-]+)*(?:&description=[^#]*)?)$/;
      const match = typeof body.redirectPath === "string" ? checkoutPath.exec(body.redirectPath) : null;
      // Require a full-string match: JavaScript's $ may otherwise allow a trailing newline.
      if (!match || match[0] !== body.redirectPath) return json(400, { error: "Invalid checkout redirectPath" });
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
