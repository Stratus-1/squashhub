import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
  } = await supabaseAdmin.auth.getUser(token);
  return user;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function stravaTokenExchange(code: string) {
  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET env vars");
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    token_type?: string;
    scope?: string;
    athlete?: { id: number; firstname?: string; lastname?: string };
  };
}

async function refreshStravaToken(refreshToken: string) {
  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing STRAVA_CLIENT_ID/STRAVA_CLIENT_SECRET env vars");
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava refresh failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    token_type?: string;
    scope?: string;
    athlete?: { id: number; firstname?: string; lastname?: string };
  };
}

async function getValidStravaAccessToken(userId: string) {
  const { data: tokenRow, error } = await supabaseAdmin
    .from("integrations_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "strava")
    .maybeSingle();
  if (error) throw error;
  if (!tokenRow) throw new Error("Strava not connected");

  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at).getTime() : 0;
  const now = Date.now();
  const isExpired = expiresAt > 0 && expiresAt - now < 60_000;

  if (!isExpired) return { accessToken: tokenRow.access_token as string, refreshed: false };
  if (!tokenRow.refresh_token) throw new Error("Strava token expired and no refresh token available");

  const refreshed = await refreshStravaToken(tokenRow.refresh_token as string);
  const newExpires = new Date(refreshed.expires_at * 1000).toISOString();

  await supabaseAdmin
    .from("integrations_tokens")
    .upsert(
      {
        user_id: userId,
        provider: "strava",
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: newExpires,
        token_type: refreshed.token_type ?? null,
        raw: refreshed as unknown as Record<string, unknown>,
      },
      { onConflict: "user_id,provider" }
    );

  await supabaseAdmin
    .from("integrations_accounts")
    .update({
      scopes: refreshed.scope ?? null,
      updated_at: new Date().toISOString(),
      status: "connected",
    })
    .eq("user_id", userId)
    .eq("provider", "strava");

  return { accessToken: refreshed.access_token, refreshed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let body: Record<string, unknown> | null = null;
    if (req.method !== "GET") {
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          body = null;
        }
      }
    }

    const action =
      url.searchParams.get("action") ??
      (typeof body?.action === "string" ? (body.action as string) : null);

    const user = await getUserFromRequest(req);
    if (!user) return jsonResponse(401, { error: "Unauthorized" });

    if (action === "exchange") {
      const code = typeof body?.code === "string" ? (body.code as string) : null;
      const scope = typeof body?.scope === "string" ? (body.scope as string) : null;
      if (!code) return jsonResponse(400, { error: "Missing code" });

      const token = await stravaTokenExchange(code);
      const expiresAt = new Date(token.expires_at * 1000).toISOString();
      const athleteId = token.athlete?.id ? String(token.athlete.id) : null;
      const displayName = [token.athlete?.firstname, token.athlete?.lastname].filter(Boolean).join(" ") || null;

      await supabaseAdmin
        .from("integrations_tokens")
        .upsert(
          {
            user_id: user.id,
            provider: "strava",
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_at: expiresAt,
            token_type: token.token_type ?? null,
            raw: token as unknown as Record<string, unknown>,
          },
          { onConflict: "user_id,provider" }
        );

      await supabaseAdmin
        .from("integrations_accounts")
        .upsert(
          {
            user_id: user.id,
            provider: "strava",
            provider_user_id: athleteId,
            display_name: displayName,
            scopes: scope ?? token.scope ?? null,
            status: "connected",
          },
          { onConflict: "user_id,provider" }
        );

      await supabaseAdmin
        .from("profiles")
        .update({ strava_connected: true, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      return jsonResponse(200, { connected: true });
    }

    if (action === "disconnect") {
      await supabaseAdmin
        .from("integrations_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", "strava");

      await supabaseAdmin
        .from("integrations_accounts")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", "strava");

      await supabaseAdmin
        .from("profiles")
        .update({
          strava_connected: false,
          strava_activities_count: null,
          strava_distance_m: null,
          strava_moving_time_s: null,
          strava_elevation_m: null,
          strava_last_sync_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      return jsonResponse(200, { disconnected: true });
    }

    if (action === "sync") {
      const { accessToken } = await getValidStravaAccessToken(user.id);

      const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        await supabaseAdmin
          .from("integrations_accounts")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("provider", "strava");
        return jsonResponse(502, { error: `Strava API error (${res.status}): ${text}` });
      }

      const activities = (await res.json()) as Array<{
        id: number;
        name: string;
        type: string;
        sport_type?: string;
        start_date: string;
        distance: number; // meters
        moving_time: number; // seconds
        total_elevation_gain: number; // meters
      }>;

      // Minimal "game-relevant" summary: total activity time + distance last 30 activities.
      const totals = activities.reduce(
        (acc, a) => {
          acc.distance_m += a.distance || 0;
          acc.moving_time_s += a.moving_time || 0;
          acc.elevation_m += a.total_elevation_gain || 0;
          return acc;
        },
        { distance_m: 0, moving_time_s: 0, elevation_m: 0 }
      );

      await supabaseAdmin
        .from("integrations_accounts")
        .update({
          updated_at: new Date().toISOString(),
          status: "connected",
        })
        .eq("user_id", user.id)
        .eq("provider", "strava");

      await supabaseAdmin
        .from("profiles")
        .update({
          strava_connected: true,
          strava_activities_count: activities.length,
          strava_distance_m: totals.distance_m,
          strava_moving_time_s: Math.round(totals.moving_time_s),
          strava_elevation_m: totals.elevation_m,
          strava_last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      return jsonResponse(200, {
        activitiesCount: activities.length,
        totals,
      });
    }

    if (action === "recent") {
      const { accessToken } = await getValidStravaAccessToken(user.id);

      const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        return jsonResponse(502, { error: `Strava API error (${res.status}): ${text}` });
      }

      const activities = (await res.json()) as Array<{
        id: number;
        name: string;
        type: string;
        sport_type?: string;
        start_date: string;
        start_date_local?: string;
        distance: number;
        moving_time: number;
        elapsed_time?: number;
        total_elevation_gain: number;
      }>;

      return jsonResponse(200, {
        activities: activities.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          sport_type: a.sport_type ?? null,
          start_date: a.start_date,
          start_date_local: a.start_date_local ?? null,
          distance: a.distance,
          moving_time: a.moving_time,
          elapsed_time: a.elapsed_time ?? null,
          total_elevation_gain: a.total_elevation_gain,
        })),
      });
    }

    return jsonResponse(400, { error: "Unknown action" });
  } catch (error) {
    console.error("Strava integration error:", error);
    return jsonResponse(500, { error: (error as Error).message });
  }
});
