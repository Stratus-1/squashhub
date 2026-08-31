// compute-nsa-rankings
// Recomputes player rankings from the locally mirrored NSA rubber history.
//
// Reads public.nsa_rubber_history (our mirror — no live NSA call), scores every
// rubber with the shared ranking model, stores the per-rubber breakdown so a
// player can see exactly where their points came from, then writes a dated
// snapshot so we can show movement up/down.
//
// Body: { association_id?: string, current_season?: number, dry_run?: boolean }
// Cron: nightly, after nsa-scrape-positions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  DEFAULT_RANKING_SETTINGS,
  assignRanks,
  buildRanking,
  scoreRubber,
  type RankingSettings,
  type RubberInput,
  type ScoredRubber,
} from "../_shared/ranking-model.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OVERALL = "ALL";

function jsonResp(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type HistoryRow = {
  nsa_fixture_id: number;
  fixture_date: string;
  season_year: number | null;
  category: string | null;
  league_label: string | null;
  team_code: string;
  position: number;
  player_code: string;
  player_name: string | null;
  opponent_code: string | null;
  games_for: number | null;
  games_against: number | null;
  won: boolean | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: { association_id?: string; current_season?: number; dry_run?: boolean } = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text);
    }
  } catch {
    body = {};
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const associationId = body.association_id ?? null;
  const currentSeason = body.current_season ?? new Date().getFullYear();

  try {
    // ---- settings -------------------------------------------------------
    let settings: RankingSettings = { ...DEFAULT_RANKING_SETTINGS };
    if (associationId) {
      const { data } = await supabase
        .from("association_ranking_settings")
        .select("*")
        .eq("association_id", associationId)
        .maybeSingle();
      if (data) {
        settings = {
          ...settings,
          ...Object.fromEntries(
            Object.keys(DEFAULT_RANKING_SETTINGS).map((k) => [
              k,
              (data as Record<string, unknown>)[k] ?? (DEFAULT_RANKING_SETTINGS as unknown as Record<string, unknown>)[k],
            ]),
          ),
        } as RankingSettings;
      }
    }

    // ---- previous snapshot (for movement + opponent strength) -----------
    const { data: prevSnap } = await supabase
      .from("ranking_snapshots")
      .select("id")
      .eq("association_id", associationId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevRanks: Record<string, Record<string, number>> = {};
    const prevScores: Record<string, number> = {};
    if (prevSnap?.id) {
      const { data: prevEntries } = await supabase
        .from("ranking_snapshot_entries")
        .select("player_code, category, rank, score")
        .eq("snapshot_id", prevSnap.id);
      for (const e of (prevEntries ?? []) as Array<{ player_code: string; category: string; rank: number; score: number }>) {
        prevRanks[e.category] = prevRanks[e.category] ?? {};
        prevRanks[e.category][e.player_code] = e.rank;
        if (e.category === OVERALL) prevScores[e.player_code] = Number(e.score);
      }
    }

    // ---- source rubbers -------------------------------------------------
    const minSeason = currentSeason - Math.max(
      ...Object.keys(settings.season_decay).map((k) => Number(k)).filter((n) => Number.isFinite(n)),
      0,
    );

    const rows: HistoryRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("nsa_rubber_history")
        .select(
          "nsa_fixture_id, fixture_date, season_year, category, league_label, team_code, position, player_code, player_name, opponent_code, games_for, games_against, won",
        )
        .gte("season_year", minSeason)
        .not("won", "is", null)
        .order("fixture_date", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as HistoryRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    if (rows.length === 0) {
      return jsonResp(200, { success: true, message: "No scored rubbers available yet", players: 0 });
    }

    // ---- score ----------------------------------------------------------
    const scored: ScoredRubber[] = rows.map((r) => {
      const input: RubberInput = {
        season_year: r.season_year ?? Number(r.fixture_date.slice(0, 4)),
        player_code: r.player_code,
        player_name: r.player_name,
        category: r.category,
        league_label: r.league_label,
        team_code: r.team_code,
        position: r.position,
        won: r.won,
        games_for: r.games_for,
        games_against: r.games_against,
        fixture_date: r.fixture_date,
        nsa_fixture_id: r.nsa_fixture_id,
        opponent_code: r.opponent_code,
      };
      return scoreRubber(input, settings, prevScores);
    });

    if (body.dry_run) {
      const preview = assignRanks(buildRanking(scored, settings, currentSeason)).slice(0, 20);
      return jsonResp(200, { success: true, dry_run: true, rubbers: scored.length, preview });
    }

    // ---- persist the per-rubber breakdown -------------------------------
    let breakdownRows = 0;
    for (let i = 0; i < scored.length; i += 500) {
      const chunk = scored.slice(i, i + 500).map((r) => ({
        association_id: associationId,
        season_year: r.season_year,
        player_code: r.player_code,
        player_name: r.player_name ?? null,
        nsa_fixture_id: r.nsa_fixture_id ?? null,
        fixture_date: r.fixture_date,
        category: r.category ?? null,
        league_label: r.league_label ?? null,
        team_code: r.team_code ?? null,
        position: r.position ?? null,
        won: r.won ?? null,
        games_for: r.games_for ?? null,
        games_against: r.games_against ?? null,
        base_points: r.base_points,
        league_weight: r.league_weight,
        position_weight: r.position_weight,
        opponent_factor: r.opponent_factor,
        points: r.points,
      }));
      const { error } = await supabase
        .from("ranking_rubber_points")
        .upsert(chunk, { onConflict: "season_year,nsa_fixture_id,team_code,position" });
      if (error) throw error;
      breakdownRows += chunk.length;
    }

    // ---- build one table per category, plus overall ----------------------
    const categories = [...new Set(scored.map((r) => (r.category ?? "").trim()).filter(Boolean))];
    const tables: Array<{ category: string; rows: ReturnType<typeof assignRanks> }> = [
      { category: OVERALL, rows: assignRanks(buildRanking(scored, settings, currentSeason), prevRanks[OVERALL]) },
      ...categories.map((cat) => ({
        category: cat,
        rows: assignRanks(
          buildRanking(scored.filter((r) => (r.category ?? "").trim() === cat), settings, currentSeason),
          prevRanks[cat],
        ),
      })),
    ];

    const seasons = [...new Set(scored.map((r) => r.season_year))].sort();
    const { data: snap, error: snapErr } = await supabase
      .from("ranking_snapshots")
      .insert({
        association_id: associationId,
        basis_seasons: seasons,
        player_count: tables[0].rows.length,
        settings: settings as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();
    if (snapErr) throw snapErr;

    let entryCount = 0;
    for (const table of tables) {
      const entries = table.rows.map((row) => ({
        snapshot_id: snap.id,
        association_id: associationId,
        player_code: row.player_code,
        player_name: row.player_name,
        club_label: row.club_label,
        category: table.category,
        rank: row.rank,
        previous_rank: row.previous_rank,
        score: row.score,
        rubbers_counted: row.rubbers_counted,
        season_breakdown: row.season_breakdown,
      }));
      for (let i = 0; i < entries.length; i += 500) {
        const { error } = await supabase.from("ranking_snapshot_entries").insert(entries.slice(i, i + 500));
        if (error) throw error;
      }
      entryCount += entries.length;
    }

    return jsonResp(200, {
      success: true,
      snapshot_id: snap.id,
      rubbers_scored: scored.length,
      breakdown_rows: breakdownRows,
      categories: tables.map((t) => t.category),
      entries: entryCount,
      seasons,
    });
  } catch (err) {
    console.error("[compute-nsa-rankings]", err);
    return jsonResp(500, { success: false, error: (err as Error).message });
  }
});
