// register-visitor-user
// ------------------------------------------------------------
// Public endpoint that lets a visitor create an actual account
// on a club subdomain so they can be selected into tournaments
// and league matches. Creates:
//   1. auth user (email pre-confirmed, no email verification)
//   2. profile row
//   3. club_members row with role='visitor'
//   4. club_visitors row (for backward-compat visitor lists)
//
// Body: {
//   club_id: string,
//   first_name, last_name, email, password,
//   phone?, home_club_name, member_number?, category ('Men'|'Ladies')
// }

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
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const clubId = String(body.club_id || "").trim();
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const phone = body.phone ? String(body.phone).trim() : null;
  const homeClubName = String(body.home_club_name || "").trim();
  const memberNumber = body.member_number ? String(body.member_number).trim() : null;
  const category = String(body.category || "Men").trim();

  if (!clubId) return json({ error: "Club is required" }, 400);
  if (firstName.length < 2) return json({ error: "First name is required" }, 400);
  if (lastName.length < 2) return json({ error: "Last name is required" }, 400);
  if (!email || !email.includes("@")) return json({ error: "Valid email is required" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
  if (homeClubName.length < 2) return json({ error: "Home club is required" }, 400);

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  const fullName = `${firstName} ${lastName}`.trim();
  const gender = category.toLowerCase() === "ladies" ? "Ladies" : "Men";

  // 1. Create auth user (email pre-confirmed).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: fullName,
      phone: phone || undefined,
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
    },
  });

  let userId: string;
  let reusedExistingAccount = false;

  if (createErr || !created?.user) {
    const msg = createErr?.message || "Failed to create user";
    const isDuplicate =
      msg.toLowerCase().includes("already") ||
      (createErr as any)?.code === "email_exists";

    if (!isDuplicate) return json({ error: msg }, 400);

    // Email in use — verify supplied password so we don't hijack a stranger's account
    const anonClient = createClient(supaUrl, anonKey, { auth: { persistSession: false } });
    const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn?.user) {
      return json({
        error:
          "An account with this email already exists. Sign in with your existing password, or reset it.",
      }, 409);
    }
    userId = signIn.user.id;
    reusedExistingAccount = true;
  } else {
    userId = created.user.id;
  }

  // 2. Upsert profile
  await admin.from("profiles").upsert({
    id: userId,
    email,
    name: fullName,
    phone: phone || null,
  }, { onConflict: "id" });

  // 3. Insert club_members row as visitor (if not already present for this club+user)
  const { data: existingMember } = await admin
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();

  let clubMemberId = existingMember?.id as string | undefined;

  if (!clubMemberId) {
    const { data: inserted, error: memberErr } = await admin
      .from("club_members")
      .insert({
        club_id: clubId,
        user_id: userId,
        role: "visitor",
        name: fullName,
        email,
        phone: phone || null,
        gender,
        home_club_name: homeClubName,
        club_member_number: memberNumber || null,
      })
      .select("id")
      .single();

    if (memberErr) {
      if (!reusedExistingAccount) {
        try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* ignore */ }
      }
      return json({ error: "Failed to create visitor membership: " + memberErr.message }, 500);
    }
    clubMemberId = inserted!.id;
  }

  // 4. Legacy club_visitors row (best-effort; ignore duplicates/errors)
  try {
    await admin.from("club_visitors").insert({
      club_id: clubId,
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      email,
      home_club_name: homeClubName,
      member_number: memberNumber || null,
      category,
    });
  } catch (_) { /* ignore */ }

  return json({
    ok: true,
    user_id: userId,
    club_member_id: clubMemberId,
    email,
  });
});
