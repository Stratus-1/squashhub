// nsa-sync-fixtures
// ---------------------------------------------------------------
// Super-admin only. Pulls fixtures for a given association from the
// NSA admin site (https://admin.northerns.co.za/nsa/fixtures.php?json)
// and upserts them into platform_league_fixtures keyed by external_id.
//
// Body: { association_id: string, season?: string, status?: "completed" | "running" }
//   - season defaults to the association's external_season ("s79" if unset)
//   - status defaults to "completed" so we get the full season including past rounds
//
// Returns:
//   { ok: true, association_id, season, fetched, inserted, updated, unchanged, errors: [...] }
//
// Cron: invoked daily at 03:00 SAST by a pg_cron job (see migrations).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";

type NsaTeam = { id: string; code: string; club: string; club_id: string };
type NsaFixture = {
  id: string;
  category: string;
  league: string;
  league_id: string;
  round: string;
  date: string; // YYYY-MM-DD
  venue: string;
  team1: NsaTeam;
  team2: NsaTeam;
  status: string;
};

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "Method not allowed" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: cron uses the service-role bearer (treated as system call); otherwise
  // require an authenticated super-admin.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const isServiceRole = token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!isServiceRole) {
    if (!token) return jsonResp(401, { error: "Unauthorized" });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return jsonResp(401, { error: "Unauthorized" });
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResp(403, { error: "Super-admin only" });
  }

  let body: { association_id?: string; season?: string; status?: string } = {};
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
  const status = (body.status || "completed").trim();

  const url = `${NSA_BASE}/fixtures.php?json&league=${encodeURIComponent(season)}&status=${encodeURIComponent(status)}`;
  let fixtures: NsaFixture[] = [];
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "SquashHub-Sync/1.0" } });
    if (!r.ok) return jsonResp(502, { error: `NSA HTTP ${r.status}` });
    fixtures = await r.json();
  } catch (e) {
    return jsonResp(502, { error: `NSA fetch failed: ${(e as Error).message}` });
  }

  // Pre-load existing fixtures by external_id so we can detect inserts vs updates
  const { data: existingRows } = await supabase
    .from("platform_league_fixtures")
    .select("id, external_id, fixture_date, home_team_code, away_team_code, division, venue_name, status, nsa_fixture_id")
    .eq("association_id", associationId)
    .not("external_id", "is", null);
  const existingByExt = new Map<string, any>();
  for (const r of existingRows ?? []) {
    if (r.external_id) existingByExt.set(String(r.external_id), r);
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const errors: any[] = [];

  // Upsert in chunks to stay under PostgREST limits
  const rowsToUpsert: any[] = [];
  for (const f of fixtures) {
    if (!f?.id) continue;
    const home = (f.team1?.code || "").toUpperCase();
    const away = (f.team2?.code || "").toUpperCase();
    if (!home || !away || !f.date) continue;
    const division = `${f.category} ${f.league}`.trim();
    const row = {
      association_id: associationId,
      external_id: String(f.id),
      nsa_fixture_id: Number.isFinite(Number(f.id)) ? Number(f.id) : null,
      fixture_date: f.date,
      venue_name: f.venue || "TBA",
      home_team_code: home,
      away_team_code: away,
      division,
      status: f.status === "completed" ? "completed" : "scheduled",
    };

    const prev = existingByExt.get(String(f.id));
    if (!prev) {
      inserted += 1;
    } else {
      const changed =
        prev.fixture_date !== row.fixture_date ||
        (prev.home_team_code || "").toUpperCase() !== row.home_team_code ||
        (prev.away_team_code || "").toUpperCase() !== row.away_team_code ||
        (prev.division || "") !== row.division ||
        (prev.venue_name || "") !== row.venue_name ||
        (prev.status || "") !== row.status;
      if (changed) updated += 1;
      else unchanged += 1;
    }
    rowsToUpsert.push(row);
  }

  // Chunked upsert (1000 at a time)
  const CHUNK = 500;
  for (let i = 0; i < rowsToUpsert.length; i += CHUNK) {
    const chunk = rowsToUpsert.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("platform_league_fixtures")
      .upsert(chunk, { onConflict: "association_id,external_id" });
    if (error) errors.push({ chunk_start: i, error: error.message });
  }

  const summary = `Synced ${fixtures.length} fixtures · ${inserted} new · ${updated} updated · ${unchanged} unchanged${errors.length ? ` · ${errors.length} errors` : ""}`;
  await supabase
    .from("platform_league_associations")
    .update({
      last_fixtures_sync_at: new Date().toISOString(),
      last_fixtures_sync_summary: summary,
    })
    .eq("id", associationId);

  return jsonResp(200, {
    ok: true,
    association_id: associationId,
    season,
    status_filter: status,
    fetched: fixtures.length,
    inserted,
    updated,
    unchanged,
    errors,
    summary,
  });
});
