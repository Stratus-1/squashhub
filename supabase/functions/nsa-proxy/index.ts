// NSA proxy — forwards GET requests to admin.northerns.co.za with ?json
// Endpoints supported: 'fixtures' | 'team'
// Body: { endpoint: 'fixtures' | 'team', params?: Record<string, string | number> }
//
// Returns the parsed JSON from NSA, or { error } on failure.
// 60s in-memory cache per (endpoint+params) — keeps NSA happy on repeat views.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NSA_BASE = "https://admin.northerns.co.za/nsa";
const ALLOWED_ENDPOINTS = new Set(["fixtures", "team"]);
const CACHE_TTL_MS = 60_000;

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

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

  // JWT check — only authenticated users may call this
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

  // Parse body
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

  // Sanitise params -> string map, allow only simple alphanumeric values
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.params || {})) {
    if (!/^[a-zA-Z0-9_]+$/.test(k)) continue;
    const sv = String(v ?? "").trim();
    if (!/^[a-zA-Z0-9_-]*$/.test(sv)) continue;
    if (sv) params[k] = sv;
  }

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
