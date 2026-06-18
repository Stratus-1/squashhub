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
// Returns the schedule id (sid) as a string, or null if every API attempt
// failed. We try Gen2 RPC tunnels first (our devices respond to /v2/...),
// then fall back to the Gen1 legacy schedule endpoint.
async function shellyScheduleCreate(args: ShellyScheduleArgs): Promise<string | null> {
  const server = normalizeShellyServer(args.server);
  const channel = Number(args.channel ?? 0);
  const ts = args.timestampSec;

  // Build a one-shot cron timespec for Gen2: "sec min hour day month dow".
  // We pin the exact minute/hour/day/month — the schedule will fire once,
  // then we delete it from the device when the booking changes.
  const fireAt = new Date(ts * 1000);
  // Use UTC components — Shelly Gen2 cron uses the device's local time, but
  // the device clock is normally synced to local tz. The cron we build uses
  // the wall-clock components in the configured zone so the device fires
  // when its own clock matches.
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: COURT_LIGHTS_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(fireAt);
  const get = (t: string) => parseInt(local.find(p => p.type === t)!.value, 10);
  const cron = `0 ${get("minute")} ${get("hour")} ${get("day")} ${get("month")} *`;

  const gen2Params = {
    enable: true,
    timespec: cron,
    calls: [
      {
        method: "Switch.Set",
        params: { id: channel, on: args.turn === "on" },
      },
    ],
  };

  // Wall-clock components in the configured tz (used by form-based endpoints).
  const hh = String(get("hour")).padStart(2, "0");
  const mm = String(get("minute")).padStart(2, "0");
  // Shelly Cloud schedule_actions/create expects weekdays as 7-char bitmask
  // "0000000" (Mon..Sun). For a one-shot we mark today's weekday only.
  const jsDow = new Date(ts * 1000).getUTCDay(); // 0=Sun..6=Sat
  const monIdx = (jsDow + 6) % 7;                // 0=Mon..6=Sun
  const weekdays = "0000000".split("").map((_, i) => i === monIdx ? "1" : "0").join("");

  // Canonical Shelly Cloud "schedule_actions" form — matches what the
  // Shelly Cloud web/app wizard sends ("Create schedule" → weekday + hh:mm
  // + action). One row per call, so we make two: ON at start, OFF at end.
  const baseForm = {
    auth_key: args.authKey,
    id: args.deviceId,
    name: args.name || `booking-${args.turn}`,
    timer_type: "1",            // 1 = recurring weekday (the only mode the cloud accepts)
    timer_time_hhmm: `${hh}:${mm}`,
    timer_weekdays: weekdays,   // Mon..Sun bitmask, only one bit set
    channel: String(channel),
    turn: args.turn,
    enabled: "true",
  };

  const attempts: Array<{ url: string; init: RequestInit; pick: (j: any) => any }> = [
    // 1) Shelly Cloud Control API — schedule_actions/create (what the cloud UI uses)
    {
      url: `${server}/device/schedule_actions/create`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(baseForm),
      },
      pick: (j) => j?.data?.id ?? j?.data?.sid ?? j?.id ?? j?.sid,
    },
    // 2) Same but scoped under /device/relay (some firmwares require it)
    {
      url: `${server}/device/relay/schedule_actions/create`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(baseForm),
      },
      pick: (j) => j?.data?.id ?? j?.data?.sid ?? j?.id ?? j?.sid,
    },
    // 3) Gen2 cloud RPC tunnel — Schedule.Create (newer Plus/Pro devices)
    {
      url: `${server}/v2/devices/api/rpc?auth_key=${encodeURIComponent(args.authKey)}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: args.deviceId,
          method: "Schedule.Create",
          params: gen2Params,
        }),
      },
      pick: (j) => j?.data?.id ?? j?.result?.id ?? j?.id,
    },
    // 4) Legacy Gen1 one-shot schedule (epoch timestamp)
    {
      url: `${server}/device/schedule/create`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          auth_key: args.authKey,
          id: args.deviceId,
          channel: String(channel),
          turn: args.turn,
          timestamp: String(ts),
          enabled: "true",
          repeat: "0",
          name: args.name || `booking-${args.turn}`,
        }),
      },
      pick: (j) => j?.data?.id ?? j?.data?.sid ?? j?.id ?? j?.sid,
    },
  ];



  for (const attempt of attempts) {
    try {
      const resp = await fetch(attempt.url, attempt.init);
      const text = await resp.text();
      if (!resp.ok) {
        console.warn("Shelly schedule attempt HTTP error:", attempt.url, resp.status, text);
        continue;
      }
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* non-json */ }
      if (parsed?.isok === false) {
        console.warn("Shelly schedule attempt rejected:", attempt.url, text);
        continue;
      }
      const sid = attempt.pick(parsed);
      if (sid != null) {
        console.log("Shelly schedule created:", attempt.url, "sid=", sid);
        return String(sid);
      }
      console.warn("Shelly schedule attempt: no sid in response:", attempt.url, text);
    } catch (e) {
      console.warn("Shelly schedule attempt threw:", attempt.url, (e as Error).message);
    }
  }
  return null;
}


async function shellyScheduleDelete(opts: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  scheduleId: string;
}): Promise<void> {
  const server = normalizeShellyServer(opts.server);

  const attempts: Array<{ url: string; init: RequestInit }> = [
    // Shelly Cloud — schedule_actions/delete (matches schedule_actions/create)
    {
      url: `${server}/device/schedule_actions/delete`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          auth_key: opts.authKey,
          id: opts.deviceId,
          schedule_action_id: opts.scheduleId,
        }),
      },
    },
    // Gen2 RPC tunnel
    {
      url: `${server}/v2/devices/api/rpc?auth_key=${encodeURIComponent(opts.authKey)}`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: opts.deviceId,
          method: "Schedule.Delete",
          params: { id: Number.isNaN(Number(opts.scheduleId)) ? opts.scheduleId : Number(opts.scheduleId) },
        }),
      },
    },
    // Gen1 legacy
    {
      url: `${server}/device/schedule/delete`,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          auth_key: opts.authKey,
          id: opts.deviceId,
          sid: opts.scheduleId,
        }),
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const resp = await fetch(attempt.url, attempt.init);
      if (resp.ok) {
        const t = await resp.text();
        let parsed: any = null;
        try { parsed = JSON.parse(t); } catch { /* ignore */ }
        if (parsed?.isok !== false) return; // success
        console.warn("Shelly schedule/delete rejected:", attempt.url, t);
      } else {
        const t = await resp.text();
        console.warn("Shelly schedule/delete HTTP error:", attempt.url, resp.status, t);
      }
    } catch (e) {
      console.warn("Shelly schedule/delete threw:", attempt.url, (e as Error).message);
    }
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
