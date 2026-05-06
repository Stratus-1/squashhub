// nsa-bulk-provision-clubs
// ---------------------------------------------------------------
// Super-admin only. Given a season (e.g. "s79") and an array of NSA
// club IDs to provision, this function:
//   1. Fetches that season's fixtures from the NSA proxy data (via direct upstream).
//   2. For each requested NSA club_id, finds its display name + first team code.
//   3. Generates a slug (first 3 letters of team code, lowercase) and creates
//      a `clubs` row with tenant_type='nsa_seeded', free_tier_until='2026-09-30',
//      nsa_club_id set, and stores the original NSA name.
//   4. Skips clubs whose slug or nsa_club_id already exists (CSIR / re-runs are safe).
//
// Body: { season: "s79", nsa_club_ids: ["6", "23", "16", ...] }
// Returns: { created: [{ slug, name, club_id, nsa_club_id }], skipped: [...], errors: [...] }
//
// This function does NOT seed members or league teams — that's the
// nsa-seed-club-roster function called separately per club afterwards.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";
const FREE_TIER_UNTIL = "2026-09-30";

type NsaTeam = { id: string; code: string; club: string; club_id: string };
type NsaFixture = {
  id: string;
  category: string;
  league: string;
  team1: NsaTeam;
  team2: NsaTeam;
};

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function slugFromCode(code: string): string {
  // Codes look like "CSIL01", "TUKM03" — first 3 chars are the club prefix.
  return (code || "").slice(0, 3).toLowerCase().replace(/[^a-z]/g, "");
}

function fallbackSlugFromName(name: string): string {
  const stop = new Set(["squash", "club", "the", "and", "of"]);
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w));
  const joined = words.map((w) => w.slice(0, 3)).join("");
  return joined.slice(0, 5) || name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "Method not allowed" });

  // Auth: must be a super-admin (user_roles.role = 'admin')
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResp(401, { error: "Unauthorized" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) return jsonResp(401, { error: "Unauthorized" });

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return jsonResp(403, { error: "Super-admin only" });

  let body: { season?: string; nsa_club_ids?: string[] } = {};
  try { body = await req.json(); } catch { return jsonResp(400, { error: "Invalid JSON" }); }

  const season = (body.season || "s79").trim();
  const wantedIds = new Set((body.nsa_club_ids || []).map((s) => String(s).trim()).filter(Boolean));
  if (wantedIds.size === 0) return jsonResp(400, { error: "nsa_club_ids required" });

  // Fetch fixtures directly from NSA (proxy is an option but service-role context)
  const fxUrl = `${NSA_BASE}/fixtures.php?json&league=${encodeURIComponent(season)}&status=completed`;
  let fixtures: NsaFixture[] = [];
  try {
    const r = await fetch(fxUrl, { headers: { Accept: "application/json", "User-Agent": "SquashHub-Provision/1.0" } });
    if (!r.ok) return jsonResp(502, { error: `NSA HTTP ${r.status}` });
    fixtures = await r.json();
  } catch (e) {
    return jsonResp(502, { error: `NSA fetch failed: ${(e as Error).message}` });
  }

  // Build a map of nsa_club_id -> { name, sample_team_code }
  const clubInfo = new Map<string, { name: string; code: string }>();
  for (const f of fixtures) {
    for (const t of [f.team1, f.team2]) {
      if (!t?.club_id) continue;
      if (!clubInfo.has(t.club_id)) {
        clubInfo.set(t.club_id, { name: t.club, code: t.code });
      }
    }
  }

  const created: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  // Existing clubs by nsa_club_id and by subdomain
  const { data: existingByNsa } = await supabase
    .from("clubs")
    .select("id, nsa_club_id, subdomain, name")
    .not("nsa_club_id", "is", null);
  const seenNsaIds = new Set((existingByNsa || []).map((r: any) => r.nsa_club_id));

  for (const nsaId of wantedIds) {
    const info = clubInfo.get(nsaId);
    if (!info) {
      errors.push({ nsa_club_id: nsaId, error: "Not found in fixtures" });
      continue;
    }
    if (seenNsaIds.has(nsaId)) {
      skipped.push({ nsa_club_id: nsaId, reason: "Already provisioned" });
      continue;
    }

    // Generate slug from team code; fallback to name; ensure uniqueness with numeric suffix
    let baseSlug = slugFromCode(info.code) || fallbackSlugFromName(info.name);
    if (baseSlug.length < 2) baseSlug = "nsa" + nsaId;
    let slug = baseSlug;
    let suffix = 1;
    // Loop until subdomain is free
    while (true) {
      const { data: clash } = await supabase
        .from("clubs")
        .select("id")
        .eq("subdomain", slug)
        .maybeSingle();
      if (!clash) break;
      suffix += 1;
      slug = `${baseSlug}${suffix}`;
      if (suffix > 20) {
        errors.push({ nsa_club_id: nsaId, error: "Could not generate free slug" });
        slug = "";
        break;
      }
    }
    if (!slug) continue;

    const { data: insertedClub, error: insErr } = await supabase
      .from("clubs")
      .insert({
        name: info.name,
        subdomain: slug,
        tenant_type: "nsa_seeded",
        free_tier_until: FREE_TIER_UNTIL,
        nsa_club_id: nsaId,
        honesty_bar_enabled: false,
        face_enrolment_required: false,
      })
      .select("id, name, subdomain, nsa_club_id")
      .single();

    if (insErr) {
      errors.push({ nsa_club_id: nsaId, error: insErr.message });
      continue;
    }

    created.push({
      club_id: insertedClub.id,
      slug: insertedClub.subdomain,
      name: insertedClub.name,
      nsa_club_id: insertedClub.nsa_club_id,
    });
  }

  return jsonResp(200, {
    ok: true,
    season,
    requested: wantedIds.size,
    created_count: created.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    created,
    skipped,
    errors,
  });
});
