// GoBook official API client (https://api.gobook.co.za).
//
// GoBook added a reCAPTCHA to its website login, which broke the old
// screen-scraping path in `gobook-book`. The official API replaces per-member
// website logins with ONE club-level API account (username/password issued by
// GoBook), stored in the restricted `club_secrets` table.
//
// Actions (POST JSON, field "action"):
//   test_connection { club_id }                  -> token + provider profile + courts
//   sync_settings   { club_id }                  -> saves provider/service ids on the club
//   find_client     { club_id, query }           -> GoBook client lookup (Client/Search)
//   list_courts     { club_id }                  -> Facility/ListForProviderService
//   list_dates      { club_id, client_id }       -> Schedule/ListAvailableBookingDates
//   list_slots      { club_id, client_id, booking_date, provider_consultant_id }
//   book            { club_id, client_id, booking_date, schedule_time_ids[] }
//
// Booking chain (mirrors GoBook's own app, per their reference client):
//   Service/List -> Provider (providerServices) -> Facility/ListForProviderService
//   -> Schedule/ListAvailableBookingDates -> Schedule/ListBookingSlots -> Booking/Book
//
// Setup actions are club-admin only; read/booking actions are open to any
// authenticated member of the club.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://api.gobook.co.za";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getToken(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/Authentication/Token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success || !body?.token) {
    const msg = body?.messages?.join(", ") || `GoBook auth failed (${res.status})`;
    throw new Error(msg);
  }
  return body.token as string;
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`GoBook ${path} failed (${res.status})`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userRes } = await admin.auth.getUser(jwt);
    const user = userRes?.user;
    if (!user) return json({ error: "Not authenticated" }, 401);

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action ?? "");
    const clubId = String(payload.club_id ?? "");
    if (!clubId) return json({ error: "club_id is required" }, 400);

    // Authorisation: setup actions need a club admin (or platform super admin);
    // read/booking actions only need club membership.
    const SETUP_ACTIONS = ["test_connection", "sync_settings"];
    const { data: isAdmin } = await admin.rpc("is_club_admin", {
      _user_id: user.id,
      _club_id: clubId,
    });
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (SETUP_ACTIONS.includes(action)) {
      if (!isAdmin && !isSuper) return json({ error: "Admin access required" }, 403);
    } else if (!isAdmin && !isSuper) {
      const { data: isMember } = await admin.rpc("is_club_member", {
        _user_id: user.id,
        _club_id: clubId,
      });
      if (!isMember) return json({ error: "Club membership required" }, 403);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("gobook_api_username, gobook_api_password")
      .eq("club_id", clubId)
      .maybeSingle();

    const username = (payload.username ?? secrets?.gobook_api_username ?? "").toString().trim();
    const password = (payload.password ?? secrets?.gobook_api_password ?? "").toString();
    if (!username || !password) {
      return json({ error: "No GoBook API credentials saved for this club" }, 400);
    }

    const token = await getToken(username, password);

    if (action === "test_connection" || action === "sync_settings") {
      const provider = await apiGet(token, "/Provider");
      if (!provider) return json({ error: "GoBook returned no provider profile" }, 502);

      const courts = (provider.providerConsultants ?? [])
        .filter((c: any) => c.isActive)
        .map((c: any) => ({
          id: c.providerConsultantId,
          name: c.consultantName,
          mapping: c.mappingValue,
        }));
      const services = (provider.providerServices ?? [])
        .filter((s: any) => s.isActive)
        .map((s: any) => ({
          providerServiceId: s.providerServiceId,
          serviceId: s.serviceId,
          description: s.providerServiceDescription,
          bookable: s.isBookable,
        }));

      if (action === "sync_settings") {
        await admin
          .from("clubs")
          .update({
            gobook_api_enabled: true,
            gobook_provider_id: provider.providerId ?? null,
            gobook_service_id: services[0]?.providerServiceId ?? null,
          })
          .eq("id", clubId);
      }

      return json({
        success: true,
        provider: {
          providerId: provider.providerId,
          providerName: provider.providerName,
          hasOwnBackEndSystem: provider.hasOwnBackEndSystem,
          confirmImmediately: provider.confirmImmediately,
          maxBookingsPerClientPerDay: provider.maxBookingsPerClientPerDay,
          maxBookingsPerClientPerWeek: provider.maxBookingsPerClientPerWeek,
          courtTerm: provider.consultantTermSingular,
        },
        courts,
        services,
      });
    }

    if (action === "find_client") {
      const q = encodeURIComponent(String(payload.query ?? "").trim());
      const clients = (await apiGet(token, `/Client/Search?searchText=${q}`)) ?? [];
      return json({
        success: true,
        clients: (clients as any[]).map((c) => ({
          clientId: c.clientId,
          firstName: c.clientFirstName,
          lastName: c.clientLastName,
          isActive: c.isActive,
        })),
      });
    }

    if (action === "book") {
      const ids = Array.isArray(payload.schedule_time_ids) ? payload.schedule_time_ids : [];
      if (!ids.length) return json({ error: "schedule_time_ids is required" }, 400);
      const res = await fetch(`${API_BASE}/Booking/Book`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ProviderServiceScheduleTimeIds: ids,
          ClientId: payload.client_id ?? null,
          BookingDate: payload.booking_date ?? null,
          Notes: payload.notes ?? null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!body?.success) {
        const msg = body?.globalMessages?.join(", ") || "GoBook rejected the booking";
        return json({ error: msg, detail: body }, 400);
      }
      return json({ success: true, result: body });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    console.error("gobook-api", e);
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});
