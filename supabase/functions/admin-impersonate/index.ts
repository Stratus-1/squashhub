// admin-impersonate
// Mints a real, short-lived login session for a target club member so an
// authorised admin can sign in AS that member (not a client-side "view as").
//
// Authorisation: caller must be a platform super admin, or a club admin of the
// target member's club. Impersonating a platform super admin is never allowed.
// Every attempt is written to public.impersonation_log.

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
    if (!authHeader.replace("Bearer ", "")) return json({ error: "Not signed in." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userRes } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (!caller) return json({ error: "Not signed in." }, 401);

    const { club_member_id } = await req.json().catch(() => ({}));
    if (!club_member_id) return json({ error: "club_member_id required" }, 400);

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id, email, name, role")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member) return json({ error: "Member not found." }, 404);

    // --- authorisation -----------------------------------------------------
    const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: caller.id });
    let allowed = !!isPlatformAdmin;
    if (!allowed) {
      const { data: isClubAdmin } = await admin.rpc("is_club_admin", {
        _user_id: caller.id,
        _club_id: member.club_id,
      });
      allowed = !!isClubAdmin;
    }
    if (!allowed) {
      return json({ error: "You are not an admin of this club, so you cannot sign in as this member." }, 403);
    }

    if (member.user_id === caller.id) {
      return json({ error: "That is your own account." }, 400);
    }

    // Never allow impersonating a platform super admin.
    if (member.user_id) {
      const { data: targetIsPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: member.user_id });
      if (targetIsPlatformAdmin) {
        return json({ error: "This member is a platform administrator and cannot be impersonated." }, 403);
      }
    }

    if (!member.email) {
      return json(
        { error: "This member has no email address on file, so they have no login to sign in as." },
        400,
      );
    }
    if (!member.user_id) {
      return json(
        { error: "This member has not activated a login yet. Send them an activation link first." },
        400,
      );
    }

    // --- mint the session --------------------------------------------------
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: member.email,
    });
    if (linkErr) return json({ error: linkErr.message }, 400);

    const props = (linkData as any)?.properties;
    const tokenHash = props?.hashed_token;
    if (!tokenHash) return json({ error: "Could not create a session for this member." }, 500);

    await admin.from("impersonation_log").insert({
      admin_user_id: caller.id,
      target_user_id: member.user_id,
      target_club_member_id: member.id,
      club_id: member.club_id,
    });

    return json({
      token_hash: tokenHash,
      email: member.email,
      member_name: member.name,
      member_id: member.id,
      club_id: member.club_id,
    });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
