import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SHELLY_SERVER = "https://shelly-44-eu.shelly.cloud";

function normalizeShellyServer(value?: string | null) {
  const raw = (value || DEFAULT_SHELLY_SERVER).trim();
  const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
  const extracted = (urlMatch?.[0] || raw).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(extracted)) return DEFAULT_SHELLY_SERVER;
  return extracted;
}

async function pulseShellyRelay(params: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel: number;
  pulseMs: number;
}) {
  const server = normalizeShellyServer(params.server);
  // Prefer v2 with a timed "on" pulse when the device supports Gen2+ (Shelly 1 Mini Gen3 does).
  const v2 = await fetch(
    `${server}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(params.authKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: params.deviceId,
        channel: params.channel,
        on: true,
        toggle_after: Math.max(1, Math.round(params.pulseMs / 1000)),
      }),
    },
  );
  const v2Text = await v2.text();
  if (v2.ok) {
    try {
      const parsed = JSON.parse(v2Text);
      if (parsed?.isok === false) {
        const detail =
          typeof parsed.errors === "string"
            ? parsed.errors
            : JSON.stringify(parsed.errors ?? parsed);
        throw new Error(`Shelly rejected: ${detail}`);
      }
    } catch (e: any) {
      if (e?.message?.startsWith("Shelly ")) throw e;
    }
    return v2Text;
  }

  // Fallback for older Gen1 devices.
  const legacy = await fetch(`${server}/device/relay/control`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      auth_key: params.authKey,
      id: params.deviceId,
      channel: String(params.channel),
      turn: "on",
      timer: String(Math.max(1, Math.round(params.pulseMs / 1000))),
    }),
  });
  const legacyText = await legacy.text();
  if (!legacy.ok) throw new Error(`Shelly ${legacy.status}: ${legacyText}`);
  return legacyText;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify the caller from the JWT (so we can log who opened the door).
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { club_id, door_name = "Main door", device_id: overrideDeviceId } =
      body as { club_id?: string; door_name?: string; device_id?: string };
    if (!club_id) {
      return new Response(JSON.stringify({ error: "Missing club_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to read secrets and to log the access event.
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: secrets, error: secErr } = await admin
      .from("club_secrets")
      .select(
        "shelly_auth_key, shelly_server_url, shelly_door_device_id, shelly_door_channel, shelly_door_pulse_ms",
      )
      .eq("club_id", club_id)
      .maybeSingle();
    if (secErr) throw secErr;
    if (!secrets?.shelly_auth_key) throw new Error("Shelly auth key not configured");

    const deviceId = overrideDeviceId || secrets.shelly_door_device_id;
    if (!deviceId) throw new Error("Shelly door device ID not configured");

    // Resolve the calling member (best-effort — used for the audit trail).
    const { data: member } = await admin
      .from("club_members")
      .select("id")
      .eq("club_id", club_id)
      .eq("user_id", userId)
      .maybeSingle();

    const raw = await pulseShellyRelay({
      server: secrets.shelly_server_url,
      authKey: secrets.shelly_auth_key,
      deviceId,
      channel: Number(secrets.shelly_door_channel ?? 0),
      pulseMs: Number(secrets.shelly_door_pulse_ms ?? 3000),
    });

    await admin.from("access_events").insert({
      club_id,
      club_member_id: member?.id ?? null,
      door_name,
      event_type: "shelly_pulse",
      occurred_at: new Date().toISOString(),
      raw: { device_id: deviceId, response: raw?.slice?.(0, 500) ?? null },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
