import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Court Lights Edge Function
 *
 * Called on a schedule (every minute via pg_cron) OR by a user action (terminate / transfer).
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
        .select("id, club_id, relay_device_id, relay_server, clubs(shelly_auth_key, light_fee_per_hour)")
        .eq("id", booking.court_id)
        .maybeSingle();

      const club = (courtInfo as any)?.clubs;
      const feePerHour = club?.light_fee_per_hour ?? 0;
      const clubId = courtInfo?.club_id;

      // Try to turn on the physical relay (skip if not configured)
      const authKey = club?.shelly_auth_key;
      if (courtInfo?.relay_device_id && authKey) {
        const shellyServer = (courtInfo as any).relay_server || "https://shelly-44-eu.shelly.cloud";
        try {
          await fetch(`${shellyServer}/device/relay/control`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              auth_key: authKey,
              id: courtInfo.relay_device_id,
              channel: "0",
              turn: "on",
            }),
          });
        } catch (e) {
          console.error("Shelly relay error (non-fatal):", e);
        }
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
        JSON.stringify({ result: "lights_on", session_id: newSession.id }),
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
      .select("*, courts(relay_device_id, relay_server, club_id, clubs(shelly_auth_key))")
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
    const authKey = court?.clubs?.shelly_auth_key;

    // Turn off lights on current court
    if (court?.relay_device_id && authKey) {
      const shellyServer = court.relay_server || "https://shelly-44-eu.shelly.cloud";
      try {
        await fetch(`${shellyServer}/device/relay/control`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            id: court.relay_device_id,
            auth_key: authKey,
            channel: "0",
            turn: "off",
          }),
        });
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

    // Deduct fee from member credit
    if (feeCharged > 0) {
      await supabase.from("member_credit_transactions").insert({
        user_id: userId,
        club_id: session.club_id,
        amount: -feeCharged,
        type: "debit",
        method: "system",
        status: "confirmed",
        confirmed_at: now.toISOString(),
        description: `Court lights – ${durationMinutes}min on Court ${session.court_id}`,
        reference: session.booking_id,
      });
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
        .select("id, relay_device_id, relay_server, club_id, clubs(shelly_auth_key)")
        .eq("id", targetCourtId)
        .maybeSingle();

      if (!targetCourt) {
        return new Response(JSON.stringify({ error: "Target court not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const targetAuthKey = (targetCourt as any).clubs?.shelly_auth_key;

      // Turn on lights on target court
      if (targetCourt.relay_device_id && targetAuthKey) {
        const shellyServer = targetCourt.relay_server || "https://shelly-44-eu.shelly.cloud";
        try {
          await fetch(`${shellyServer}/device/relay/control`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              id: targetCourt.relay_device_id,
              auth_key: targetAuthKey,
              channel: "0",
              turn: "on",
            }),
          });
        } catch (e) {
          console.error("Failed to turn on target relay:", e);
        }
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
    const todayStr = now.toISOString().slice(0, 10);
    const currentTimeStr = now.toTimeString().slice(0, 5);

    // Get all courts with relays
    const { data: courts, error: courtsErr } = await supabase
      .from("courts")
      .select("id, name, relay_device_id, relay_server, club_id, clubs(shelly_auth_key, light_fee_per_hour)")
      .not("relay_device_id", "is", null);

    if (courtsErr) throw courtsErr;
    if (!courts || courts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No courts with relays configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const courtIds = courts.map((c: any) => c.id);

    // Get today's active bookings WITH lights_requested and champs matches
    const [{ data: bookings, error: bookErr }, { data: champsMatches, error: champsErr }, { data: activeSessions, error: sessErr }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, court_id, start_time, end_time, user_id, lights_requested")
        .eq("date", todayStr)
        .eq("status", "active")
        .eq("lights_requested", true)
        .in("court_id", courtIds),
      supabase
        .from("club_champs_matches")
        .select("id, court_id, scheduled_time")
        .eq("scheduled_date", todayStr)
        .eq("status", "scheduled")
        .in("court_id", courtIds),
      supabase
        .from("light_sessions")
        .select("id, booking_id, court_id, user_id, started_at, status")
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
      const authKey = (court as any).clubs?.shelly_auth_key;
      const feePerHour = Number((court as any).clubs?.light_fee_per_hour) || 0;
      if (!authKey) {
        results.push({ court: court.name, status: "skipped", detail: "No Shelly auth key" });
        continue;
      }

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

      const shouldBeOn = !!activeBooking || hasActiveChamps;
      const existingSession = activeSessionMap.get(court.id);
      const shellyServer = court.relay_server || "https://shelly-44-eu.shelly.cloud";
      const deviceId = court.relay_device_id;

      try {
        if (shouldBeOn && !existingSession) {
          // Turn ON and create light session
          const response = await fetch(`${shellyServer}/device/relay/control`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              id: deviceId!,
              auth_key: authKey,
              channel: "0",
              turn: "on",
            }),
          });
          const shellyResult = await response.text();

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
            status: response.ok ? "success" : "error",
            detail: shellyResult,
            session_created: !!activeBooking,
          });
        } else if (!shouldBeOn && existingSession) {
          // Turn OFF and close session with fee calculation
          const response = await fetch(`${shellyServer}/device/relay/control`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              id: deviceId!,
              auth_key: authKey,
              channel: "0",
              turn: "off",
            }),
          });
          const shellyResult = await response.text();

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

          // Deduct from member credit
          if (feeCharged > 0) {
            await supabase.from("member_credit_transactions").insert({
              user_id: existingSession.user_id,
              amount: -feeCharged,
              type: "debit",
              method: "system",
              status: "confirmed",
              confirmed_at: now.toISOString(),
              description: `Court lights – ${durationMinutes}min on ${court.name}`,
              reference: existingSession.booking_id,
            });
          }

          results.push({
            court: court.name,
            action: "off",
            status: response.ok ? "success" : "error",
            detail: shellyResult,
            fee_charged: feeCharged,
            duration_minutes: durationMinutes,
          });
        } else if (shouldBeOn && existingSession) {
          // Already on, keep going
          results.push({ court: court.name, action: "on", status: "already_active" });
        } else {
          // Already off, nothing to do
          results.push({ court: court.name, action: "off", status: "already_off" });
        }
      } catch (relayErr: any) {
        results.push({
          court: court.name,
          device: deviceId,
          action: shouldBeOn ? "on" : "off",
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
