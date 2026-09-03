// TEMPORARY diagnostic: dumps a sample of GoBook's raw slot payload for a club/day.
// Service-role only. Delete after debugging.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const API_BASE = "https://api.gobook.co.za";

Deno.serve(async (req) => {
  try {
    const { club_id, booking_date, debug_token } = await req.json();
    if (debug_token !== "eecc93731ccc4306fcb3fa902fd2cf03") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: secrets } = await admin.from("club_secrets").select("gobook_api_username, gobook_api_password").eq("club_id", club_id).maybeSingle();
    const { data: club } = await admin.from("clubs").select("gobook_service_id, gobook_provider_id").eq("id", club_id).maybeSingle();
    const tokenRes = await fetch(`${API_BASE}/Authentication/Token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: secrets?.gobook_api_username, password: secrets?.gobook_api_password }),
    });
    const tokenBody = await tokenRes.json().catch(() => null);
    if (!tokenBody?.token) return new Response(JSON.stringify({ step: "token", status: tokenRes.status, body: tokenBody }), { status: 200 });
    const token = tokenBody.token as string;
    const get = async (path: string) => {
      const r = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      const t = await r.text();
      try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t.slice(0, 500) }; }
    };
    const svc = Number(club?.gobook_service_id ?? 0);
    const facilities = await get(`/Facility/ListForProviderService?providerServiceId=${svc}&includeInactive=false`);
    const facRows: any[] = (facilities.body as any)?.facilities ?? (Array.isArray(facilities.body) ? facilities.body : []);
    const first = facRows[0];
    const slots = first
      ? await get(`/Schedule/ListBookingSlots?providerServiceId=${svc}&bookingDate=${booking_date}&includeUnavailable=true&providerConsultantId=${first.providerConsultantId}`)
      : null;
    const slotRows: any[] = (slots?.body as any)?.slots ?? (slots?.body as any)?.bookingSlots ?? (Array.isArray(slots?.body) ? slots?.body : []);
    return new Response(JSON.stringify({
      serviceId: svc,
      facilityKeys: first ? Object.keys(first) : [],
      facilitySample: first,
      facilityCount: facRows.length,
      slotEnvelopeKeys: slots?.body && typeof slots.body === "object" ? Object.keys(slots.body as any) : [],
      slotCount: slotRows.length,
      slotSample: slotRows.slice(0, 6),
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
