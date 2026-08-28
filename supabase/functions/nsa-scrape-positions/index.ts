// nsa-scrape-positions
// Scrapes per-rubber data (position, player, points/games/rubbers, winner) from
// NSA's public fixture-results pages and upserts into public.nsa_rubber_history.
//
// This is the ingest half of "SquashHub as NSA's admin system": everything the
// app displays is read from our own mirror, this job just keeps it fresh until
// NSA cuts over.
//
// Triggered: nightly via pg_cron, or on-demand by an admin.
// Body:
//   { fixture_ids?: number[], lookback_days?: number, force?: boolean,
//     season?: "s79" | "s73" | "s62", season_year?: number, full_season?: boolean }
// - full_season: ignore lookback and scrape every past fixture of the season
//   (used for the 2024/2025 ranking backfill)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";
const UA = "SquashHub-PositionScraper/1.1";

/** NSA season codes -> calendar year. Verified against their fixtures feed. */
export const NSA_SEASONS: Record<string, number> = {
  s79: 2026,
  s73: 2025,
  s62: 2024,
};
const NSA_CURRENT_SEASON = "s79";

type FixtureLite = {
  id: number;
  date: string; // yyyy-mm-dd
  category: string | null;
  league_label: string | null;
  league_id: number | null;
  round: number | null;
  team1_code: string;
  team2_code: string;
};

type RubberRow = {
  nsa_fixture_id: number;
  fixture_date: string;
  season_code: string;
  season_year: number;
  category: string | null;
  league_label: string | null;
  nsa_league_id: number | null;
  round: number | null;
  team_code: string;
  is_home: boolean;
  position: number;
  player_code: string;
  player_name: string | null;
  opponent_code: string | null;
  opponent_name: string | null;
  points_for: number | null;
  games_for: number | null;
  rubbers_for: number | null;
  points_against: number | null;
  games_against: number | null;
  rubbers_against: number | null;
  won: boolean | null;
};

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;?/g, " ").replace(/\s+/g, " ").trim();
}

async function listFixtures(season: string): Promise<FixtureLite[]> {
  // NB: without ?league=... NSA returns a leagues/clubs catalog object.
  const url = `${NSA_BASE}/fixtures.php?json&league=${encodeURIComponent(season)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
  if (!res.ok) throw new Error(`NSA fixtures HTTP ${res.status}`);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`NSA fixtures parse failed: ${(e as Error).message}; preview=${text.slice(0, 120)}`);
  }

  let raw: Array<Record<string, any>>;
  if (Array.isArray(parsed)) {
    raw = parsed as Array<Record<string, any>>;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.fixtures)) raw = obj.fixtures as Array<Record<string, any>>;
    else if (Array.isArray(obj.data)) raw = obj.data as Array<Record<string, any>>;
    else throw new Error(`NSA fixtures: unexpected object shape, keys=${Object.keys(obj).slice(0, 5).join(",")}`);
  } else {
    throw new Error(`NSA fixtures: unexpected type ${typeof parsed}`);
  }

  return raw
    .filter((f) => f.date && f.team1?.code && f.team2?.code)
    .map((f) => ({
      id: Number(f.id),
      date: String(f.date),
      category: f.category ?? null,
      league_label: f.league ?? null,
      league_id: f.league_id != null ? Number(f.league_id) : null,
      round: f.round != null ? Number(f.round) : null,
      team1_code: String(f.team1.code).toUpperCase(),
      team2_code: String(f.team2.code).toUpperCase(),
    }));
}

function windowFilter(fixtures: FixtureLite[], lookbackDays: number | null): FixtureLite[] {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  if (lookbackDays == null) return fixtures.filter((f) => f.date < todayStr);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return fixtures.filter((f) => f.date >= cutoffStr && f.date < todayStr);
}

/**
 * Scorecard layout: one <tr> per player, home row then away row for each
 * string. Cells after the NSF code are the per-game scores, then the player's
 * summary triple: points, games won, rubbers won. Everything else is blank
 * because the opposing club's columns sit in the same row.
 */
export function parseFixtureResults(html: string, fx: FixtureLite, season: string): RubberRow[] {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const players: Array<{
    code: string;
    name: string | null;
    points: number | null;
    games: number | null;
    rubbers: number | null;
  }> = [];

  for (const m of html.matchAll(rowRe)) {
    const cells = [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => stripTags(c[1]));
    const codeIdx = cells.findIndex((c) => /^NSF\d{3,5}$/i.test(c));
    if (codeIdx < 0) continue;

    const nameCell = cells[codeIdx - 1] ?? null;
    const name = nameCell ? nameCell.replace(/\s*-\s*external\s*$/i, "").trim() || null : null;

    const numbers = cells
      .slice(codeIdx + 1)
      .filter((c) => /^-?\d+$/.test(c))
      .map(Number);
    const tail = numbers.slice(-3);
    const hasSummary = tail.length === 3;

    players.push({
      code: cells[codeIdx].toUpperCase(),
      name,
      points: hasSummary ? tail[0] : null,
      games: hasSummary ? tail[1] : null,
      rubbers: hasSummary ? tail[2] : null,
    });
  }

  if (players.length === 0) return [];

  const out: RubberRow[] = [];
  const seasonYear = NSA_SEASONS[season] ?? Number(fx.date.slice(0, 4));

  for (let i = 0; i < players.length; i++) {
    const isHome = i % 2 === 0;
    const position = Math.floor(i / 2) + 1;
    if (position > 10) break;
    const me = players[i];
    const opponent = players[isHome ? i + 1 : i - 1] ?? null;

    out.push({
      nsa_fixture_id: fx.id,
      fixture_date: fx.date,
      season_code: season,
      season_year: seasonYear,
      category: fx.category,
      league_label: fx.league_label,
      nsa_league_id: fx.league_id,
      round: fx.round,
      team_code: isHome ? fx.team1_code : fx.team2_code,
      is_home: isHome,
      position,
      player_code: me.code,
      player_name: me.name,
      opponent_code: opponent?.code ?? null,
      opponent_name: opponent?.name ?? null,
      points_for: me.points,
      games_for: me.games,
      rubbers_for: me.rubbers,
      points_against: opponent?.points ?? null,
      games_against: opponent?.games ?? null,
      rubbers_against: opponent?.rubbers ?? null,
      won: me.rubbers == null ? null : me.rubbers >= 1,
    });
  }

  return out;
}

async function scrapeOne(fx: FixtureLite, season: string): Promise<RubberRow[]> {
  const res = await fetch(`${NSA_BASE}/fixtureresults.php?fixture=${fx.id}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`fixture ${fx.id}: HTTP ${res.status}`);
  return parseFixtureResults(await res.text(), fx, season);
}

async function scoredFixtureSet(
  supabase: ReturnType<typeof createClient>,
  ids: number[],
): Promise<Set<number>> {
  const found = new Set<number>();
  // Chunked so a full-season backfill doesn't blow the URL length limit.
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from("nsa_rubber_history")
      .select("nsa_fixture_id")
      .in("nsa_fixture_id", chunk)
      .not("won", "is", null);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ nsa_fixture_id: number }>) found.add(r.nsa_fixture_id);
  }
  return found;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: {
    fixture_ids?: number[];
    lookback_days?: number;
    force?: boolean;
    background?: boolean;
    season?: string;
    full_season?: boolean;
    association_id?: string;
  } = {};
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

  const season = (body.season || NSA_CURRENT_SEASON).trim();
  const seasonYear = NSA_SEASONS[season] ?? null;
  const fullSeason = !!body.full_season;
  const lookbackDays = fullSeason ? null : Math.max(1, Math.min(365, body.lookback_days ?? 14));
  const force = !!body.force;
  const background = body.background ?? !(body.fixture_ids && body.fixture_ids.length <= 5);

  const runScrape = async () => {
    const { data: runRow } = await supabase
      .from("nsa_sync_runs")
      .insert({
        association_id: body.association_id ?? null,
        kind: fullSeason ? "rubbers_backfill" : "rubbers",
        season_code: season,
        season_year: seasonYear,
        status: "running",
      })
      .select("id")
      .maybeSingle();
    const runId = (runRow as { id?: string } | null)?.id ?? null;

    const summary = {
      season,
      season_year: seasonYear,
      total_candidates: 0,
      already_scraped: 0,
      to_scrape: 0,
      scraped: 0,
      rows_upserted: 0,
      errors: [] as Array<{ fixture_id: number; error: string }>,
    };

    try {
      const all = await listFixtures(season);
      let fixtures: FixtureLite[];
      if (body.fixture_ids && body.fixture_ids.length > 0) {
        const wanted = new Set(body.fixture_ids.map(Number));
        fixtures = all.filter((f) => wanted.has(f.id));
      } else {
        fixtures = windowFilter(all, lookbackDays);
      }

      const skipExisting = force ? new Set<number>() : await scoredFixtureSet(supabase, fixtures.map((f) => f.id));
      const todo = fixtures.filter((f) => !skipExisting.has(f.id));

      summary.total_candidates = fixtures.length;
      summary.already_scraped = skipExisting.size;
      summary.to_scrape = todo.length;

      for (const fx of todo) {
        try {
          const rows = await scrapeOne(fx, season);
          if (rows.length > 0) {
            const { error } = await supabase
              .from("nsa_rubber_history")
              .upsert(rows, { onConflict: "nsa_fixture_id,team_code,position" });
            if (error) throw error;
            summary.rows_upserted += rows.length;
          }
          summary.scraped += 1;
        } catch (err) {
          summary.errors.push({ fixture_id: fx.id, error: (err as Error).message });
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (runId) {
        await supabase
          .from("nsa_sync_runs")
          .update({
            status: summary.errors.length > 0 ? "completed_with_errors" : "completed",
            finished_at: new Date().toISOString(),
            seen_count: summary.total_candidates,
            created_count: summary.rows_upserted,
            skipped_count: summary.already_scraped,
            error_count: summary.errors.length,
            details: summary,
          })
          .eq("id", runId);
      }
      return summary;
    } catch (err) {
      if (runId) {
        await supabase
          .from("nsa_sync_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_count: 1,
            details: { ...summary, fatal: (err as Error).message },
          })
          .eq("id", runId);
      }
      throw err;
    }
  };

  try {
    if (background) {
      // @ts-ignore — EdgeRuntime is a Supabase runtime global.
      EdgeRuntime.waitUntil(runScrape().catch((e) => console.error("[nsa-scrape-positions] bg error", e)));
      return new Response(
        JSON.stringify({ success: true, background: true, season, message: "Scrape started in background" }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const summary = await runScrape();
    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
