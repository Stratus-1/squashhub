// league-player-signup
// ----------------------------------------------------------------
// Public endpoint that lets a seeded NSA league player claim their
// existing club_member shell row by entering their NSA number,
// email, and password.
//
// Flow:
//   1. Strict NSA-number lookup (must match an UNCLAIMED seeded shell).
//   2. Create auth user (email-verification on).
//   3. Link club_members.user_id to the new auth uid.
//   4. Create profile row with name from roster.
//   5. If captain claimed → also accept NSA admin creds, encrypt &
//      store in member_nsa_credentials. Try to verify against NSA.
//      On verification failure: still sign them up as a player and
//      flag pending_captain_claim=true (soft fall-back).
//
// Body: {
//   nsa_number: string,
//   email: string,
//   password: string,
//   phone?: string,
//   accept_terms: boolean,
//   captain?: { nsa_username: string, nsa_password: string }
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- AES-GCM helpers (mirror nsa-submit-result, key = NSA_CRED_KEY base64 32 bytes) ----------
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("NSA_CRED_KEY");
  if (!raw) throw new Error("NSA_CRED_KEY not configured");
  const keyBytes = b64ToBytes(raw);
  if (keyBytes.length !== 32) throw new Error("NSA_CRED_KEY must be 32 bytes (base64)");
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptPassword(plain: string) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  return { ciphertext: bytesToB64(cipher), iv: bytesToB64(iv) };
}

// ---------- NSA login probe (mirrors nsa-submit-result) ----------
function parseNsfSessionCookie(headers: Headers): string | null {
  // deno-lint-ignore no-explicit-any
  const anyH = headers as any;
  let cookies: string[] = [];
  if (typeof anyH.getSetCookie === "function") cookies = anyH.getSetCookie();
  else {
    const raw = headers.get("set-cookie");
    if (raw) cookies = [raw];
  }
  for (const c of cookies) {
    const m = c.match(/NSFSESSION=([^;]+)/);
    if (m) return `NSFSESSION=${m[1]}`;
  }
  return null;
}

async function nsaLoginProbe(username: string, password: string): Promise<boolean> {
  try {
    // NSA login expects field names `uname` / `passwd` (NOT username/password)
    const body = new URLSearchParams({ uname: username, passwd: password }).toString();
    const res = await fetch(`${NSA_BASE}/login.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "manual",
    });
    const cookie = parseNsfSessionCookie(res.headers);
    if (!cookie) {
      console.log("[nsaLoginProbe] no NSFSESSION cookie returned");
      return false;
    }
    const check = await fetch(`${NSA_BASE}/index.php`, { headers: { cookie } });
    const html = await check.text();
    const ok = /now logged in|Log Out|logout/i.test(html);
    if (!ok) console.log("[nsaLoginProbe] cookie obtained but page doesn't show logged-in markers");
    // Best-effort logout to free the session
    try { await fetch(`${NSA_BASE}/logout.php`, { headers: { cookie } }); } catch (_) { /* ignore */ }
    return ok;
  } catch (e) {
    console.log("[nsaLoginProbe] error:", (e as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const nsaNumber = String(body.nsa_number || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const phone = body.phone ? String(body.phone).trim() : null;
  const acceptTerms = !!body.accept_terms;
  const captainCreds = body.captain && body.captain.nsa_username && body.captain.nsa_password
    ? { username: String(body.captain.nsa_username).trim().toUpperCase(), password: String(body.captain.nsa_password) }
    : null;

  if (!nsaNumber) return json({ error: "NSA number is required" }, 400);
  if (!email || !email.includes("@")) return json({ error: "Valid email is required" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
  if (!acceptTerms) return json({ error: "Please accept the Terms & Privacy Policy" }, 400);

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  // ---------- 1. Strict NSA lookup ----------
  const { data: lookup, error: lookupErr } = await admin
    .from("member_association_affiliations")
    .select("club_member_id, club_members!inner(id, user_id, club_id, name, gender, is_league_only_membership)")
    .eq("league_association_number", nsaNumber)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (lookupErr) return json({ error: lookupErr.message }, 500);
  if (!lookup) return json({ error: "No league player found with that NSA number. Check the number or pick your club manually." }, 404);

  const member = lookup.club_members as any;
  if (member.user_id) {
    return json({
      error: "This NSA number is already registered. Please sign in instead.",
      already_claimed: true,
    }, 409);
  }

  // ---------- 2. Resolve club subdomain (needed for branded auth emails) ----------
  const { data: clubRow } = await admin
    .from("clubs")
    .select("subdomain, name")
    .eq("id", member.club_id)
    .maybeSingle();

  // ---------- 3. Create auth user ----------
  const fullName = member.name || email.split("@")[0];
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // require email verification
    user_metadata: {
      name: fullName,
      phone: phone || undefined,
      club_subdomain: clubRow?.subdomain || null,
      club_name: clubRow?.name || null,
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
    },
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message || "Failed to create user";
    if (msg.toLowerCase().includes("already")) {
      return json({ error: "An account with this email already exists. Please sign in." }, 409);
    }
    return json({ error: msg }, 400);
  }

  const userId = created.user.id;

  // ---------- 3. Upsert profile ----------
  await admin.from("profiles").upsert({
    id: userId,
    email,
    name: fullName,
    phone: phone || null,
  }, { onConflict: "id" });

  // ---------- 4. Link club_member ----------
  const memberUpdate: Record<string, any> = {
    user_id: userId,
    email,
    updated_at: new Date().toISOString(),
  };
  if (phone) memberUpdate.phone = phone;

  const { error: linkErr } = await admin
    .from("club_members")
    .update(memberUpdate)
    .eq("id", member.id);

  if (linkErr) {
    // Rollback auth user if member link fails
    await admin.auth.admin.deleteUser(userId);
    return json({ error: "Failed to link membership: " + linkErr.message }, 500);
  }

  // ---------- 5. Captain credential handling (soft fall-back) ----------
  let captainStatus: "verified" | "pending" | "none" = "none";
  if (captainCreds) {
    const verified = await nsaLoginProbe(captainCreds.username, captainCreds.password);
    try {
      const { ciphertext, iv } = await encryptPassword(captainCreds.password);
      await admin.from("member_nsa_credentials").upsert({
        club_member_id: member.id,
        user_id: userId,
        nsa_username: captainCreds.username,
        nsa_password_ciphertext: ciphertext,
        nsa_password_iv: iv,
        last_verified_at: verified ? new Date().toISOString() : null,
        last_verification_status: verified ? "ok" : "failed",
      }, { onConflict: "club_member_id" });
    } catch (e) {
      console.error("Captain cred encryption failed:", (e as Error).message);
    }

    if (verified) {
      // Promote to team captain role (league-scoped, NOT full club admin)
      await admin.from("club_members")
        .update({ role: "captain", pending_captain_claim: false })
        .eq("id", member.id);

      // Flag is_captain on every league registration this member already has,
      // and set leagues.captain_member_id where it's empty so the league shows them as captain.
      const { data: regs } = await admin
        .from("member_league_registrations")
        .select("id, league_id")
        .eq("club_member_id", member.id);

      const leagueIds = (regs || []).map((r: any) => r.league_id);
      if (regs && regs.length > 0) {
        await admin
          .from("member_league_registrations")
          .update({ is_captain: true })
          .in("id", regs.map((r: any) => r.id));
      }
      if (leagueIds.length > 0) {
        // Only fill captain_member_id where it's currently null (don't override an existing captain)
        await admin
          .from("leagues")
          .update({ captain_member_id: member.id })
          .in("id", leagueIds)
          .is("captain_member_id", null);
      }

      captainStatus = "verified";
    } else {
      // Soft fall-back: stays as player, flag pending claim
      await admin.from("club_members")
        .update({ pending_captain_claim: true })
        .eq("id", member.id);
      captainStatus = "pending";
    }
  }

  // ---------- 6. Return response (clubRow already fetched above) ----------
  return json({
    ok: true,
    user_id: userId,
    club_member_id: member.id,
    club_subdomain: clubRow?.subdomain || null,
    club_name: clubRow?.name || null,
    captain_status: captainStatus,
    email_verification_required: true,
  });
});
