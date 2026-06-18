// Court Lights Schedule sync to Shelly Cloud.
//
// Called by a Postgres trigger (pg_net) on booking INSERT / UPDATE / DELETE.
// For action="sync"   → (re)creates an ON and OFF one-shot schedule on the
//                       Shelly device that matches the booking's start/end.
// For action="delete" → removes any existing Shelly schedules tied to the
//                       booking.
//
// Auth: the trigger sends the platform internal secret in `x-internal-secret`
// (same secret used by the existing court-lights cron). No JWT required.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const DEFAULT_SHELLY_SERVER = "https://shelly-44-eu.shelly.cloud";
const COURT_LIGHTS_TIMEZONE = Deno.env.get("COURT_LIGHTS_TIMEZONE") || "Africa/Johannesburg";

function normalizeShellyServer(value?: string | null) {
  const raw = (value || DEFAULT_SHELLY_SERVER).trim();
  const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
  const extracted = (urlMatch?.[0] || raw)
    .replace(/^server\s*:\s*/i, "")
    .replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(extracted)) return DEFAULT_SHELLY_SERVER;
  return extracted;
}

// Compute the UTC unix epoch (seconds) for a wall-clock date+time in the
// configured timezone. Works for fixed-offset zones (Africa/Johannesburg) and
// for any IANA zone — we derive the offset from Intl on that date.
function localToUnix(dateStr: string, timeStr: string): number {
  // Use a probe Date at the wall-clock moment to figure out the timezone offset.
  // Simpler & robust for SAST: it's a fixed UTC+2 zone year-round.
  const probe = new Date(`${dateStr}T${timeStr.slice(0, 5)}:00Z`);
  const tzString = new Intl.DateTimeFormat("en-US", {
    timeZone: COURT_LIGHTS_TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(probe).find(p => p.type === "timeZoneName")?.value || "GMT+2";
  // tzString examples: "GMT+2", "GMT+02:00"
  const m = tzString.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let offsetMinutes = 120;
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    const h = parseInt(m[2], 10);
    const mm = m[3] ? parseInt(m[3], 10) : 0;
    offsetMinutes = sign * (h * 60 + mm);
  }
  const utcMs = Date.UTC(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(5, 7), 10) - 1,
    parseInt(dateStr.slice(8, 10), 10),
    parseInt(timeStr.slice(0, 2), 10),
    parseInt(timeStr.slice(3, 5), 10),
    0,
  ) - offsetMinutes * 60_000;
  return Math.floor(utcMs / 1000);
}

type ShellyScheduleArgs = {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel?: number | string | null;
  turn: "on" | "off";
  timestampSec: number;
  name?: string;
};

// Create a one-shot schedule on a Shelly device via Shelly Cloud.
// Returns the schedule id (sid) as a string, or null if the API rejected it.
async function shellyScheduleCreate(args: ShellyScheduleArgs): Promise<string | null> {
  const server = normalizeShellyServer(args.server);
  const channel = String(Number(args.channel ?? 0));

  // Legacy / Gen1 cloud endpoint — supported by every Shelly device on the
  // cloud, including newer ones routed through the Gen1 compatibility layer.
  const form = new URLSearchParams({
    auth_key: args.authKey,
    id: args.deviceId,
    channel,
    turn: args.turn,
    timestamp: String(args.timestampSec),
    enabled: "true",
    repeat: "0", // one-shot
    name: args.name || `booking-${args.turn}`,
  });

  const resp = await fetch(`${server}/device/schedule/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error("Shelly schedule/create HTTP error:", resp.status, text);
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed?.isok === false) {
      console.error("Shelly schedule/create rejected:", text);
      return null;
    }
    // Response shape varies; try common id locations.
    const sid =
      parsed?.data?.id ??
      parsed?.data?.sid ??
      parsed?.id ??
      parsed?.sid ??
      parsed?.data?.schedule?.id;
    return sid != null ? String(sid) : null;
  } catch {
    console.error("Shelly schedule/create non-JSON response:", text);
    return null;
  }
}

async function shellyScheduleDelete(opts: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  scheduleId: string;
}): Promise<void> {
  const server = normalizeShellyServer(opts.server);
  const form = new URLSearchParams({
    auth_key: opts.authKey,
    id: opts.deviceId,
    sid: opts.scheduleId,
  });
  try {
    const resp = await fetch(`${server}/device/schedule/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.warn("Shelly schedule/delete failed:", resp.status, t);
    }
  } catch (e) {
    console.warn("Shelly schedule/delete error:", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Auth: internal secret only
  const internalSecret = req.headers.get("x-internal-secret");
  const { data: secretRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "lights_private_internal_secret")
    .maybeSingle();
  if (!secretRow || secretRow.value !== internalSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const action: "sync" | "delete" | undefined = body?.action;
  const bookingId: string | undefined = body?.booking_id;
  if (!action || !bookingId) {
    return new Response(JSON.stringify({ error: "action and booking_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve court + secrets. For delete we may not have a booking row anymore,
  // so fall back to the payload-provided court_id / schedule ids.
  const payloadCourtId: number | undefined = body?.court_id;
  const payloadOnId: string | null | undefined = body?.schedule_on_id;
  const payloadOffId: string | null | undefined = body?.schedule_off_id;

  let booking: any = null;
  if (action === "sync") {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, court_id, club_id, date, start_time, end_time, status, shelly_schedule_on_id, shelly_schedule_off_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    booking = data;
    if (!booking || booking.status !== "active") {
      // Treat missing / non-active booking as a delete request.
    }
  }

  const courtId = booking?.court_id ?? payloadCourtId;
  if (!courtId) {
    return new Response(JSON.stringify({ result: "no-op", reason: "no court" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: court } = await supabase
    .from("courts")
    .select("id, club_id, relay_device_id, relay_server, relay_channel")
    .eq("id", courtId)
    .maybeSingle();

  // No relay configured → nothing to schedule. Clear any stale ids on the row.
  if (!court?.relay_device_id) {
    if (booking?.shelly_schedule_on_id || booking?.shelly_schedule_off_id) {
      await supabase.from("bookings")
        .update({ shelly_schedule_on_id: null, shelly_schedule_off_id: null })
        .eq("id", bookingId);
    }
    return new Response(JSON.stringify({ result: "no-op", reason: "no relay on court" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clubId = court.club_id;
  const { data: secrets } = clubId
    ? await supabase.from("club_secrets").select("shelly_auth_key").eq("club_id", clubId).maybeSingle()
    : { data: null };
  const authKey: string | undefined = secrets?.shelly_auth_key;
  if (!authKey) {
    return new Response(JSON.stringify({ result: "no-op", reason: "no shelly auth key" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Always remove any existing schedules for this booking before (re)creating.
  const existingOn = booking?.shelly_schedule_on_id ?? payloadOnId ?? null;
  const existingOff = booking?.shelly_schedule_off_id ?? payloadOffId ?? null;
  if (existingOn) {
    await shellyScheduleDelete({
      server: court.relay_server, authKey, deviceId: court.relay_device_id, scheduleId: existingOn,
    });
  }
  if (existingOff) {
    await shellyScheduleDelete({
      server: court.relay_server, authKey, deviceId: court.relay_device_id, scheduleId: existingOff,
    });
  }

  // Delete or non-active booking → just clear and return.
  if (action === "delete" || !booking || booking.status !== "active") {
    if (booking) {
      await supabase.from("bookings")
        .update({ shelly_schedule_on_id: null, shelly_schedule_off_id: null })
        .eq("id", bookingId);
    }
    return new Response(JSON.stringify({ result: "deleted" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sync: create fresh on/off schedules.
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = localToUnix(booking.date, booking.start_time);
  const endSec = localToUnix(booking.date, booking.end_time);

  // If the booking is fully in the past, nothing to schedule.
  if (endSec <= nowSec) {
    await supabase.from("bookings")
      .update({ shelly_schedule_on_id: null, shelly_schedule_off_id: null })
      .eq("id", bookingId);
    return new Response(JSON.stringify({ result: "no-op", reason: "booking in past" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If start has already passed but end hasn't, only schedule the OFF event.
  const onSid = startSec > nowSec
    ? await shellyScheduleCreate({
        server: court.relay_server, authKey, deviceId: court.relay_device_id,
        channel: (court as any).relay_channel, turn: "on", timestampSec: startSec,
        name: `bk-${bookingId.slice(0, 8)}-on`,
      })
    : null;

  const offSid = await shellyScheduleCreate({
    server: court.relay_server, authKey, deviceId: court.relay_device_id,
    channel: (court as any).relay_channel, turn: "off", timestampSec: endSec,
    name: `bk-${bookingId.slice(0, 8)}-off`,
  });

  await supabase.from("bookings")
    .update({
      shelly_schedule_on_id: onSid,
      shelly_schedule_off_id: offSid,
    })
    .eq("id", bookingId);

  return new Response(JSON.stringify({
    result: "synced",
    on_sid: onSid,
    off_sid: offSid,
    start_unix: startSec,
    end_unix: endSec,
  }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
