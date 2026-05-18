// nsa-scrape-positions
// Scrapes per-rubber position data from NSA's public fixture-results pages
// and upserts into public.nsa_rubber_history.
//
// Triggered: nightly via pg_cron, or on-demand by an admin (POST {} body).
// Optional body: { fixture_ids?: number[], lookback_days?: number, force?: boolean }
// - fixture_ids: scrape just these IDs (skips list)
// - lookback_days: how far back to look for completed fixtures (default 14)
// - force: re-scrape even if rows already exist

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";
const UA = "SquashHub-PositionScraper/1.0";
const NSA_SEASON = "s79"; // 2026 season — matches NSA_CURRENT_SEASON in src/hooks/use-nsa.ts

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
  category: string | null;
  league_label: string | null;
  nsa_league_id: number | null;
  round: number | null;
  team_code: string;
  is_home: boolean;
  position: number;
  player_code: string;
  player_name: string | null;
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

async function listCompletedFixtures(lookbackDays: number): Promise<FixtureLite[]> {
  // NSA's status filter is unreliable — pull all fixtures for the season and
  // filter client-side to dates in [today - lookback, today).
  // NB: without ?league=... NSA returns a leagues/clubs catalog object.
  const url = `${NSA_BASE}/fixtures.php?json&league=${encodeURIComponent(NSA_SEASON)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,*/*" },
  });
  if (!res.ok) throw new Error(`NSA fixtures HTTP ${res.status}`);
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) {
    throw new Error(`NSA fixtures parse failed: ${(e as Error).message}; preview=${text.slice(0, 120)}`);
  }
  // Handle both shapes: array of fixtures, or { fixtures: [...] } / { data: [...] }
  let raw: Array<{
    id: string | number;
    category?: string;
    league?: string;
    league_id?: string | number;
    round?: string | number;
    date: string;
    team1?: { code?: string };
    team2?: { code?: string };
  }>;
  if (Array.isArray(parsed)) {
    raw = parsed as typeof raw;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.fixtures)) raw = obj.fixtures as typeof raw;
    else if (Array.isArray(obj.data)) raw = obj.data as typeof raw;
    else throw new Error(`NSA fixtures: unexpected object shape, keys=${Object.keys(obj).slice(0,5).join(",")}`);
  } else {
    throw new Error(`NSA fixtures: unexpected type ${typeof parsed}`);
  }

  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  return raw
    .filter((f) => f.date && f.date >= cutoffStr && f.date < todayStr)
    .filter((f) => f.team1?.code && f.team2?.code)
    .map((f) => ({
      id: Number(f.id),
      date: f.date,
      category: f.category ?? null,
      league_label: f.league ?? null,
      league_id: f.league_id != null ? Number(f.league_id) : null,
      round: f.round != null ? Number(f.round) : null,
      team1_code: String(f.team1!.code).toUpperCase(),
      team2_code: String(f.team2!.code).toUpperCase(),
    }));
}

function parseFixtureResults(html: string, fx: FixtureLite): RubberRow[] {
  // Each player row contains:
  //   <td>...<a href="userinfo.php?user=N">Name</a>...</td><td>NSF1234</td>
  //   <td>P</td><td>G</td><td>T</td>   (home columns)
  //   ... empty home/away separator ...
  //   <td>P</td><td>G</td><td>T</td>   (away columns)
  //
  // Rows come in pairs: home then away for position 1, then position 2, etc.
  // We extract NSF codes in order. The first numeric triple after each code
  // is "their own" P/G/T; the next non-empty triple is the opponent's.

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const players: Array<{ code: string; name: string | null; cells: string[] }> = [];

  for (const m of html.matchAll(rowRe)) {
    const inner = m[1];
    const cells = [...inner.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => stripTags(c[1]));
    // Find a cell that is exactly an NSF code
    const codeIdx = cells.findIndex((c) => /^NSF\d{3,5}$/i.test(c));
    if (codeIdx < 0) continue;
    // Skip totals/subtotals rows (they don't have player codes anyway)
    const code = cells[codeIdx].toUpperCase();
    const nameCell = cells[codeIdx - 1] ?? null;
    const name = nameCell ? nameCell.replace(/\s*-\s*external\s*$/i, "").trim() || null : null;
    players.push({ code, name, cells: cells.slice(codeIdx + 1) });
  }

  if (players.length === 0) return [];

  const out: RubberRow[] = [];
  for (let i = 0; i < players.length; i++) {
    const isHome = i % 2 === 0;
    const position = Math.floor(i / 2) + 1;
    if (position > 4) break;
    const teamCode = isHome ? fx.team1_code : fx.team2_code;

    // Pull all numeric cells in order after the NSF code
    const nums = players[i].cells
      .map((c) => (/^-?\d+$/.test(c) ? parseInt(c, 10) : null));

    // First 3 numeric values belong to that player's own side; the next 3 belong to opponent.
    const ownNums: number[] = [];
    const oppNums: number[] = [];
    for (const n of nums) {
      if (n === null) continue;
      if (ownNums.length < 3) ownNums.push(n);
      else if (oppNums.length < 3) oppNums.push(n);
      else break;
    }

    const [pFor, gFor, tFor] = [ownNums[0] ?? null, ownNums[1] ?? null, ownNums[2] ?? null];
    const [pAg, gAg, tAg] = [oppNums[0] ?? null, oppNums[1] ?? null, oppNums[2] ?? null];

    let won: boolean | null = null;
    if (tFor != null && tAg != null && (tFor > 0 || tAg > 0)) won = tFor > tAg;

    out.push({
      nsa_fixture_id: fx.id,
      fixture_date: fx.date,
      category: fx.category,
      league_label: fx.league_label,
      nsa_league_id: fx.league_id,
      round: fx.round,
      team_code: teamCode,
      is_home: isHome,
      position,
      player_code: players[i].code,
      player_name: players[i].name,
      points_for: pFor,
      games_for: gFor,
      rubbers_for: tFor,
      points_against: pAg,
      games_against: gAg,
      rubbers_against: tAg,
      won,
    });
  }

  return out;
}

async function scrapeOne(fx: FixtureLite): Promise<RubberRow[]> {
  const res = await fetch(`${NSA_BASE}/fixtureresults.php?fixture=${fx.id}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`fixture ${fx.id}: HTTP ${res.status}`);
  const html = await res.text();
  return parseFixtureResults(html, fx);
}

async function alreadyScrapedSet(
  supabase: ReturnType<typeof createClient>,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("nsa_rubber_history")
    .select("nsa_fixture_id")
    .in("nsa_fixture_id", ids);
  if (error) throw error;
  return new Set((data ?? []).map((r: { nsa_fixture_id: number }) => r.nsa_fixture_id));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: { fixture_ids?: number[]; lookback_days?: number; force?: boolean } = {};
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

  const lookbackDays = Math.max(1, Math.min(180, body.lookback_days ?? 14));
  const force = !!body.force;

  try {
    let fixtures: FixtureLite[];
    if (body.fixture_ids && body.fixture_ids.length > 0) {
      // Need date/team metadata for the requested ids — pull a wider list and filter
      const all = await listCompletedFixtures(365);
      const wanted = new Set(body.fixture_ids.map(Number));
      fixtures = all.filter((f) => wanted.has(f.id));
    } else {
      fixtures = await listCompletedFixtures(lookbackDays);
    }

    let skipExisting = new Set<number>();
    if (!force) {
      skipExisting = await alreadyScrapedSet(supabase, fixtures.map((f) => f.id));
    }
    const todo = fixtures.filter((f) => !skipExisting.has(f.id));

    const summary = {
      total_candidates: fixtures.length,
      already_scraped: skipExisting.size,
      to_scrape: todo.length,
      scraped: 0,
      rows_upserted: 0,
      errors: [] as Array<{ fixture_id: number; error: string }>,
    };

    for (const fx of todo) {
      try {
        const rows = await scrapeOne(fx);
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
      // polite delay so we don't hammer NSA
      await new Promise((r) => setTimeout(r, 250));
    }

    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
