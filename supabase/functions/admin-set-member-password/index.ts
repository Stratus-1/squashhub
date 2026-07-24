// admin-set-member-password
// Admin-only. Sets a specific password for a club_member's auth account.
// Used when a user is locked out and the admin wants to give them a
// temporary password (e.g. their phone number) over WhatsApp.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "unauthorised" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "unauthorised" }, 401);

    const { club_member_id, password } = await req.json();
    if (!club_member_id) return json({ error: "club_member_id required" }, 400);
    if (!password || String(password).length < 6) {
      return json({ error: "password must be at least 6 characters" }, 400);
    }

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id, email, name")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member) return json({ error: "member not found" }, 404);

    const { data: isAdmin } = await admin.rpc("is_club_admin", {
      _user_id: caller.id,
      _club_id: member.club_id,
    });
    const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", {
      _user_id: caller.id,
    });
    if (!isAdmin && !isPlatformAdmin) return json({ error: "forbidden" }, 403);

    if (!member.email) return json({ error: "member has no email on file" }, 400);

    // Resolve auth user id
    let userId = member.user_id;
    if (!userId) {
      const { data: list } = await admin.auth.admin.listUsers();
      userId =
        list?.users?.find((u) => u.email?.toLowerCase() === member.email!.toLowerCase())?.id ||
        null;
      if (userId) {
        await admin.from("club_members").update({ user_id: userId }).eq("id", member.id);
      }
    }
    if (!userId) return json({ error: "no auth account exists for this member" }, 404);

    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: String(password),
      email_confirm: true,
    });
    if (updErr) return json({ error: updErr.message }, 400);

    return json({ ok: true, email: member.email });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
