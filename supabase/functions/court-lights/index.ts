import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function localDateAndTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COURT_LIGHTS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

async function setShellyRelay(params: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel?: number | string | null;
  turn: "on" | "off";
  toggleAfterSeconds?: number | null;
}) {
  const shellyServer = normalizeShellyServer(params.server);
  const channel = Number(params.channel ?? 0);
  const on = params.turn === "on";
  const toggleAfter = on && params.toggleAfterSeconds
    ? Math.max(1, Math.round(params.toggleAfterSeconds))
    : undefined;
  const v2Body = {
    id: params.deviceId,
    channel,
    on,
    ...(toggleAfter ? { toggle_after: toggleAfter } : {}),
  };

  const errors: string[] = [];
  const v2Attempts = [
    { label: "v2 switch", path: "/v2/devices/api/set/switch" },
    { label: "v2 light", path: "/v2/devices/api/set/light" },
  ];

  for (const attempt of v2Attempts) {
    const response = await fetch(`${shellyServer}${attempt.path}?auth_key=${encodeURIComponent(params.authKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v2Body),
    });
    const detail = await response.text();
    if (response.ok) {
      try {
        const parsed = JSON.parse(detail);
        const failedCommands = parsed?.failedCommands;
        if (failedCommands && Object.keys(failedCommands).length > 0) {
          errors.push(`${attempt.label}: (200) ${detail}`);
          continue;
        }
        if (parsed?.isok === false || parsed?.error) {
          errors.push(`${attempt.label}: (200) ${detail}`);
          continue;
        }
      } catch {
        // Empty / non-JSON bodies are valid for Shelly Cloud v2 success.
      }
      return detail || `${attempt.label} ok`;
    }
    errors.push(`${attempt.label}: (${response.status}) ${detail || response.statusText}`);
  }

  const legacyBody = (kind: "relay" | "light") => new URLSearchParams({
    auth_key: params.authKey,
    id: params.deviceId,
    channel: String(channel),
    turn: params.turn,
    ...(toggleAfter && kind === "relay" ? { timer: String(toggleAfter) } : {}),
  });

  const legacyAttempts = [
    { label: "legacy relay", path: "/device/relay/control", body: legacyBody("relay") },
    { label: "legacy light", path: "/device/light/control", body: legacyBody("light") },
  ];

  for (const attempt of legacyAttempts) {
    const response = await fetch(`${shellyServer}${attempt.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: attempt.body,
    });
    const detail = await response.text();
    if (response.ok) {
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.isok === false) {
          const errorDetail = typeof parsed.errors === "string" ? parsed.errors : JSON.stringify(parsed.errors ?? parsed);
          errors.push(`${attempt.label}: rejected ${errorDetail}`);
          continue;
        }
      } catch {
        // Empty / non-JSON bodies are valid for Shelly legacy success.
      }
      return detail || `${attempt.label} ok`;
    }
    errors.push(`${attempt.label}: (${response.status}) ${detail || response.statusText}`);
  }

  throw new Error(`Shelly ${params.turn} failed. ${errors.join("; ")}`);
}

async function setShellyAutoOff(params: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel?: number | string | null;
  delaySeconds: number;
}) {
  try {
    // Shelly Cloud v2 supports one-shot auto-off via `toggle_after` on the
    // same set/switch or set/light command. The old RPC tunnel is not exposed
    // on all cloud hosts, so this helper intentionally avoids a second call.
    return params.delaySeconds > 0;
  } catch (e) {
    console.warn("Shelly auto-off skipped:", (e as Error).message);
    return false;
  }
}

async function clearShellyAutoOff(_params: {
  server?: string | null;
  authKey: string;
  deviceId: string;
  channel?: number | string | null;
}) {
  return true;
}

function minutesFromMidnight(timeStr: string): number {
  const h = parseInt(timeStr.slice(0, 2), 10);
  const m = parseInt(timeStr.slice(3, 5), 10);
  return h * 60 + m;
}

/** Remaining seconds from now until end_time in the configured timezone. */
function bookingRemainingSeconds(dateStr: string, endTimeStr: string): number {
  const { time: currentTimeStr } = localDateAndTime(new Date());
  const nowMin = minutesFromMidnight(currentTimeStr);
  const endMin = minutesFromMidnight(endTimeStr);
  const remainingMin = endMin - nowMin;
  return Math.max(1, remainingMin) * 60;
}

/**
 * Court Lights Edge Function
 *
 * Scheduled mode:
 *   1. Turn ON lights for courts whose booking (with lights_requested) is starting now
 *      → creates a light_session record
 *   2. Turn OFF lights for courts whose booking just ended
 *      → closes the light_session, calculates fee, deducts from credit
 *
 * User action mode (POST with action body):
 *   - action: "terminate"  → end the current light session early
 *   - action: "transfer"   → end current session, start new one on target court
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Check if this is a user action or a scheduled call
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // No body = scheduled call
  }

  const action = body?.action;

  // ── User actions: terminate, transfer, or turn_on ──
  if (action === "terminate" || action === "transfer" || action === "turn_on") {
    // Verify the user via Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // ── turn_on: create a light session for an active booking ──
    if (action === "turn_on") {
      const bookingId = body.booking_id;
      if (!bookingId) {
        return new Response(JSON.stringify({ error: "booking_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify booking belongs to user and is active
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("id, court_id, user_id, date, start_time, end_time, status")
        .eq("id", bookingId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (bErr || !booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get club info for fee
      const { data: courtInfo } = await supabase
        .from("courts")
        .select("id, club_id, relay_device_id, relay_server, relay_channel, clubs(light_fee_per_hour)")
        .eq("id", booking.court_id)
        .maybeSingle();

      const club = (courtInfo as any)?.clubs;
      const feePerHour = club?.light_fee_per_hour ?? 0;
      const clubId = courtInfo?.club_id;

      // Get shelly auth key from club_secrets
      const { data: secretsData } = clubId ? await supabase.from("club_secrets").select("shelly_auth_key").eq("club_id", clubId).maybeSingle() : { data: null };
      const authKey = secretsData?.shelly_auth_key;
      if (!courtInfo?.relay_device_id) {
        return new Response(JSON.stringify({ error: "No Shelly device ID configured for this court" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!authKey) {
        return new Response(JSON.stringify({ error: "No Shelly cloud key configured for this club" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let shellyResult = "";
      try {
        const remainingSec = bookingRemainingSeconds(booking.date, booking.end_time);
        shellyResult = await setShellyRelay({
          server: (courtInfo as any).relay_server,
          authKey,
          deviceId: courtInfo.relay_device_id,
          channel: (courtInfo as any).relay_channel,
          turn: "on",
          toggleAfterSeconds: remainingSec,
        });
        // Set the device's auto-off timer so the Shelly turns itself off
        // at the end of the booking even if our cron misses the window.
        await setShellyAutoOff({
          server: (courtInfo as any).relay_server,
          authKey,
          deviceId: courtInfo.relay_device_id,
          channel: (courtInfo as any).relay_channel,
          delaySeconds: remainingSec,
        });
      } catch (e: any) {
        console.error("Shelly turn_on failed:", e);
        return new Response(JSON.stringify({ error: e.message || "Shelly did not confirm the lights switched on" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark lights_requested
      await supabase.from("bookings").update({ lights_requested: true }).eq("id", bookingId);

      // Create the session
      const { data: newSession, error: insErr } = await supabase
        .from("light_sessions")
        .insert({
          booking_id: bookingId,
          court_id: booking.court_id,
          user_id: userId,
          club_id: clubId,
          fee_per_hour: feePerHour,
          status: "active",
        })
        .select("id")
        .single();

      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ result: "lights_on", session_id: newSession.id, relay_detail: shellyResult }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── terminate / transfer require session_id ──
    const sessionId = body.session_id;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the active session (use service role to ensure we can read it)
    const { data: session, error: sessErr } = await supabase
      .from("light_sessions")
      .select("*, courts(name, relay_device_id, relay_server, relay_channel, club_id)")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found or not active" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const court = (session as any).courts;
    const courtClubId = court?.club_id;
    const { data: courtSecrets } = courtClubId ? await supabase.from("club_secrets").select("shelly_auth_key").eq("club_id", courtClubId).maybeSingle() : { data: null };
    const authKey = courtSecrets?.shelly_auth_key;

    // Turn off lights on current court
    if (court?.relay_device_id && authKey) {
      try {
        await setShellyRelay({ server: court.relay_server, authKey, deviceId: court.relay_device_id, channel: court.relay_channel, turn: "off" });
        // Reset auto-off so a future manual toggle doesn't inherit an old delay.
        await clearShellyAutoOff({ server: court.relay_server, authKey, deviceId: court.relay_device_id, channel: court.relay_channel });
      } catch (e) {
        console.error("Failed to turn off relay:", e);
      }
    }

    // Close session and calculate fee
    const now = new Date();
    const startedAt = new Date(session.started_at);
    const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));
    const feePerHour = Number(session.fee_per_hour) || 0;
    const feeCharged = Math.round(((durationMinutes / 60) * feePerHour) * 100) / 100;

    await supabase
      .from("light_sessions")
      .update({
        ended_at: now.toISOString(),
        duration_minutes: durationMinutes,
        fee_charged: feeCharged,
        status: "completed",
      })
      .eq("id", sessionId);

    // Deduct fee from member credit (with split support)
    if (feeCharged > 0) {
      // Check booking for fee split preference
      const { data: bookingData } = await supabase
        .from("bookings")
        .select("light_fee_split, club_member_id, opponent_member_id, user_id, opponent_id, date, start_time, court_id")
        .eq("id", session.booking_id)
        .maybeSingle();

      // Check if this booking belongs to a club event with attendee splitting
      // Check if this booking belongs to a club event:
      // - "attendees" split → database trigger handles distribution, skip here
      // - "none" split → club covers fees, no one is charged, skip here
      let isEventSplit = false;
      if (bookingData && session.club_id) {
        const { data: eventMatch } = await supabase
          .from("club_events")
          .select("id, light_fee_split")
          .eq("club_id", session.club_id)
          .eq("status", "active")
           .in("light_fee_split", ["attendees", "none"])
          .eq("start_time", (bookingData as any).start_time)
          .limit(1);
        if (eventMatch && eventMatch.length > 0) {
          // Verify court match via club_event_courts
          const { data: courtMatch } = await supabase
            .from("club_event_courts")
            .select("id")
            .eq("event_id", eventMatch[0].id)
            .eq("court_id", (bookingData as any).court_id)
            .limit(1);
          isEventSplit = !!(courtMatch && courtMatch.length > 0);
        }
      }

      if (!isEventSplit) {
        const feeSplit = (bookingData as any)?.light_fee_split || "booker";
        const opponentMemberId = (bookingData as any)?.opponent_member_id;

        if (feeSplit === "shared" && opponentMemberId) {
          const halfFee = Math.round((feeCharged / 2) * 100) / 100;
          const bookerFee = feeCharged - halfFee;
          const bookerMemberId = (bookingData as any)?.club_member_id;

          await supabase.from("member_credit_transactions").insert({
            user_id: userId,
            club_id: session.club_id,
            club_member_id: bookerMemberId || null,
            amount: bookerFee,
            type: "credit",
            method: "system",
            status: "confirmed",
            confirmed_at: now.toISOString(),
            description: `Court lights (50%) – ${durationMinutes}min on ${court?.name || `Court ${session.court_id}`}`,
            reference: session.booking_id,
          });

          let opponentUserId = (bookingData as any)?.opponent_id;
          if (!opponentUserId) {
            const { data: oppMember } = await supabase
              .from("club_members")
              .select("user_id")
              .eq("id", opponentMemberId)
              .maybeSingle();
            opponentUserId = oppMember?.user_id;
          }

          await supabase.from("member_credit_transactions").insert({
            user_id: opponentUserId || userId,
            club_id: session.club_id,
            club_member_id: opponentMemberId,
            amount: halfFee,
            type: "credit",
            method: "system",
            status: "confirmed",
            confirmed_at: now.toISOString(),
            description: `Court lights (50%) – ${durationMinutes}min on ${court?.name || `Court ${session.court_id}`}`,
            reference: session.booking_id,
          });
        } else {
          const bookerMemberId = (bookingData as any)?.club_member_id;
          await supabase.from("member_credit_transactions").insert({
            user_id: userId,
            club_id: session.club_id,
            club_member_id: bookerMemberId || null,
            amount: feeCharged,
            type: "credit",
            method: "system",
            status: "confirmed",
            confirmed_at: now.toISOString(),
            description: `Court lights – ${durationMinutes}min on ${court?.name || `Court ${session.court_id}`}`,
            reference: session.booking_id,
          });
        }
      }
      // else: event split — trigger handles fee distribution
    }

    // If transfer, start new session on target court
    if (action === "transfer") {
      const targetCourtId = body.target_court_id;
      if (!targetCourtId) {
        return new Response(JSON.stringify({ error: "target_court_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get target court info
      const { data: targetCourt } = await supabase
        .from("courts")
        .select("id, relay_device_id, relay_server, relay_channel, club_id")
        .eq("id", targetCourtId)
        .maybeSingle();

      if (!targetCourt) {
        return new Response(JSON.stringify({ error: "Target court not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cross-tenant guard: target court must belong to the same club as the active session
      if (targetCourt.club_id !== session.club_id) {
        return new Response(JSON.stringify({ error: "Target court is not in your club" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetClubId = targetCourt?.club_id;
      const { data: targetSecrets } = targetClubId ? await supabase.from("club_secrets").select("shelly_auth_key").eq("club_id", targetClubId).maybeSingle() : { data: null };
      const targetAuthKey = targetSecrets?.shelly_auth_key;

      // Turn on lights on target court
      if (targetCourt.relay_device_id && targetAuthKey) {
        await setShellyRelay({ server: targetCourt.relay_server, authKey: targetAuthKey, deviceId: targetCourt.relay_device_id, channel: (targetCourt as any).relay_channel, turn: "on" });
      }

      // Update booking to new court
      await supabase
        .from("bookings")
        .update({ court_id: targetCourtId })
        .eq("id", session.booking_id);

      // Create new light session on target court
      await supabase.from("light_sessions").insert({
        booking_id: session.booking_id,
        court_id: targetCourtId,
        user_id: userId,
        club_id: session.club_id,
        fee_per_hour: feePerHour,
        status: "active",
      });

      return new Response(
        JSON.stringify({
          result: "transferred",
          old_court: session.court_id,
          new_court: targetCourtId,
          fee_charged: feeCharged,
          duration_minutes: durationMinutes,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        result: "terminated",
        fee_charged: feeCharged,
        duration_minutes: durationMinutes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ── Scheduled mode: check all courts ──
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

  try {
    const now = new Date();
    const { date: todayStr, time: currentTimeStr } = localDateAndTime(now);

    // Load every court — including ones without a physical Shelly relay, so we
    // can still close light sessions (and charge fees) when their booking has
    // ended. Courts without a relay simply skip the hardware call.
    const { data: courts, error: courtsErr } = await supabase
      .from("courts")
      .select("id, name, relay_device_id, relay_server, relay_channel, club_id, clubs(light_fee_per_hour)");

    if (courtsErr) throw courtsErr;
    if (!courts || courts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No courts configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all club secrets for courts that have clubs
    const clubIds = [...new Set(courts.map((c: any) => c.club_id).filter(Boolean))];
    const { data: allSecrets } = clubIds.length > 0
      ? await supabase.from("club_secrets").select("club_id, shelly_auth_key").in("club_id", clubIds)
      : { data: [] };
    const secretsMap = new Map<string, string>();
    for (const s of (allSecrets || [])) {
      if (s.shelly_auth_key) secretsMap.set(s.club_id, s.shelly_auth_key);
    }

    const courtIds = courts.map((c: any) => c.id);

    // Get today's active bookings and champs matches.
    // Note: we deliberately do NOT filter bookings by lights_requested here.
    // Once an active light_session exists for a court (created either by an
    // automatic on-trigger or a manual turn_on), the booking that covers the
    // current time is what tells us whether the session should still be
    // running. Otherwise sessions started manually on bookings that never
    // flagged lights_requested would never be closed automatically.
    const [{ data: bookings, error: bookErr }, { data: champsMatches, error: champsErr }, { data: activeSessions, error: sessErr }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, court_id, start_time, end_time, user_id, lights_requested")
        .eq("date", todayStr)
        .eq("status", "active")
        .in("court_id", courtIds),
      supabase
        .from("club_champs_matches")
        .select("id, court_id, scheduled_time")
        .eq("scheduled_date", todayStr)
        .eq("status", "scheduled")
        .in("court_id", courtIds),
      supabase
        .from("light_sessions")
        .select("id, booking_id, court_id, user_id, started_at, status, club_id, fee_per_hour")
        .eq("status", "active"),
    ]);

    if (bookErr) throw bookErr;
    if (champsErr) throw champsErr;
    if (sessErr) throw sessErr;

    const activeSessionMap = new Map<number, any>();
    for (const s of (activeSessions || [])) {
      activeSessionMap.set(s.court_id, s);
    }

    const results: any[] = [];

    for (const court of courts) {
      const authKey = court.club_id ? secretsMap.get(court.club_id) : undefined;
      const feePerHour = Number((court as any).clubs?.light_fee_per_hour) || 0;
      const hasRelay = !!court.relay_device_id && !!authKey;

      const courtBookings = (bookings || []).filter((b: any) => b.court_id === court.id);
      const courtChamps = (champsMatches || []).filter((m: any) => m.court_id === court.id);


      // Find the active booking that covers the current time
      const activeBooking = courtBookings.find((b: any) => {
        const start = b.start_time.slice(0, 5);
        const end = b.end_time.slice(0, 5);
        return currentTimeStr >= start && currentTimeStr < end;
      });

      const hasActiveChamps = courtChamps.some((m: any) => {
        if (!m.scheduled_time) return false;
        const start = m.scheduled_time.slice(0, 5);
        const startMin = parseInt(start.split(":")[0]) * 60 + parseInt(start.split(":")[1]);
        const endMin = startMin + 30;
        const endStr = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
        return currentTimeStr >= start && currentTimeStr < endStr;
      });

      // Auto-on only when the booker opted in (lights_requested). Champs matches
      // always auto-on. Auto-off (below) runs regardless so manually started
      // sessions still close when their booking ends.
      const autoOnWanted = (!!activeBooking && activeBooking.lights_requested === true) || hasActiveChamps;
      const shouldBeOn = !!activeBooking || hasActiveChamps; // for off-decision
      const existingSession = activeSessionMap.get(court.id);
      const deviceId = court.relay_device_id;

      try {
        if (autoOnWanted && !existingSession) {

          // Turn ON and create light session. If the court has no physical
          // relay configured (or no Shelly auth key), we still create the
          // session so usage / billing is tracked.
          let shellyResult = "no-relay";
          let relayOk = true;
          if (hasRelay) {
            const remainingSec = activeBooking ? bookingRemainingSeconds(activeBooking.date, activeBooking.end_time) : undefined;
            shellyResult = await setShellyRelay({ server: court.relay_server, authKey: authKey!, deviceId: deviceId!, channel: (court as any).relay_channel, turn: "on", toggleAfterSeconds: remainingSec });
            // Use the device's auto-off timer so the Shelly turns itself off at
            // the end of the booking even if our cron misses the turn-off window.
            if (activeBooking) {
              await setShellyAutoOff({
                server: court.relay_server,
                authKey: authKey!,
                deviceId: deviceId!,
                channel: (court as any).relay_channel,
                delaySeconds: remainingSec,
              });
            }
          }

          if (activeBooking) {
            await supabase.from("light_sessions").insert({
              booking_id: activeBooking.id,
              court_id: court.id,
              user_id: activeBooking.user_id,
              club_id: court.club_id,
              fee_per_hour: feePerHour,
              status: "active",
            });
          }

          results.push({
            court: court.name,
            action: "on",
            status: relayOk ? "success" : "error",
            detail: shellyResult,
            session_created: !!activeBooking,
          });
        } else if (!shouldBeOn && existingSession) {
          // Turn OFF (if a relay exists) and close the session with the fee.
          let shellyResult = "no-relay";
          let relayOk = true;
          if (hasRelay) {
            shellyResult = await setShellyRelay({ server: court.relay_server, authKey: authKey!, deviceId: deviceId!, channel: (court as any).relay_channel, turn: "off" });
            // Reset auto-off so a future manual toggle doesn't inherit an old delay.
            await clearShellyAutoOff({
              server: court.relay_server,
              authKey: authKey!,
              deviceId: deviceId!,
              channel: (court as any).relay_channel,
            });
          }


          // Calculate fee based on actual usage
          const startedAt = new Date(existingSession.started_at);
          const durationMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));
          const feeCharged = Math.round(((durationMinutes / 60) * feePerHour) * 100) / 100;

          await supabase
            .from("light_sessions")
            .update({
              ended_at: now.toISOString(),
              duration_minutes: durationMinutes,
              fee_charged: feeCharged,
              status: "completed",
            })
            .eq("id", existingSession.id);

          // Deduct from member credit (with split support)
          if (feeCharged > 0) {
            const { data: bookingData } = await supabase
              .from("bookings")
              .select("light_fee_split, club_member_id, opponent_member_id, user_id, opponent_id, start_time, court_id")
              .eq("id", existingSession.booking_id)
              .maybeSingle();

            // Check if this is a club event booking:
            // - "attendees" split → trigger handles it
            // - "none" split → club covers, no charges
            let isEventSplit = false;
            if (bookingData && court.club_id) {
              const { data: eventMatch } = await supabase
                .from("club_events")
                .select("id, light_fee_split")
                .eq("club_id", court.club_id)
                .eq("status", "active")
                .in("light_fee_split", ["attendees", "none"])
                .eq("start_time", (bookingData as any).start_time)
                .limit(1);
              if (eventMatch && eventMatch.length > 0) {
                const { data: courtMatch } = await supabase
                  .from("club_event_courts")
                  .select("id")
                  .eq("event_id", eventMatch[0].id)
                  .eq("court_id", court.id)
                  .limit(1);
                isEventSplit = !!(courtMatch && courtMatch.length > 0);
              }
            }

            if (!isEventSplit) {
              const feeSplit = (bookingData as any)?.light_fee_split || "booker";
              const opponentMemberId = (bookingData as any)?.opponent_member_id;

              if (feeSplit === "shared" && opponentMemberId) {
                const halfFee = Math.round((feeCharged / 2) * 100) / 100;
                const bookerFee = feeCharged - halfFee;
                const bookerMemberId = (bookingData as any)?.club_member_id;

                await supabase.from("member_credit_transactions").insert({
                  user_id: existingSession.user_id,
                  club_id: existingSession.club_id,
                  club_member_id: bookerMemberId || null,
                  amount: bookerFee,
                  type: "credit",
                  method: "system",
                  status: "confirmed",
                  confirmed_at: now.toISOString(),
                  description: `Court lights (50%) – ${durationMinutes}min on ${court.name}`,
                  reference: existingSession.booking_id,
                });

                let opponentUserId = (bookingData as any)?.opponent_id;
                if (!opponentUserId) {
                  const { data: oppMember } = await supabase
                    .from("club_members")
                    .select("user_id")
                    .eq("id", opponentMemberId)
                    .maybeSingle();
                  opponentUserId = oppMember?.user_id;
                }

                await supabase.from("member_credit_transactions").insert({
                  user_id: opponentUserId || existingSession.user_id,
                  club_id: existingSession.club_id,
                  club_member_id: opponentMemberId,
                  amount: halfFee,
                  type: "credit",
                  method: "system",
                  status: "confirmed",
                  confirmed_at: now.toISOString(),
                  description: `Court lights (50%) – ${durationMinutes}min on ${court.name}`,
                  reference: existingSession.booking_id,
                });
              } else {
                const bookerMemberId = (bookingData as any)?.club_member_id;
                await supabase.from("member_credit_transactions").insert({
                  user_id: existingSession.user_id,
                  club_id: existingSession.club_id,
                  club_member_id: bookerMemberId || null,
                  amount: feeCharged,
                  type: "credit",
                  method: "system",
                  status: "confirmed",
                  confirmed_at: now.toISOString(),
                  description: `Court lights – ${durationMinutes}min on ${court.name}`,
                  reference: existingSession.booking_id,
                });
              }
            }
            // else: event split — trigger handles fee distribution
          }

          results.push({
            court: court.name,
            action: "off",
            status: relayOk ? "success" : "error",
            detail: shellyResult,
            fee_charged: feeCharged,
            duration_minutes: durationMinutes,
          });
        } else if (autoOnWanted && existingSession) {
          // Already on, keep going
          results.push({ court: court.name, action: "on", status: "already_active" });
        } else {
          // Either no booking, or booking doesn't want auto-on. Nothing to do.
          results.push({ court: court.name, action: "idle", status: "ok" });
        }
      } catch (relayErr: any) {
        results.push({
          court: court.name,
          device: deviceId,
          action: autoOnWanted ? "on" : "off",

          status: "error",
          detail: relayErr.message,
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Court lights error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
