// SportyHQ Sync Edge Function (stub)
// Operator: Stratus Software Solutions (Pty) Ltd — SquashHub
// Status: AWAITING CREDENTIALS from SportyHQ partner API team.
// Once credentials arrive, set the following secrets via Lovable Cloud:
//   - SPORTYHQ_API_KEY        (the partner API key issued by SportyHQ)
//   - SPORTYHQ_API_SECRET     (HMAC signing secret, if required)
//   - SPORTYHQ_BASE_URL       (e.g. https://api.sportyhq.com/v1)
//
// Supported actions (planned):
//   POST /sportyhq-sync  { action: "pull_ratings", club_id }
//   POST /sportyhq-sync  { action: "push_result", match_id }
//   POST /sportyhq-sync  { action: "verify_credentials" }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncRequest {
  action: "pull_ratings" | "push_result" | "verify_credentials";
  club_id?: string;
  match_id?: string;
}

async function sportyHqFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const baseUrl = Deno.env.get("SPORTYHQ_BASE_URL");
  const apiKey = Deno.env.get("SPORTYHQ_API_KEY");
  if (!baseUrl || !apiKey) {
    throw new Error("SportyHQ credentials not configured");
  }
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  return await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
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
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credential gate
    if (!Deno.env.get("SPORTYHQ_API_KEY")) {
      return new Response(
        JSON.stringify({
          error: "SportyHQ integration not yet activated",
          detail:
            "Awaiting partner API credentials from SportyHQ. Once received, save SPORTYHQ_API_KEY (and SPORTYHQ_BASE_URL) as Lovable Cloud secrets.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = (await req.json()) as SyncRequest;

    switch (body.action) {
      case "verify_credentials": {
        const r = await sportyHqFetch("/ping");
        return new Response(
          JSON.stringify({ ok: r.ok, status: r.status }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      case "pull_ratings": {
        // TODO: GET /clubs/{club_id}/members -> upsert ratings into club_members
        return new Response(
          JSON.stringify({ todo: "pull_ratings — wire up after docs arrive" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      case "push_result": {
        // TODO: POST /matches with payload from club_champs_matches
        return new Response(
          JSON.stringify({ todo: "push_result — wire up after docs arrive" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
