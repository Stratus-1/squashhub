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

type ShellyDeviceState = {
  online: boolean | null;
  output: boolean | null;
  raw: string;
};

/** Read the relay's actual state — Shelly Cloud acknowledges delivery, not actuation. */
async function getDeviceStatus(params: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel: number;
}): Promise<ShellyDeviceState> {
  const server = normalizeShellyServer(params.server);
  try {
    const res = await fetch(
      `${server}/v2/devices/api/get?auth_key=${encodeURIComponent(params.authKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [params.deviceId],
          select: ["status"],
          pick: { status: [`switch:${params.channel}`] },
        }),
      },
    );
    const raw = (await res.text()).slice(0, 800);
    let online: boolean | null = null;
    let output: boolean | null = null;
    try {
      const parsed = JSON.parse(raw);
      const state = Array.isArray(parsed) ? parsed[0] : null;
      if (state && (state.online === 0 || state.online === 1)) online = state.online === 1;
      const switchStatus = state?.status?.[`switch:${params.channel}`];
      if (typeof switchStatus?.output === "boolean") output = switchStatus.output;
    } catch {
      /* non-JSON — leave unknown */
    }
    return { online, output, raw };
  } catch (e: any) {
    return { online: null, output: null, raw: String(e?.message || e) };
  }
}

/**
 * Switch a Shelly relay.
 *
 * `autoOffSeconds` maps to Shelly's `toggle_after`, which is what makes a
 * geyser safe to expose: the relay switches itself back off even if the app,
 * the phone or the network disappears straight after the command.
 */
async function setShellyRelay(params: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel: number;
  on: boolean;
  autoOffSeconds?: number | null;
}) {
  const server = normalizeShellyServer(params.server);
  const body: Record<string, unknown> = {
    id: params.deviceId,
    channel: params.channel,
    on: params.on,
  };
  if (params.on && params.autoOffSeconds && params.autoOffSeconds > 0) {
    body.toggle_after = Math.max(1, Math.round(params.autoOffSeconds));
  }

  const v2 = await fetch(
    `${server}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(params.authKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  // Gen1 fallback.
  const legacy = await fetch(`${server}/device/relay/control`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      auth_key: params.authKey,
      id: params.deviceId,
      channel: String(params.channel),
      turn: params.on ? "on" : "off",
      ...(params.on && params.autoOffSeconds
        ? { timer: String(Math.max(1, Math.round(params.autoOffSeconds))) }
        : {}),
    }),
  });
  const legacyText = await legacy.text();
  if (!legacy.ok) throw new Error(`Shelly ${legacy.status}: ${legacyText}`);
  return legacyText;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;
    if (!userId) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const { device_id, action } = body as {
      device_id?: string;
      action?: "on" | "off" | "pulse" | "status";
    };
    if (!device_id) return json({ error: "Missing device_id" }, 400);
    if (!action || !["on", "off", "pulse", "status"].includes(action)) {
      return json({ error: "action must be one of: on, off, pulse, status" }, 400);
    }

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Authorisation is decided in the database, not here, so the rule cannot
    // drift from the RLS policy that hides gadgets from ordinary members.
    const { data: allowed, error: permErr } = await admin.rpc("can_operate_device", {
      _user_id: userId,
      _device_id: device_id,
    });
    if (permErr) throw permErr;
    if (!allowed) return json({ error: "You are not allowed to operate this device" }, 403);

    const { data: device, error: devErr } = await admin
      .from("club_devices")
      .select("*")
      .eq("id", device_id)
      .maybeSingle();
    if (devErr) throw devErr;
    if (!device) return json({ error: "Device not found" }, 404);

    if (device.provider !== "shelly") {
      return json(
        { error: `SquashHub cannot control "${device.provider}" devices yet — only Shelly relays.` },
        400,
      );
    }
    if (!device.shelly_device_id) {
      return json({ error: `"${device.name}" has no Shelly device ID configured.` }, 400);
    }

    const { data: secrets, error: secErr } = await admin
      .from("club_secrets")
      .select("shelly_auth_key, shelly_server_url")
      .eq("club_id", device.club_id)
      .maybeSingle();
    if (secErr) throw secErr;
    if (!secrets?.shelly_auth_key) {
      return json({ error: "This club has no Shelly auth key configured." }, 400);
    }

    const channel = Number(device.shelly_channel ?? 0);
    const shelly = {
      server: secrets.shelly_server_url,
      authKey: secrets.shelly_auth_key as string,
      deviceId: device.shelly_device_id as string,
      channel,
    };

    // Read-only path — used by the dashboard to show real state on load.
    if (action === "status") {
      const state = await getDeviceStatus(shelly);
      await admin
        .from("club_devices")
        .update({
          last_state: state.output,
          last_state_at: new Date().toISOString(),
        })
        .eq("id", device_id);
      return json({ ok: true, online: state.online, state: state.output });
    }

    const { data: member } = await admin
      .from("club_members")
      .select("id")
      .eq("club_id", device.club_id)
      .eq("user_id", userId)
      .maybeSingle();

    const turnOn = action === "on" || action === "pulse";
    const autoOffSeconds =
      action === "pulse"
        ? Math.max(1, Math.round(Number(device.pulse_ms ?? 3000) / 1000))
        : action === "on" && device.auto_off_minutes
        ? Number(device.auto_off_minutes) * 60
        : null;

    const raw = await setShellyRelay({ ...shelly, on: turnOn, autoOffSeconds });

    // Shelly Cloud rate-limits to ~1 request/second, so verify after a pause.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    let verification = await getDeviceStatus(shelly);
    if (verification.online === false || verification.output !== turnOn) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      verification = await getDeviceStatus(shelly);
    }

    // A pulse is expected to have already expired by the time we look, so its
    // output reading is not a failure signal — only an offline device is.
    const failed =
      verification.online === false ||
      (action !== "pulse" && verification.output !== turnOn);

    await admin.from("access_events").insert({
      club_id: device.club_id,
      club_member_id: member?.id ?? null,
      door_name: device.name,
      event_type: failed ? "device_command_failed" : "device_command",
      occurred_at: new Date().toISOString(),
      raw: {
        device_id,
        category: device.category,
        action,
        shelly_device_id: device.shelly_device_id,
        channel,
        auto_off_seconds: autoOffSeconds,
        online: verification.online,
        output: verification.output,
        response: raw?.slice?.(0, 500) ?? null,
      },
    });

    const errorText = failed
      ? verification.online === false
        ? `"${device.name}" is offline.`
        : `Shelly accepted the command but "${device.name}" did not switch ${turnOn ? "on" : "off"}. Check the configured channel.`
      : null;

    await admin
      .from("club_devices")
      .update({
        last_state: failed ? device.last_state : action === "pulse" ? false : turnOn,
        last_state_at: new Date().toISOString(),
        last_error: errorText,
      })
      .eq("id", device_id);

    if (failed) return json({ error: errorText }, 502);

    return json({
      ok: true,
      state: action === "pulse" ? false : turnOn,
      online: verification.online,
      auto_off_seconds: autoOffSeconds,
    });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
});
