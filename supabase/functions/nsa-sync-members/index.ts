// nsa-sync-members
// ---------------------------------------------------------------
// Super-admin only. Pulls the full player roster for a given
// association from the NSA admin site and upserts into
// platform_league_members keyed by (association_id, user_code).
//
// Strategy:
//   1. Fetch the season fixtures (status=completed) to discover every
//      unique team (id, code, club name) that played in the season.
//   2. For each unique team id, fetch team.php?json&team=<id> to get the
//      player roster (code, name, surname, played counts).
//   3. Upsert each player into platform_league_members. user_code is the
//      stable NSA member code.
//
// Body: { association_id: string, season?: string }
//   - season defaults to the association's external_season ("s79" if unset)
//
// Returns: { ok, fetched_teams, fetched_players, inserted, updated, unchanged, errors, summary }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";

type NsaTeamRef = { id: string; code: string; club: string; club_id: string };
type NsaFixture = { id: string; team1: NsaTeamRef; team2: NsaTeamRef; status: string };
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

const toInt = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "Method not allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResp(401, { error: "Unauthorized" });

  const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isServiceRole) {
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData?.user) {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) return jsonResp(403, { error: "Super-admin only" });
    }
  }

  let body: { association_id?: string; season?: string } = {};
  try { body = await req.json(); } catch { return jsonResp(400, { error: "Invalid JSON" }); }

  const associationId = body.association_id?.trim();
  if (!associationId) return jsonResp(400, { error: "association_id required" });

  const { data: assoc, error: assocErr } = await supabase
    .from("platform_league_associations")
    .select("id, name, external_source, external_season")
    .eq("id", associationId)
    .maybeSingle();
  if (assocErr || !assoc) return jsonResp(404, { error: "Association not found" });
  if (assoc.external_source !== "nsa") {
    return jsonResp(400, { error: `Association is not linked to NSA (external_source=${assoc.external_source ?? "null"})` });
  }

  const season = (body.season || assoc.external_season || "s79").trim();

  // 1. Discover unique teams from fixtures
  let fixtures: NsaFixture[] = [];
  try {
    const r = await fetch(
      `${NSA_BASE}/fixtures.php?json&league=${encodeURIComponent(season)}&status=completed`,
      { headers: { Accept: "application/json", "User-Agent": "SquashHub-Sync/1.0" } }
    );
    if (!r.ok) return jsonResp(502, { error: `NSA fixtures HTTP ${r.status}` });
    fixtures = await r.json();
  } catch (e) {
    return jsonResp(502, { error: `NSA fixtures fetch failed: ${(e as Error).message}` });
  }

  const teamMap = new Map<string, NsaTeamRef>();
  for (const f of fixtures) {
    if (f?.team1?.id) teamMap.set(String(f.team1.id), f.team1);
    if (f?.team2?.id) teamMap.set(String(f.team2.id), f.team2);
  }

  const errors: any[] = [];

  // 2. Fetch each team's players (limited concurrency)
  const teamIds = [...teamMap.keys()];
  const teamRosters = new Map<string, { teamRef: NsaTeamRef; players: NsaTeamPlayer[] }>();
  const CONCURRENCY = 6;
  for (let i = 0; i < teamIds.length; i += CONCURRENCY) {
    const slice = teamIds.slice(i, i + CONCURRENCY);
    await Promise.all(slice.map(async (tid) => {
      const ref = teamMap.get(tid)!;
      try {
        const r = await fetch(`${NSA_BASE}/team.php?json&team=${encodeURIComponent(tid)}`, {
          headers: { Accept: "application/json", "User-Agent": "SquashHub-Sync/1.0" },
        });
        if (!r.ok) { errors.push({ team: ref.code, error: `HTTP ${r.status}` }); return; }
        const team: NsaTeam = await r.json();
        teamRosters.set(tid, { teamRef: ref, players: team?.players ?? [] });
      } catch (e) {
        errors.push({ team: ref.code, error: (e as Error).message });
      }
    }));
  }

  // 3. Build a deduped set of player rows. Track NSA team id per player too
  // (transient; not persisted on platform_league_members) so we can allocate
  // matched club_members into local league teams.
  type Row = {
    association_id: string;
    user_code: string;
    surname: string;
    first_name: string;
    affiliation: string;
    club_name: string;
    user_state: string;
    league_matches: number;
  };
  const rowsByCode = new Map<string, Row>();
  const teamIdByCode = new Map<string, string>(); // user_code -> NSA team id (best/most-played)
  const nsaClubIdByCode = new Map<string, string>(); // user_code -> NSA club id
  let fetchedPlayers = 0;
  for (const [tid, { teamRef, players }] of teamRosters.entries()) {
    for (const p of players) {
      const code = String(p.code || "").trim().toUpperCase();
      if (!code) continue;
      fetchedPlayers += 1;
      const played = toInt(p.result_summary?.played);
      const existing = rowsByCode.get(code);
      const candidate: Row = {
        association_id: associationId,
        user_code: code,
        surname: (p.surname || "").trim(),
        first_name: (p.name || "").trim(),
        affiliation: teamRef.code || "",
        club_name: teamRef.club || "",
        user_state: "ACTIVE",
        league_matches: played,
      };
      if (!existing || candidate.league_matches > existing.league_matches) {
        rowsByCode.set(code, candidate);
        teamIdByCode.set(code, tid);
        if (teamRef.club_id) nsaClubIdByCode.set(code, String(teamRef.club_id));
      }
    }
  }

  // 4. Pre-load existing rows to count inserts vs updates
  const { data: existingRows } = await supabase
    .from("platform_league_members")
    .select("user_code, surname, first_name, affiliation, club_name, user_state, league_matches")
    .eq("association_id", associationId)
    .range(0, 49999);
  const existingByCode = new Map<string, any>();
  for (const r of existingRows ?? []) existingByCode.set(String(r.user_code).toUpperCase(), r);

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of rowsByCode.values()) {
    const prev = existingByCode.get(row.user_code);
    if (!prev) { inserted += 1; continue; }
    const changed =
      (prev.surname || "") !== row.surname ||
      (prev.first_name || "") !== row.first_name ||
      (prev.affiliation || "") !== row.affiliation ||
      (prev.club_name || "") !== row.club_name ||
      (prev.user_state || "") !== row.user_state ||
      toInt(prev.league_matches) !== row.league_matches;
    if (changed) updated += 1; else unchanged += 1;
  }

  // 5. Chunked upsert
  const allRows = [...rowsByCode.values()];
  const CHUNK = 500;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const chunk = allRows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("platform_league_members")
      .upsert(chunk, { onConflict: "association_id,user_code" });
    if (error) errors.push({ chunk_start: i, error: error.message });
  }

  // 6. Mark previously-synced platform members not in this roster as INACTIVE.
  const rosterCodes = new Set(rowsByCode.keys());
  const staleCodes = [...existingByCode.keys()].filter(
    (c) => !rosterCodes.has(c) && (existingByCode.get(c)?.user_state || "ACTIVE") !== "INACTIVE",
  );
  let platformDeactivated = 0;
  if (staleCodes.length > 0) {
    for (let i = 0; i < staleCodes.length; i += CHUNK) {
      const chunk = staleCodes.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("platform_league_members")
        .update({ user_state: "INACTIVE", updated_at: new Date().toISOString() }, { count: "exact" })
        .eq("association_id", associationId)
        .in("user_code", chunk);
      if (error) errors.push({ stage: "platform_inactive", error: error.message });
      else platformDeactivated += count ?? chunk.length;
    }
  }

  // 7. Find local club affiliations linked to this NSA association and
  // diff them against the synced roster: activate matches, deactivate misses.
  // Also auto-allocate matched club_members into local league teams.
  const { data: linkedAssocs } = await supabase
    .from("league_associations")
    .select("id, club_id, external_club_id")
    .eq("platform_association_id", associationId);

  const localAssocIds = (linkedAssocs ?? []).map((r: any) => r.id);
  const clubIdByLocalAssoc = new Map<string, string>();
  const clubIdByNsaClubId = new Map<string, string>();
  for (const r of linkedAssocs ?? []) {
    clubIdByLocalAssoc.set(r.id, r.club_id);
    if (r.external_club_id) clubIdByNsaClubId.set(String(r.external_club_id), r.club_id);
  }

  let affActivated = 0;
  let affDeactivated = 0;
  let allocated = 0;
  let alreadyAllocated = 0;
  let linkedMembers = 0;

  if (localAssocIds.length > 0) {
    const { data: affs } = await supabase
      .from("member_association_affiliations")
      .select("id, club_member_id, association_id, league_association_number, active")
      .in("association_id", localAssocIds);

    const affList = affs ?? [];
    const toActivate: string[] = [];
    const toDeactivate: string[] = [];
    // user_code -> { club_member_id, club_id }
    const matchedMembers = new Map<string, { club_member_id: string; club_id: string }>();

    for (const a of affList) {
      const num = String(a.league_association_number || "").trim().toUpperCase();
      if (num && rosterCodes.has(num)) {
        if (!a.active) toActivate.push(a.id);
        const club_id = clubIdByLocalAssoc.get(a.association_id);
        if (club_id) matchedMembers.set(num, { club_member_id: a.club_member_id, club_id });
      } else if (a.active) {
        toDeactivate.push(a.id);
      }
    }
    linkedMembers = matchedMembers.size;

    if (toActivate.length > 0) {
      const { error, count } = await supabase
        .from("member_association_affiliations")
        .update({ active: true, deactivated_at: null, updated_at: new Date().toISOString() }, { count: "exact" })
        .in("id", toActivate);
      if (error) errors.push({ stage: "aff_activate", error: error.message });
      else affActivated = count ?? toActivate.length;
    }
    if (toDeactivate.length > 0) {
      const { error, count } = await supabase
        .from("member_association_affiliations")
        .update({ active: false, deactivated_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { count: "exact" })
        .in("id", toDeactivate);
      if (error) errors.push({ stage: "aff_deactivate", error: error.message });
      else affDeactivated = count ?? toDeactivate.length;
    }

    // Auto-allocate matched members to local league teams (by nsa_team_id)
    if (matchedMembers.size > 0) {
      const allClubIds = [...new Set([...matchedMembers.values()].map((m) => m.club_id))];
      const { data: leagueRows } = await supabase
        .from("leagues")
        .select("id, club_id, nsa_team_id")
        .in("club_id", allClubIds)
        .not("nsa_team_id", "is", null);
      // key: club_id|nsa_team_id -> league_id
      const leagueByKey = new Map<string, string>();
      for (const l of leagueRows ?? []) {
        if (l.nsa_team_id) leagueByKey.set(`${l.club_id}|${String(l.nsa_team_id)}`, l.id);
      }

      // Pre-load existing registrations to count new vs already-allocated
      const memberIds = [...matchedMembers.values()].map((m) => m.club_member_id);
      const { data: existingRegs } = await supabase
        .from("member_league_registrations")
        .select("club_member_id, league_id")
        .in("club_member_id", memberIds);
      const existingRegSet = new Set(
        (existingRegs ?? []).map((r: any) => `${r.club_member_id}|${r.league_id}`),
      );

      const regsToInsert: any[] = [];
      for (const [code, m] of matchedMembers) {
        const tid = teamIdByCode.get(code);
        if (!tid) continue;
        const league_id = leagueByKey.get(`${m.club_id}|${tid}`);
        if (!league_id) continue;
        const key = `${m.club_member_id}|${league_id}`;
        if (existingRegSet.has(key)) {
          alreadyAllocated += 1;
          continue;
        }
        regsToInsert.push({ club_member_id: m.club_member_id, league_id });
        existingRegSet.add(key);
      }
      if (regsToInsert.length > 0) {
        for (let i = 0; i < regsToInsert.length; i += CHUNK) {
          const chunk = regsToInsert.slice(i, i + CHUNK);
          const { error, count } = await supabase
            .from("member_league_registrations")
            .upsert(chunk, { onConflict: "club_member_id,league_id", ignoreDuplicates: true, count: "exact" });
          if (error) errors.push({ stage: "allocate", error: error.message });
          else allocated += count ?? chunk.length;
        }
      }
    }
  }

  const summary =
    `${allRows.length} players · ${teamRosters.size} teams · ` +
    `${inserted} new · ${updated} updated · ${unchanged} unchanged · ` +
    `${platformDeactivated} marked inactive · ` +
    `${linkedMembers} linked to club members (${affActivated} re-activated, ${affDeactivated} deactivated) · ` +
    `${allocated} allocated to teams${alreadyAllocated ? ` (${alreadyAllocated} already allocated)` : ""}` +
    `${errors.length ? ` · ${errors.length} errors` : ""}`;

  await supabase
    .from("platform_league_associations")
    .update({
      last_members_sync_at: new Date().toISOString(),
      last_members_sync_summary: summary,
    })
    .eq("id", associationId);

  return jsonResp(200, {
    ok: true,
    association_id: associationId,
    season,
    fetched_teams: teamRosters.size,
    fetched_players: fetchedPlayers,
    inserted,
    updated,
    unchanged,
    platform_deactivated: platformDeactivated,
    linked_members: linkedMembers,
    aff_activated: affActivated,
    aff_deactivated: affDeactivated,
    allocated,
    already_allocated: alreadyAllocated,
    errors,
    summary,
  });
});
