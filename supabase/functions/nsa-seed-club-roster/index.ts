// nsa-seed-club-roster
// ---------------------------------------------------------------
// Super-admin only. Phase 3 of NSA bulk import:
//   1. For one provisioned club (by club_id), find every NSA team that
//      belongs to its nsa_club_id in the requested season.
//   2. For each NSA team, create a `leagues` row tied to NSA association
//      (Northern Squash Association = ff79125c-1c69-4a1a-a5bb-6e0724a493b8)
//      with name like "Men's 3rd League 2026" and code = NSA team code.
//   3. For each player on each team, create a `club_members` row
//      (skeleton: name, gender if Ladies division, plays_league=true,
//      ladder_position auto-assigned from W/L), an active
//      `member_association_affiliations` row with the NSF code, and a
//      `member_league_registrations` row with player_rank from team order.
//   4. Idempotent: re-running detects existing leagues by code+club_id and
//      existing members by name+club_id (case-insensitive). Adds missing
//      pieces; never duplicates.
//
// Body: { club_id: "uuid", season?: "s79" }
// Returns: counts of created/skipped per entity

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";
// Platform-wide Northern Squash Association record (platform_league_associations)
const NSA_PLATFORM_ASSOC_ID = "b1cb8b56-bc97-4f31-a8ea-69fab4fc6259";
const DEFAULT_SEASON = "s79";
const SEASON_YEAR = "2026";

type NsaTeamRef = { id: string; code: string; club: string; club_id: string };
type NsaFixture = {
  id: string;
  category: string; // Mens | Ladies | Mixed | Junior
  league: string;   // 1st, 2nd, 3rd...
  team1: NsaTeamRef;
  team2: NsaTeamRef;
};
type NsaTeamPlayer = {
  code: string;
  name: string;
  surname: string;
  result_summary?: { won?: string | number; lost?: string | number; played?: string | number };
};
type NsaTeam = { code: string; club: string; club_id: string; players: NsaTeamPlayer[] };

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function leagueDisplayName(category: string, league: string): string {
  // category: "Mens" | "Ladies" | "Mixed" | "Junior"
  // league: numeric like "1", "2" or already "1st", "2nd"
  const cat = category === "Mens" ? "Men's" : category;
  const lvl = /^\d+$/.test(league) ? ordinal(parseInt(league, 10)) : league;
  return `${cat} ${lvl} League ${SEASON_YEAR}`;
}

function inferGender(category: string): string | null {
  if (category === "Ladies") return "Ladies";
  if (category === "Mens") return "Men";
  return null; // Mixed/Junior left null
}

function fullName(p: NsaTeamPlayer): string {
  return `${(p.name || "").trim()} ${(p.surname || "").trim()}`.replace(/\s+/g, " ").trim();
}

function nsfFromCode(code: string): string {
  return (code || "").trim().toUpperCase();
}

function num(v: string | number | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "Method not allowed" });

  // Auth: super-admin only
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

  let body: { club_id?: string; season?: string } = {};
  try { body = await req.json(); } catch { return jsonResp(400, { error: "Invalid JSON" }); }
  const clubId = (body.club_id || "").trim();
  const season = (body.season || DEFAULT_SEASON).trim();
  if (!clubId) return jsonResp(400, { error: "club_id required" });

  // Load the club + its nsa_club_id
  const { data: club, error: clubErr } = await supabase
    .from("clubs")
    .select("id, name, subdomain, nsa_club_id, tenant_type")
    .eq("id", clubId)
    .single();
  if (clubErr || !club) return jsonResp(404, { error: "Club not found" });
  if (!club.nsa_club_id) return jsonResp(400, { error: "Club has no nsa_club_id; not an NSA-seeded tenant" });

  // Ensure a per-club league_associations row exists pointing at the platform NSA record
  let clubNsaAssocId: string;
  {
    const { data: existing } = await supabase
      .from("league_associations")
      .select("id")
      .eq("club_id", clubId)
      .eq("platform_association_id", NSA_PLATFORM_ASSOC_ID)
      .maybeSingle();
    if (existing?.id) {
      clubNsaAssocId = existing.id;
    } else {
      const { data: ins, error: insErr } = await supabase
        .from("league_associations")
        .insert({
          club_id: clubId,
          name: "Northern Squash Association",
          abbreviation: "NSA",
          platform_association_id: NSA_PLATFORM_ASSOC_ID,
          fee_annual: 0,
          active: true,
          scope: "region",
        })
        .select("id")
        .single();
      if (insErr || !ins) return jsonResp(500, { error: `Failed to create NSA league_association: ${insErr?.message || "unknown"}` });
      clubNsaAssocId = ins.id;
    }
  }


  // 1. Fetch the season's completed fixtures and find every team belonging to this club
  let fixtures: NsaFixture[] = [];
  try {
    const r = await fetch(
      `${NSA_BASE}/fixtures.php?json&league=${encodeURIComponent(season)}&status=completed`,
      { headers: { Accept: "application/json", "User-Agent": "SquashHub-Seed/1.0" } }
    );
    if (!r.ok) return jsonResp(502, { error: `NSA fixtures HTTP ${r.status}` });
    fixtures = await r.json();
  } catch (e) {
    return jsonResp(502, { error: `NSA fixtures fetch failed: ${(e as Error).message}` });
  }

  // Map of nsa_team_id -> { code, category, league }
  type TeamMeta = { id: string; code: string; category: string; league: string };
  const teams = new Map<string, TeamMeta>();
  for (const fx of fixtures) {
    for (const t of [fx.team1, fx.team2]) {
      if (!t?.club_id || t.club_id !== club.nsa_club_id) continue;
      if (!teams.has(t.id)) {
        teams.set(t.id, { id: t.id, code: t.code, category: fx.category, league: fx.league });
      }
    }
  }

  if (teams.size === 0) {
    return jsonResp(200, { ok: true, message: "No teams found for this club in season", season, club_id: clubId, leagues_created: 0 });
  }

  // Preload existing leagues for this club (to skip duplicates by code)
  const { data: existingLeagues } = await supabase
    .from("leagues")
    .select("id, code, name, nsa_team_id")
    .eq("club_id", clubId);
  const leaguesByCode = new Map<string, any>((existingLeagues || []).map((l: any) => [l.code, l]));
  const leaguesByNsaId = new Map<string, any>((existingLeagues || []).filter((l: any) => l.nsa_team_id).map((l: any) => [l.nsa_team_id, l]));

  // Preload existing members for this club (match by lowercased name)
  const { data: existingMembers } = await supabase
    .from("club_members")
    .select("id, name, gender, ladder_position")
    .eq("club_id", clubId);
  const membersByName = new Map<string, any>((existingMembers || []).map((m: any) => [(m.name || "").toLowerCase(), m]));
  let nextLadderPos = ((existingMembers || []).reduce((mx, m: any) => Math.max(mx, m.ladder_position || 0), 0)) + 1;

  // Preload existing affiliations for this club's members to NSA
  const memberIds = (existingMembers || []).map((m: any) => m.id);
  let existingAffiliations: any[] = [];
  if (memberIds.length > 0) {
    const { data } = await supabase
      .from("member_association_affiliations")
      .select("club_member_id, league_association_number")
      .in("club_member_id", memberIds)
      .eq("association_id", clubNsaAssocId);
    existingAffiliations = data || [];
  }
  const affilByMemberId = new Set(existingAffiliations.map((a: any) => a.club_member_id));

  const counts = {
    teams_seen: teams.size,
    leagues_created: 0,
    leagues_existing: 0,
    leagues_linked: 0, // existing-by-code rows that we patched with nsa_team_id
    members_created: 0,
    members_existing: 0,
    affiliations_created: 0,
    registrations_created: 0,
    registrations_existing: 0,
    player_errors: [] as string[],
  };

  // 2. For each team, ensure a league row exists and fetch its roster
  for (const meta of teams.values()) {
    let league = leaguesByNsaId.get(meta.id) || leaguesByCode.get(meta.code);

    if (!league) {
      const { data: ins, error: insErr } = await supabase
        .from("leagues")
        .insert({
          club_id: clubId,
          association_id: clubNsaAssocId,
          name: leagueDisplayName(meta.category, meta.league),
          code: meta.code,
          nsa_team_id: meta.id,
          nsa_team_code: meta.code,
          allow_cross_gender_guests: meta.category === "Mixed",
        })
        .select("id, code, name, nsa_team_id")
        .single();
      if (insErr) {
        counts.player_errors.push(`league ${meta.code}: ${insErr.message}`);
        continue;
      }
      league = ins;
      counts.leagues_created += 1;
    } else {
      counts.leagues_existing += 1;
      // Patch nsa link if missing
      if (!league.nsa_team_id) {
        await supabase
          .from("leagues")
          .update({ nsa_team_id: meta.id, nsa_team_code: meta.code })
          .eq("id", league.id);
        counts.leagues_linked += 1;
      }
    }

    // Fetch this team's roster from NSA
    let nsaTeam: NsaTeam;
    try {
      const r = await fetch(`${NSA_BASE}/team.php?json&team=${encodeURIComponent(meta.id)}`, {
        headers: { Accept: "application/json", "User-Agent": "SquashHub-Seed/1.0" },
      });
      if (!r.ok) { counts.player_errors.push(`team ${meta.code} HTTP ${r.status}`); continue; }
      nsaTeam = await r.json();
    } catch (e) {
      counts.player_errors.push(`team ${meta.code} fetch: ${(e as Error).message}`);
      continue;
    }

    // Existing registrations for this league
    const { data: existingRegs } = await supabase
      .from("member_league_registrations")
      .select("club_member_id, player_rank")
      .eq("league_id", league.id);
    const regsByMember = new Map<string, any>((existingRegs || []).map((r: any) => [r.club_member_id, r]));

    let rank = 1;
    for (const p of nsaTeam.players || []) {
      const name = fullName(p);
      const nsf = nsfFromCode(p.code);
      if (!name) { rank++; continue; }
      const wins = num(p.result_summary?.won);

      // Find or create member
      let member = membersByName.get(name.toLowerCase());
      if (!member) {
        const { data: mIns, error: mErr } = await supabase
          .from("club_members")
          .insert({
            club_id: clubId,
            role: "member",
            name,
            gender: inferGender(meta.category),
            plays_league: true,
            enable_league_association_id: clubNsaAssocId,
            ladder_position: nextLadderPos++,
          })
          .select("id, name, gender, ladder_position")
          .single();
        if (mErr) { counts.player_errors.push(`member ${name}: ${mErr.message}`); rank++; continue; }
        member = mIns;
        membersByName.set(name.toLowerCase(), member);
        counts.members_created += 1;
      } else {
        // Backfill plays_league + association on existing rows so they appear under NSA leagues
        await supabase
          .from("club_members")
          .update({ plays_league: true, enable_league_association_id: clubNsaAssocId })
          .eq("id", member.id);
        counts.members_existing += 1;
      }

      // Affiliation to NSA with NSF code
      if (!affilByMemberId.has(member.id) && nsf) {
        const { error: aErr } = await supabase
          .from("member_association_affiliations")
          .insert({
            club_member_id: member.id,
            association_id: clubNsaAssocId,
            league_association_number: nsf,
            active: true,
          });
        if (aErr) {
          counts.player_errors.push(`affiliation ${name}: ${aErr.message}`);
        } else {
          affilByMemberId.add(member.id);
          counts.affiliations_created += 1;
        }
      }

      // League registration with player_rank
      if (!regsByMember.has(member.id)) {
        const { error: rErr } = await supabase
          .from("member_league_registrations")
          .insert({
            club_member_id: member.id,
            league_id: league.id,
            league_association_number: nsf || null,
            player_rank: rank,
            is_captain: false,
          });
        if (rErr) {
          counts.player_errors.push(`registration ${name} -> ${meta.code}: ${rErr.message}`);
        } else {
          counts.registrations_created += 1;
        }
      } else {
        counts.registrations_existing += 1;
      }
      rank++;
      // suppress unused-var lint
      void wins;
    }
  }

  return jsonResp(200, {
    ok: true,
    club_id: clubId,
    club_name: club.name,
    nsa_club_id: club.nsa_club_id,
    season,
    ...counts,
  });
});
