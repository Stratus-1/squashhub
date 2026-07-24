// generate-member-magic-link
// Admin-only. Returns a fresh magic-link (or recovery link) for a specific
// club_member so tournament organisers can WhatsApp visitors a one-tap
// activation URL that opens the app and prompts them to set a password.

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
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "unauthorised" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "unauthorised" }, 401);

    const { club_member_id } = await req.json();
    if (!club_member_id) return json({ error: "club_member_id required" }, 400);

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id, email, name")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member) return json({ error: "member not found" }, 404);

    // Admin check
    const { data: isAdmin } = await admin.rpc("is_club_admin", {
      _user_id: caller.id,
      _club_id: member.club_id,
    });
    const { data: hasPerm } = await admin.rpc("is_club_admin_or_permitted", {
      _user_id: caller.id,
      _club_id: member.club_id,
      _permission: "manage_tournaments",
    });
    if (!isAdmin && !hasPerm) return json({ error: "forbidden" }, 403);

    if (!member.email) return json({ error: "member has no email on file" }, 400);

    const { data: club } = await admin
      .from("clubs")
      .select("subdomain")
      .eq("id", member.club_id)
      .maybeSingle();
    const subdomain = (club as any)?.subdomain || null;
    const redirectTo = subdomain
      ? `https://www.squashhub.co.za/auth/callback?tenant=${encodeURIComponent(subdomain)}`
      : `https://www.squashhub.co.za/auth/callback`;

    // If no auth account yet, create one (email pre-confirmed, no password)
    let userId = member.user_id;
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: member.email,
        email_confirm: true,
      });
      if (createErr && !/already registered/i.test(createErr.message)) {
        return json({ error: createErr.message }, 400);
      }
      userId = created?.user?.id || null;
      if (!userId) {
        // Look up existing auth user by email
        const { data: list } = await admin.auth.admin.listUsers();
        userId = list?.users?.find((u) => u.email?.toLowerCase() === member.email!.toLowerCase())?.id || null;
      }
      if (userId) {
        await admin.from("club_members").update({ user_id: userId }).eq("id", member.id);
      }
    }

    // Generate an invite/magic link — magiclink works whether or not a password is set
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: member.email,
      options: { redirectTo },
    });
    if (linkErr) return json({ error: linkErr.message }, 400);
    const action_link = (linkData as any)?.properties?.action_link;
    if (!action_link) return json({ error: "no link returned" }, 500);

    return json({ magic_link: action_link });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
