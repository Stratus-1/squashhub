import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function assertFinanceAdministrator(admin: SupabaseClient, userId: string, clubId: string) {
  const [chairman, platform, permitted] = await Promise.all([
    admin.rpc("is_club_chairman", { _user_id: userId, _club_id: clubId }),
    admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    admin.rpc("is_club_admin_or_permitted", { _user_id: userId, _club_id: clubId, _permission: "finance" }),
  ]);
  if (chairman.error || platform.error || permitted.error) throw new Error("Could not verify financial permissions");
  if (platform.data === true) return;
  if (chairman.data === true) throw new Error("Chairman financial access is view-only");
  if (permitted.data !== true) throw new Error("Financial administrator permission required");
}

/** Scheduled service calls keep their identity; all manual calls need a validated subject. */
export async function financialCaller(req: Request, admin: SupabaseClient): Promise<string | null> {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (key && (bearer === key || req.headers.get("apikey") === key && !bearer)) return null;
  if (!bearer) throw new Error("Sign in to perform financial administration");
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data.user) throw new Error("Sign in to perform financial administration");
  return data.user.id;
}

export async function assertScopedFinanceJob(req: Request, admin: SupabaseClient, clubId: string | null) {
  const userId = await financialCaller(req, admin);
  if (userId === null) return;
  if (!clubId) throw new Error("Choose a club for financial administration");
  await assertFinanceAdministrator(admin, userId, clubId);
}