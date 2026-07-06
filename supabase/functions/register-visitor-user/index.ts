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
  const emailIn = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const phone = body.phone ? String(body.phone).trim() : null;
  const homeClubName = String(body.home_club_name || "").trim();
  const memberNumber = body.member_number ? String(body.member_number).trim() : null;
  const category = String(body.category || "Men").trim();

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  // Google-mode: caller is already authenticated (e.g. via Google OAuth) and
  // only needs a visitor club_members row created for their existing account.
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  let authedUser: { id: string; email?: string | null } | null = null;
  if (bearer) {
    const { data: userData } = await admin.auth.getUser(bearer);
    if (userData?.user) authedUser = { id: userData.user.id, email: userData.user.email };
  }
  const googleMode = !!authedUser;
  const email = (emailIn || authedUser?.email || "").toLowerCase();

  if (!clubId) return json({ error: "Club is required" }, 400);
  if (firstName.length < 2) return json({ error: "First name is required" }, 400);
  if (lastName.length < 2) return json({ error: "Last name is required" }, 400);
  if (!email || !email.includes("@")) return json({ error: "Valid email is required" }, 400);
  if (!googleMode && password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
  if (homeClubName.length < 2) return json({ error: "Home club is required" }, 400);

  const fullName = `${firstName} ${lastName}`.trim();
  const gender = category.toLowerCase() === "ladies" ? "Ladies" : "Men";

  let userId: string;
  let reusedExistingAccount = false;

  if (googleMode) {
    userId = authedUser!.id;
    reusedExistingAccount = true;
  } else {
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

    if (createErr || !created?.user) {
      const msg = createErr?.message || "Failed to create user";
      const isDuplicate =
        msg.toLowerCase().includes("already") ||
        (createErr as any)?.code === "email_exists";

      if (!isDuplicate) return json({ error: msg }, 400);

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
  }

  // 2. Upsert profile
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: userId,
    email,
    name: fullName,
    phone: phone || null,
  }, { onConflict: "id" });
  if (profileErr) {
    console.error("[register-visitor-user] profile upsert failed:", profileErr);
    if (!reusedExistingAccount) {
      try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* ignore */ }
    }
    return json({ error: "Failed to create profile: " + profileErr.message }, 500);
  }

  // 3. Insert club_members row as visitor (if not already present for this club+user)
  const { data: existingMember, error: existingErr } = await admin
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingErr) console.error("[register-visitor-user] existing member lookup error:", existingErr);

  let clubMemberId = existingMember?.id as string | undefined;

  if (!clubMemberId) {
    const insertPayload: Record<string, any> = {
      club_id: clubId,
      user_id: userId,
      role: "visitor",
      name: fullName,
      email,
      phone: phone || null,
      gender,
      home_club_name: homeClubName,
      club_member_number: memberNumber || null,
    };
    console.log("[register-visitor-user] inserting club_members:", { clubId, userId, email, gender });
    const { data: inserted, error: memberErr } = await admin
      .from("club_members")
      .insert(insertPayload)
      .select("id")
      .single();

    if (memberErr) {
      console.error("[register-visitor-user] club_members insert failed:", memberErr);
      if (!reusedExistingAccount) {
        try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* ignore */ }
      }
      return json({
        error: "Failed to create visitor membership: " + memberErr.message,
        details: memberErr,
      }, 500);
    }
    clubMemberId = inserted!.id;
  }

  // NOTE: We deliberately do NOT insert into the legacy `club_visitors` table
  // here. The `club_members` row above (role='visitor') is the authoritative
  // record for self-registered visitors, and writing to both tables caused the
  // same person to appear twice in the club admin Visitors tab (once as a plain
  // visitor entry, once as a "Member record"). Legacy `club_visitors` rows are
  // still used by the tournament wizard's ad-hoc visitor entries.


  return json({
    ok: true,
    user_id: userId,
    club_member_id: clubMemberId,
    email,
  });
});
