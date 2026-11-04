// Read-only platform-admin club inspection for the GCP Player API.
// The service-role key stays inside this backend; callers present the existing
// mobile internal secret (validated by mobile_internal_secret_ok) and the
// admin user id, which the RPCs re-verify with is_platform_admin and audit.
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const secret = req.headers.get("x-squashhub-internal-secret") ?? "";
  if (secret.length < 32) return json(401, { error: "Unauthorized" });

  let body: { action?: string; adminUserId?: string; clubId?: string; search?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  if (!body.adminUserId || !UUID.test(body.adminUserId)) return json(400, { error: "adminUserId required" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let res;
  if (body.action === "clubs") {
    res = await db.rpc("mobile_platform_admin_clubs", {
      p_sync_secret: secret, p_admin_user_id: body.adminUserId, p_search: body.search?.slice(0, 80) || null,
    });
  } else if (body.action === "club_overview") {
    if (!body.clubId || !UUID.test(body.clubId)) return json(400, { error: "clubId required" });
    res = await db.rpc("mobile_platform_admin_club_overview", {
      p_sync_secret: secret, p_admin_user_id: body.adminUserId, p_club_id: body.clubId,
    });
  } else {
    return json(400, { error: "Unknown action" });
  }
  if (res.error) {
    const code = res.error.code === "42501" ? 403 : res.error.code === "P0002" ? 404 : 500;
    return json(code, { error: code === 500 ? "Inspection failed" : res.error.message });
  }
  return json(200, res.data);
});
