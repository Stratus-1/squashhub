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
      // must have a confirmed booking ±10 minutes around now on a court in this club
      const nowIso = new Date().toISOString();
      let q = admin
        .from("bookings")
        .select("id, court_id, courts!inner(club_id, fluss_device_id)")
        .eq("user_id", userId)
        .lte("starts_at", new Date(Date.now() + 10 * 60_000).toISOString())
        .gte("ends_at", new Date(Date.now() - 10 * 60_000).toISOString())
        .eq("status", "confirmed");
      if (booking_id) q = q.eq("id", booking_id);
      if (court_id) q = q.eq("court_id", court_id);
      const { data: bookings } = await q;
      const match = (bookings as any[])?.find((b) => b.courts?.club_id === club_id);
      if (!match) return json({ error: "No active booking for this court" }, 403);
      authorized = true;
      resolvedCourtId = match.court_id;
      if (!device_id) device_id = match.courts?.fluss_device_id ?? undefined;
      void nowIso;
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
