// Fluss+ door trigger
// Opens a Fluss+ relay (door/gate) for a club. Auth: caller must be a logged-in
// user with an active confirmed booking on the target court (or a club admin).
//
// Body: { club_id: string, court_id?: number, booking_id?: string, device_id?: string }
// Resolves the Fluss device_id in this order:
//   1. explicit body.device_id (admin test)
//   2. courts.fluss_device_id for the booking/court
//   3. club_secrets.fluss_default_device_id
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FLUSS_API_BASE = "https://api.fluss.io/v1"; // public Fluss REST base

// Bookings are stored as local date + wall-clock times, so all comparisons use
// club-local time (same convention as the court-lights function).
const BOOKING_TIMEZONE = Deno.env.get("COURT_LIGHTS_TIMEZONE") || "Africa/Johannesburg";
const GRACE_MS = 10 * 60_000;

function localDateAndTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

/** Normalise a Postgres time value ("18:00:00") to "HH:MM". */
function hhmm(t: string | null | undefined) {
  return String(t ?? "").slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const club_id: string | undefined = body.club_id;
    const court_id: number | undefined = body.court_id;
    const booking_id: string | undefined = body.booking_id;
    let device_id: string | undefined = body.device_id;
    if (!club_id) return json({ error: "club_id required" }, 400);

    // Authorization: either club admin OR has an active booking right now
    const { data: isAdmin } = await admin.rpc("is_club_admin", {
      _user_id: userId,
      _club_id: club_id,
    });

    let authorized = !!isAdmin;
    let resolvedCourtId = court_id;

    if (!authorized) {
      // Must hold an active booking within ±10 minutes of now on a court in
      // this club. Bookings are stored as local `date` + `start_time`/`end_time`
      // (time without time zone), so compare in club-local wall-clock terms.
      const now = new Date();
      const from = localDateAndTime(new Date(now.getTime() - GRACE_MS));
      const to = localDateAndTime(new Date(now.getTime() + GRACE_MS));

      let q = admin
        .from("bookings")
        .select("id, court_id, date, start_time, end_time, courts!inner(club_id, fluss_device_id)")
        .eq("user_id", userId)
        .in("date", Array.from(new Set([from.date, to.date])))
        .eq("status", "active");
      if (booking_id) q = q.eq("id", booking_id);
      if (court_id) q = q.eq("court_id", court_id);
      const { data: bookings, error: bookingsErr } = await q;
      if (bookingsErr) {
        console.error("fluss-trigger booking lookup failed", bookingsErr);
        return json({ error: "Could not verify your booking" }, 500);
      }

      // Window check: booking starts before now+grace and ends after now-grace.
      const match = (bookings as any[])?.find((b) => {
        if (b.courts?.club_id !== club_id) return false;
        const start = `${b.date}T${hhmm(b.start_time)}`;
        const end = `${b.date}T${hhmm(b.end_time)}`;
        return start <= `${to.date}T${to.time}` && end >= `${from.date}T${from.time}`;
      });
      if (!match) return json({ error: "No active booking for this court" }, 403);
      authorized = true;
      resolvedCourtId = match.court_id;
      if (!device_id) device_id = match.courts?.fluss_device_id ?? undefined;
    }

    // Load Fluss creds + fallback device
    const { data: secrets } = await admin
      .from("club_secrets")
      .select("fluss_api_token, fluss_default_device_id")
      .eq("club_id", club_id)
      .maybeSingle();
    const token = (secrets as any)?.fluss_api_token;
    if (!token) return json({ error: "Fluss is not configured for this club" }, 400);

    if (!device_id && resolvedCourtId) {
      const { data: c } = await admin
        .from("courts")
        .select("fluss_device_id")
        .eq("id", resolvedCourtId)
        .maybeSingle();
      device_id = (c as any)?.fluss_device_id ?? undefined;
    }
    if (!device_id) device_id = (secrets as any)?.fluss_default_device_id ?? undefined;
    if (!device_id) return json({ error: "No Fluss device configured" }, 400);

    // Trigger the relay. Fluss+ exposes a simple device action endpoint.
    const url = `${FLUSS_API_BASE}/devices/${encodeURIComponent(device_id)}/trigger`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source: "squashhub" }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error("Fluss API error", resp.status, text);
      return json({ error: `Fluss API ${resp.status}`, details: text.slice(0, 500) }, 502);
    }

    return json({ ok: true, device_id });
  } catch (err: any) {
    console.error("fluss-trigger error", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
