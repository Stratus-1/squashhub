// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DEFAULT_SHELLY_SERVER = "https://shelly-44-eu.shelly.cloud";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeShellyServer(value?: string | null) {
  const raw = (value || DEFAULT_SHELLY_SERVER).trim();
  const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
  const extracted = (urlMatch?.[0] || raw).replace(/^server\s*:\s*/i, "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(extracted)) return DEFAULT_SHELLY_SERVER;
  return extracted;
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    isoDay: jsDay === 0 ? 7 : jsDay,
    minutes: hour * 60 + minute,
  };
}

function minutesFromTime(value?: string | null) {
  if (!value) return null;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function isDue(nowMinutes: number, targetMinutes: number) {
  const diff = nowMinutes - targetMinutes;
  return diff >= 0 && diff < 5;
}

async function setShellyRelay(params: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel: number;
  on: boolean;
}) {
  const server = normalizeShellyServer(params.server);
  const v2 = await fetch(
    `${server}/v2/devices/api/set/switch?auth_key=${encodeURIComponent(params.authKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: params.deviceId,
        channel: params.channel,
        on: params.on,
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

  const legacy = await fetch(`${server}/device/relay/control`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      auth_key: params.authKey,
      id: params.deviceId,
      channel: String(params.channel),
      turn: params.on ? "on" : "off",
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

  const { data: secretRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "device_schedule_internal_secret")
    .maybeSingle();
  const expected = secretRow?.value;
  const provided = req.headers.get("x-internal-secret");
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || (provided !== expected && bearer !== SERVICE_KEY)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const now = new Date();
  const { data: devices, error } = await admin
    .from("club_devices")
    .select("id, club_id, name, shelly_device_id, shelly_channel, schedule_timezone, schedule_days, schedule_on_time, schedule_off_time, schedule_last_on_key, schedule_last_off_key")
    .eq("category", "gadgets")
    .eq("enabled", true)
    .eq("control_mode", "toggle")
    .eq("provider", "shelly")
    .eq("schedule_enabled", true)
    .not("shelly_device_id", "is", null)
    .not("schedule_on_time", "is", null)
    .not("schedule_off_time", "is", null)
    .limit(100);
  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  for (const device of devices || []) {
    const timezone = device.schedule_timezone || "Africa/Johannesburg";
    const parts = localParts(now, timezone);
    const days: number[] = Array.isArray(device.schedule_days) && device.schedule_days.length
      ? device.schedule_days
      : [1, 2, 3, 4, 5, 6, 7];
    if (!days.includes(parts.isoDay)) continue;

    const onMinutes = minutesFromTime(device.schedule_on_time);
    const offMinutes = minutesFromTime(device.schedule_off_time);
    if (onMinutes == null || offMinutes == null) continue;

    const actions: Array<{ action: "on" | "off"; key: string }> = [];
    if (isDue(parts.minutes, onMinutes) && device.schedule_last_on_key !== parts.dateKey) {
      actions.push({ action: "on", key: parts.dateKey });
    }
    if (isDue(parts.minutes, offMinutes) && device.schedule_last_off_key !== parts.dateKey) {
      actions.push({ action: "off", key: parts.dateKey });
    }
    if (actions.length === 0) {
      await admin.from("club_devices").update({ schedule_last_checked_at: now.toISOString() }).eq("id", device.id);
      continue;
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("shelly_auth_key, shelly_server_url")
      .eq("club_id", device.club_id)
      .maybeSingle();
    if (!secrets?.shelly_auth_key) {
      const lastError = "Shelly auth key is not configured for scheduled gadget control.";
      await admin.from("club_devices").update({
        last_error: lastError,
        schedule_last_checked_at: now.toISOString(),
      }).eq("id", device.id);
      results.push({ device_id: device.id, ok: false, error: lastError });
      continue;
    }

    for (const next of actions) {
      try {
        const raw = await setShellyRelay({
          server: secrets.shelly_server_url,
          authKey: secrets.shelly_auth_key,
          deviceId: device.shelly_device_id,
          channel: Number(device.shelly_channel ?? 0),
          on: next.action === "on",
        });
        await admin.from("club_devices").update({
          last_state: next.action === "on",
          last_state_at: now.toISOString(),
          last_error: null,
          schedule_last_checked_at: now.toISOString(),
          ...(next.action === "on"
            ? { schedule_last_on_key: next.key }
            : { schedule_last_off_key: next.key }),
        }).eq("id", device.id);
        await admin.from("access_events").insert({
          club_id: device.club_id,
          club_member_id: null,
          door_name: device.name,
          event_type: "device_schedule",
          occurred_at: now.toISOString(),
          raw: {
            device_id: device.id,
            category: "gadgets",
            action: next.action,
            shelly_device_id: device.shelly_device_id,
            response: raw?.slice?.(0, 500) ?? null,
          },
        });
        results.push({ device_id: device.id, action: next.action, ok: true });
      } catch (e: any) {
        const message = e?.message || String(e);
        await admin.from("club_devices").update({
          last_error: message,
          schedule_last_checked_at: now.toISOString(),
        }).eq("id", device.id);
        results.push({ device_id: device.id, action: next.action, ok: false, error: message });
      }
    }
  }

  return json({ ok: true, processed: results.length, results });
});
