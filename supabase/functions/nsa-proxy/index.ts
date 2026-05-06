// NSA proxy — forwards GET requests to admin.northerns.co.za with ?json
// Endpoints supported: 'fixtures' | 'team' | 'standings'
//
// 'fixtures' & 'team': pass-through JSON endpoints (?json appended).
// 'standings': scrapes standings.php HTML and returns parsed JSON.
//   Body: { endpoint: 'standings', params: { season_year?: '2026', category: 'Mens'|'Ladies', league_number: '3' } }
//   Or:  { endpoint: 'standings', params: { season_id: 'league_1', division_id: '1284' } }
//
// 60s in-memory cache for pass-through; 24h cache for the season→division map.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";
const ALLOWED_ENDPOINTS = new Set(["fixtures", "team", "standings"]);
const CACHE_TTL_MS = 60_000;
const SEASON_MAP_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

// Season map: { seasons: [{id, label}], divisions: { [season_id]: [{id, name}] } }
type SeasonMap = {
  seasons: Array<{ id: string; label: string }>;
  divisions: Record<string, Array<{ id: string; name: string }>>;
};
let seasonMapCache: { at: number; data: SeasonMap } | null = null;

function cacheKey(endpoint: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return `${endpoint}?${sorted}`;
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(`${NSA_BASE}/${endpoint}.php`);
  url.searchParams.set("json", "");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

// ---------- standings parsing ----------

async function fetchSeasonMap(): Promise<SeasonMap> {
  if (seasonMapCache && Date.now() - seasonMapCache.at < SEASON_MAP_TTL_MS) {
    return seasonMapCache.data;
  }
  const res = await fetch(`${NSA_BASE}/standings.php`, {
    headers: { "User-Agent": "SquashHub-Proxy/1.0" },
  });
  const html = await res.text();
  const map: SeasonMap = { seasons: [], divisions: {} };

  // Seasons: <select id="league" name="league"> ... </select>
  const seasonSelMatch = html.match(/<select[^>]*id="league"[^>]*>([\s\S]*?)<\/select>/);
  if (seasonSelMatch) {
    const opts = [...seasonSelMatch[1].matchAll(/<option\s+value="([^"]+)"[^>]*>([^<]+)/g)];
    map.seasons = opts.map((m) => ({ id: m[1], label: m[2].trim() }));
  }

  // Per-season division dropdowns: <select id="league_N" name="league_N"> ... </select>
  const divSelects = [...html.matchAll(/<select[^>]*id="(league_\d+)"[^>]*>([\s\S]*?)<\/select>/g)];
  for (const sel of divSelects) {
    const seasonId = sel[1];
    const opts = [...sel[2].matchAll(/<option\s+value="([^"]+)"[^>]*>([^<]+)/g)];
    map.divisions[seasonId] = opts.map((m) => ({ id: m[1], name: m[2].trim() }));
  }

  seasonMapCache = { at: Date.now(), data: map };
  return map;
}

function resolveSeasonId(map: SeasonMap, year: string): string | null {
  // Match exact year (e.g., "2026") preferring labels that are exactly the year
  // (skip "2026 BFIN", "2026 Blitz" — those are play-off / blitz tournaments).
  const exact = map.seasons.find((s) => s.label.trim() === year);
  if (exact) return exact.id;
  const startsWith = map.seasons.find((s) => s.label.trim().startsWith(year));
  return startsWith?.id ?? null;
}

function resolveDivisionId(
  map: SeasonMap,
  seasonId: string,
  category: string,
  leagueNumber: string,
): string | null {
  const divs = map.divisions[seasonId];
  if (!divs) return null;
  // Build expected name like "Mens 3rd" or "Ladies 1st"
  const num = parseInt(leagueNumber, 10);
  if (!num) return null;
  const ord = ordinal(num); // "1st", "2nd", "3rd", "4th", ...
  const expected = `${category} ${ord}`.toLowerCase();
  const direct = divs.find((d) => d.name.toLowerCase() === expected);
  if (direct) return direct.id;
  // Fallback: starts-with (handles "Mens 1st A" etc.)
  const fallback = divs.find((d) => d.name.toLowerCase().startsWith(expected));
  return fallback?.id ?? null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

type StandingRow = {
  team_code: string;
  total: number;
  weeks: Array<{ date: string; value: string }>;
};

type StandingsResult = {
  season_id: string;
  season_label: string;
  division_id: string;
  division_name: string;
  rows: StandingRow[];
};

async function fetchStandings(seasonId: string, divisionId: string, map: SeasonMap): Promise<StandingsResult> {
  const url = `${NSA_BASE}/standings.php?league=${encodeURIComponent(seasonId)}&${encodeURIComponent(seasonId)}=${encodeURIComponent(divisionId)}`;
  const res = await fetch(url, { headers: { "User-Agent": "SquashHub-Proxy/1.0" } });
  const html = await res.text();

  const seasonLabel = map.seasons.find((s) => s.id === seasonId)?.label ?? seasonId;
  const divisionName = map.divisions[seasonId]?.find((d) => d.id === divisionId)?.name ?? divisionId;

  // The standings table is the second <table>. Find a table whose first text row contains "League Standings".
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => m[1]);
  let target = tables.find((t) => /League Standings/i.test(t));
  if (!target && tables.length >= 2) target = tables[1];
  if (!target) return { season_id: seasonId, season_label: seasonLabel, division_id: divisionId, division_name: divisionName, rows: [] };

  const rows = [...target.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
      c[1].replace(/<[^>]+>/g, "").replace(/&nbsp;?/g, " ").trim()
    )
  );

  // Find header row containing "Team" and "Total" — week headers follow.
  const headerIdx = rows.findIndex((r) => r.some((c) => /^Team$/i.test(c)) && r.some((c) => /^Total$/i.test(c)));
  if (headerIdx < 0) return { season_id: seasonId, season_label: seasonLabel, division_id: divisionId, division_name: divisionName, rows: [] };

  const header = rows[headerIdx];
  const teamCol = header.findIndex((c) => /^Team$/i.test(c));
  const totalCol = header.findIndex((c) => /^Total$/i.test(c));
  const weekHeaders = header.slice(totalCol + 1);

  const standingRows: StandingRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < totalCol + 1) continue;
    const teamCode = r[teamCol];
    if (!teamCode || teamCode === " " || teamCode.length < 2) continue;
    const totalRaw = r[totalCol];
    const total = parseInt(totalRaw, 10) || 0;
    const weeks = weekHeaders.map((wh, idx) => ({
      date: wh,
      value: (r[totalCol + 1 + idx] ?? "").trim(),
    }));
    standingRows.push({ team_code: teamCode, total, weeks });
  }

  // Sort by total points descending
  standingRows.sort((a, b) => b.total - a.total);

  return {
    season_id: seasonId,
    season_label: seasonLabel,
    division_id: divisionId,
    division_name: divisionName,
    rows: standingRows,
  };
}

// ---------- main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { endpoint?: string; params?: Record<string, string | number> } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const endpoint = (body.endpoint || "").toLowerCase().trim();
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return new Response(
      JSON.stringify({ error: `Unknown endpoint. Allowed: ${[...ALLOWED_ENDPOINTS].join(", ")}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.params || {})) {
    if (!/^[a-zA-Z0-9_]+$/.test(k)) continue;
    const sv = String(v ?? "").trim();
    // Allow letters, digits, underscore, hyphen, space (for "Mens"/"Ladies")
    if (!/^[a-zA-Z0-9_\- ]*$/.test(sv)) continue;
    if (sv) params[k] = sv;
  }

  // ---------- standings ----------
  if (endpoint === "standings") {
    try {
      const map = await fetchSeasonMap();

      // List mode: client just wants to know what seasons / divisions exist
      if (params.list === "seasons") {
        return new Response(
          JSON.stringify({ data: { seasons: map.seasons } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolve season + division ids
      let seasonId = params.season_id;
      if (!seasonId && params.season_year) {
        seasonId = resolveSeasonId(map, params.season_year) ?? "";
      }
      if (!seasonId) {
        return new Response(
          JSON.stringify({ error: "Could not resolve season. Provide season_year (e.g. '2026') or season_id." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let divisionId = params.division_id;
      if (!divisionId && params.category && params.league_number) {
        divisionId = resolveDivisionId(map, seasonId, params.category, params.league_number) ?? "";
      }
      if (!divisionId) {
        return new Response(
          JSON.stringify({
            error: "Could not resolve division.",
            available: map.divisions[seasonId] ?? [],
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const key = cacheKey("standings", { season_id: seasonId, division_id: divisionId });
      const cached = cache.get(key);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return new Response(
          JSON.stringify({ data: cached.data, cached: true, age_ms: Date.now() - cached.at }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await fetchStandings(seasonId, divisionId, map);
      cache.set(key, { at: Date.now(), data: result });

      return new Response(
        JSON.stringify({ data: result, cached: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Standings fetch failed: ${(err as Error).message}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // ---------- pass-through (fixtures, team) ----------
  const key = cacheKey(endpoint, params);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return new Response(
      JSON.stringify({ data: cached.data, cached: true, age_ms: Date.now() - cached.at }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const upstreamUrl = buildUrl(endpoint, params);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "SquashHub-Proxy/1.0" },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `NSA returned HTTP ${upstream.status}`, url: upstreamUrl }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ error: "NSA returned non-JSON", preview: text.slice(0, 200) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    cache.set(key, { at: Date.now(), data });

    return new Response(
      JSON.stringify({ data, cached: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Fetch failed: ${(err as Error).message}` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
