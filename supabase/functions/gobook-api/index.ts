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

    // ---- Member <-> GoBook client mapping -------------------------------
    const norm = (s: unknown) =>
      String(s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const searchClients = async (term: string) => {
      const q = encodeURIComponent(term.trim());
      if (!q) return [] as any[];
      return ((await apiGet(token, `/Client/Search?searchText=${q}`)) ?? []) as any[];
    };

    const clientFullName = (c: any) =>
      `${c.clientFirstName ?? ""} ${c.clientLastName ?? ""}`.trim();

    /** Auto-link every unmapped club member whose name matches exactly one GoBook client. */
    if (action === "match_clients") {
      if (!isAdmin && !isSuper) return json({ error: "Admin access required" }, 403);
      const { data: members } = await admin
        .from("club_members")
        .select("id, name, email, gobook_client_id, gobook_client_name")
        .eq("club_id", clubId)
        .eq("status", "active");

      const linked: any[] = [];
      const unmatched: any[] = [];
      const ambiguous: any[] = [];

      for (const m of members ?? []) {
        if (m.gobook_client_id) continue;
        const surname = String(m.name ?? "").trim().split(/\s+/).slice(-1)[0] ?? "";
        const candidates = surname.length >= 2 ? await searchClients(surname) : [];
        const active = candidates.filter((c) => c.isActive !== false);
        const exact = active.filter((c) => norm(clientFullName(c)) === norm(m.name));

        if (exact.length === 1) {
          await admin
            .from("club_members")
            .update({
              gobook_client_id: exact[0].clientId,
              gobook_client_name: clientFullName(exact[0]),
              gobook_linked_at: new Date().toISOString(),
            })
            .eq("id", m.id);
          linked.push({ memberId: m.id, name: m.name, clientId: exact[0].clientId });
        } else if (exact.length > 1 || active.length) {
          ambiguous.push({
            memberId: m.id,
            name: m.name,
            candidates: (exact.length ? exact : active).slice(0, 8).map((c) => ({
              clientId: c.clientId,
              name: clientFullName(c),
            })),
          });
        } else {
          unmatched.push({ memberId: m.id, name: m.name });
        }
      }

      return json({ success: true, linked, ambiguous, unmatched });
    }

    /** Admin manually links (or clears) a member's GoBook client id. */
    if (action === "link_member") {
      if (!isAdmin && !isSuper) return json({ error: "Admin access required" }, 403);
      const memberId = String(payload.club_member_id ?? "");
      if (!memberId) return json({ error: "club_member_id is required" }, 400);
      const clientId = payload.gobook_client_id ? Number(payload.gobook_client_id) : null;
      const { error } = await admin
        .from("club_members")
        .update({
          gobook_client_id: clientId,
          gobook_client_name: clientId ? (payload.gobook_client_name ?? null) : null,
          gobook_linked_at: clientId ? new Date().toISOString() : null,
        })
        .eq("id", memberId)
        .eq("club_id", clubId);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    /** Resolve the calling member's GoBook client id (auto-links on a single exact match). */
    const resolveMyClient = async () => {
      let q = admin
        .from("club_members")
        .select("id, name, email, gobook_client_id, gobook_client_name")
        .eq("club_id", clubId);
      q = payload.club_member_id
        ? q.eq("id", String(payload.club_member_id))
        : q.eq("user_id", user.id);
      const { data: me } = await q.maybeSingle();
      if (!me) return { member: null, clientId: null, candidates: [] as any[] };
      if (me.gobook_client_id) {
        return { member: me, clientId: Number(me.gobook_client_id), candidates: [] };
      }
      const surname = String(me.name ?? "").trim().split(/\s+/).slice(-1)[0] ?? "";
      const candidates = (surname.length >= 2 ? await searchClients(surname) : []).filter(
        (c) => c.isActive !== false,
      );
      const exact = candidates.filter((c) => norm(clientFullName(c)) === norm(me.name));
      if (exact.length === 1) {
        await admin
          .from("club_members")
          .update({
            gobook_client_id: exact[0].clientId,
            gobook_client_name: clientFullName(exact[0]),
            gobook_linked_at: new Date().toISOString(),
          })
          .eq("id", me.id);
        return { member: me, clientId: Number(exact[0].clientId), candidates: [] };
      }
      return {
        member: me,
        clientId: null,
        candidates: candidates.slice(0, 8).map((c) => ({
          clientId: c.clientId,
          name: clientFullName(c),
        })),
      };
    };

    if (action === "my_client") {
      const r = await resolveMyClient();
      return json({
        success: true,
        clientId: r.clientId,
        clientName: (r.member as any)?.gobook_client_name ?? null,
        memberId: (r.member as any)?.id ?? null,
        candidates: r.candidates,
      });
    }

    if (action === "my_bookings") {
      const r = await resolveMyClient();
      if (!r.clientId) return json({ success: true, clientId: null, bookings: [] });
      const list = (await apiGet(token, `/Booking/List?clientId=${r.clientId}`)) ?? [];
      const hhmm = (n: number) =>
        `${String(Math.floor(Number(n) / 100)).padStart(2, "0")}:${String(Number(n) % 100).padStart(2, "0")}`;
      return json({
        success: true,
        clientId: r.clientId,
        bookings: (list as any[])
          .filter((b) => !b.cancelled)
          .map((b) => ({
            bookingId: b.bookingId,
            date: String(b.bookingDate ?? "").slice(0, 10),
            startTime: hhmm(b.startTime),
            endTime: hhmm(b.endTime),
            courtId: b.providerConsultantId,
            courtName: b.consultantName ?? null,
            status: b.status,
          })),
      });
    }



    // Courts (GoBook "facilities") for the club's bookable service.
    if (action === "list_courts") {
      const { data: club } = await admin
        .from("clubs")
        .select("gobook_service_id")
        .eq("id", clubId)
        .maybeSingle();
      const providerServiceId = Number(payload.provider_service_id ?? club?.gobook_service_id ?? 0);
      if (!providerServiceId) return json({ error: "No GoBook service configured for this club" }, 400);
      const clientId = Number(payload.client_id ?? (await resolveMyClient()).clientId ?? 0);

      const data = await apiGet(
        token,
        `/Facility/ListForProviderService?providerServiceId=${providerServiceId}` +
          (clientId ? `&clientId=${clientId}` : "") +
          `&includeInactive=false`,
      );
      const courts = ((data?.facilities ?? []) as any[])
        .filter((f) => f.isActive)
        .map((f) => ({
          providerConsultantId: f.providerConsultantId,
          name: f.consultantName,
          mapping: f.mappingValue,
        }));
      return json({ success: true, courts, provider: data?.provider ?? null });
    }

    // Dates GoBook will accept a booking for.
    if (action === "list_dates") {
      const clientId = Number(payload.client_id ?? (await resolveMyClient()).clientId ?? 0);
      if (!clientId) return json({ success: true, dates: [], needsLink: true });

      const dates = (await apiGet(token, `/Schedule/ListAvailableBookingDates?clientId=${clientId}`)) ?? [];
      return json({
        success: true,
        dates: (dates as any[]).map((d) => ({ date: d.dateFormatted, label: d.dateText })),
      });
    }

    // Live slot grid. One court when provider_consultant_id is given, otherwise
    // every active court for the club's service (so the UI can draw a grid).
    if (action === "list_slots") {
      const { data: club } = await admin
        .from("clubs")
        .select("gobook_service_id")
        .eq("id", clubId)
        .maybeSingle();
      const providerServiceId = Number(payload.provider_service_id ?? club?.gobook_service_id ?? 0);
      const clientId = Number(payload.client_id ?? (await resolveMyClient()).clientId ?? 0);
      const date = String(payload.booking_date ?? "").slice(0, 10);
      if (!providerServiceId) return json({ error: "No GoBook service configured for this club" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "booking_date must be YYYY-MM-DD" }, 400);

      let courtIds: Array<{ id: number; name: string }> = [];
      if (payload.provider_consultant_id) {
        courtIds = [{ id: Number(payload.provider_consultant_id), name: "" }];
      } else {
        const fac = await apiGet(
          token,
          `/Facility/ListForProviderService?providerServiceId=${providerServiceId}` +
            (clientId ? `&clientId=${clientId}` : "") +
            `&includeInactive=false`,
        );
        courtIds = ((fac?.facilities ?? []) as any[])
          .filter((f) => f.isActive)
          .map((f) => ({ id: f.providerConsultantId, name: f.consultantName }));
      }

      // GoBook returns times as HHMM integers (600 = 06:00).
      const hhmm = (n: number) =>
        `${String(Math.floor(Number(n) / 100)).padStart(2, "0")}:${String(Number(n) % 100).padStart(2, "0")}`;

      const all: any[] = [];
      for (const court of courtIds) {
        const slots = (await apiGet(
          token,
          `/Schedule/ListBookingSlots?providerServiceId=${providerServiceId}` +
            `&bookingDate=${date}&includeUnavailable=true` +
            `&providerConsultantId=${court.id}` +
            (clientId ? `&clientId=${clientId}` : ""),
        )) ?? [];
        for (const s of slots as any[]) {
          all.push({
            scheduleTimeId: s.providerServiceScheduleTimeId,
            courtId: s.providerConsultantId ?? court.id,
            courtName: s.consultantName ?? court.name,
            startTime: hhmm(s.startTime),
            endTime: hhmm(s.endTime),
            label: s.timeText,
            booked: !!s.bookingId,
            ownBooking: !!s.ownBooking,
            bookedBy: s.bookedText || null,
            bookable: !s.excludedFromBooking && !s.bookingId,
          });
        }
      }

      return json({ success: true, courts: courtIds, clientId: clientId || null, slots: all });
    }


    if (action === "book") {
      const ids = Array.isArray(payload.schedule_time_ids) ? payload.schedule_time_ids : [];
      if (!ids.length) return json({ error: "schedule_time_ids is required" }, 400);

      // The booking is always made against the caller's own GoBook client id.
      // Admins may book on behalf of someone else by passing club_member_id.
      const mine = await resolveMyClient();
      let clientId = mine.clientId;
      if (!clientId && (isAdmin || isSuper) && payload.client_id) {
        clientId = Number(payload.client_id);
      }
      if (!clientId) {
        return json(
          {
            error:
              "Your SquashHub profile is not linked to a GoBook account yet. Ask a club admin to link it.",
            candidates: mine.candidates,
            needsLink: true,
          },
          409,
        );
      }

      const res = await fetch(`${API_BASE}/Booking/Book`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ProviderServiceScheduleTimeIds: ids,
          ClientId: clientId,
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
