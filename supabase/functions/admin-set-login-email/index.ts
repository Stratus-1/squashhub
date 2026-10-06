// admin-set-login-email
// Club admin changes a member's LOGIN email. If the member currently shares a
// login with other people (e.g. a parent's account), they are given their own
// login with the new email instead, leaving the other people's login untouched.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) return json({ error: "unauthorised" }, 401);
    const { data: u } = await admin.auth.getUser(jwt);
    const caller = u?.user;
    if (!caller) return json({ error: "unauthorised" }, 401);

    const body = await req.json().catch(() => ({}));
    const memberId = String(body.club_member_id || "");
    const email = String(body.new_email || "").trim().toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) return json({ error: "club_member_id required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return json({ error: "Invalid email address" }, 400);

    const { data: member } = await admin
      .from("club_members").select("id, club_id, user_id, person_id, name").eq("id", memberId).maybeSingle();
    if (!member) return json({ error: "member not found" }, 404);

    const { data: isAdmin } = await admin.rpc("is_club_admin", { _user_id: caller.id, _club_id: member.club_id });
    const { data: platform } = await admin.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!isAdmin && !platform) return json({ error: "Only club admins can change login emails" }, 403);

    // This person's rows on the current login (all clubs) vs other people on it.
    let ownRows: string[] = [member.id];
    let othersOnLogin = 0;
    if (member.user_id) {
      const { data: rows } = await admin.from("club_members").select("id, person_id").eq("user_id", member.user_id);
      const same = (r: any) => r.id === member.id || (member.person_id && r.person_id === member.person_id);
      ownRows = (rows || []).filter(same).map((r: any) => r.id);
      othersOnLogin = (rows || []).filter((r: any) => !same(r)).length;
    }

    // Is the email already a login?
    const { data: prof } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
    const existingId: string | null = (prof as any)?.id ?? null;

    if (existingId && existingId === member.user_id) {
      await admin.from("club_members").update({ email }).in("id", ownRows);
      return json({ ok: true, mode: "unchanged" });
    }

    if (existingId) {
      const { data: theirs } = await admin.from("club_members").select("id, person_id").eq("user_id", existingId);
      const foreign = (theirs || []).some((r: any) => !member.person_id || r.person_id !== member.person_id);
      if (foreign) return json({ error: "That email is already the login of another member. Change theirs first." }, 409);
      await admin.from("club_members").update({ user_id: existingId, email }).in("id", ownRows);
      return json({ ok: true, mode: "linked_existing" });
    }

    if (member.user_id && othersOnLogin === 0) {
      const { error } = await admin.auth.admin.updateUserById(member.user_id, { email, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      await admin.from("profiles").update({ email }).eq("id", member.user_id);
      await admin.from("club_members").update({ email }).in("id", ownRows);
      return json({ ok: true, mode: "updated" });
    }

    // Shared login (or none): give this person their own login.
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { name: member.name },
    });
    if (cErr || !created?.user) return json({ error: cErr?.message || "Could not create login" }, 400);
    await admin.from("club_members").update({ user_id: created.user.id, email }).in("id", ownRows);
    return json({ ok: true, mode: "separated" });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});
