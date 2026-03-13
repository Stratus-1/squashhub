import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

/**
 * Court Lights Edge Function
 *
 * Called on a schedule (every minute via pg_cron) to:
 * 1. Turn ON lights for courts whose booking is starting now
 * 2. Turn OFF lights for courts whose booking just ended
 *
 * Reads the Shelly auth key from the club record (per-club config).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const internalSecret = req.headers.get("x-internal-secret");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Verify internal secret
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

    // Get all courts with relays, joined with their club's shelly_auth_key
    const { data: courts, error: courtsErr } = await supabase
      .from("courts")
      .select("id, name, relay_device_id, relay_server, club_id, clubs(shelly_auth_key)")
      .not("relay_device_id", "is", null);

    if (courtsErr) throw courtsErr;
    if (!courts || courts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No courts with relays configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const courtIds = courts.map((c: any) => c.id);

    // Get today's active bookings and champs matches
    const [{ data: bookings, error: bookErr }, { data: champsMatches, error: champsErr }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, court_id, start_time, end_time")
        .eq("date", todayStr)
        .eq("status", "active")
        .in("court_id", courtIds),
      supabase
        .from("club_champs_matches")
        .select("id, court_id, scheduled_time")
        .eq("scheduled_date", todayStr)
        .eq("status", "scheduled")
        .in("court_id", courtIds),
    ]);

    if (bookErr) throw bookErr;
    if (champsErr) throw champsErr;

    const results: any[] = [];

    for (const court of courts) {
      const authKey = (court as any).clubs?.shelly_auth_key;
      if (!authKey) {
        results.push({ court: court.name, status: "skipped", detail: "No Shelly auth key configured for club" });
        continue;
      }

      const courtBookings = (bookings || []).filter((b: any) => b.court_id === court.id);
      const courtChamps = (champsMatches || []).filter((m: any) => m.court_id === court.id);

      const hasActiveBooking = courtBookings.some((b: any) => {
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

      const shouldBeOn = hasActiveBooking || hasActiveChamps;
      const shellyServer = court.relay_server || "https://shelly-44-eu.shelly.cloud";
      const deviceId = court.relay_device_id;

      try {
        const response = await fetch(`${shellyServer}/device/relay/control`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            id: deviceId,
            auth_key: authKey,
            channel: "0",
            turn: shouldBeOn ? "on" : "off",
          }),
        });

        const shellyResult = await response.text();
        results.push({
          court: court.name,
          device: deviceId,
          action: shouldBeOn ? "on" : "off",
          status: response.ok ? "success" : "error",
          detail: shellyResult,
        });
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
