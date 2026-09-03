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
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`GoBook ${path} failed (${res.status}): ${text}`);
  try { return JSON.parse(text); } catch { return null; }
}

async function apiPost(token: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* provider may return an empty body */ }
  if (!res.ok) throw new Error(`GoBook ${path} failed (${res.status}): ${text}`);
  if (parsed && parsed.success === false) {
    throw new Error(parsed.globalMessages?.join(", ") || parsed.messages?.join(", ") || `GoBook rejected ${path}`);
  }
  return parsed;
}

const hhmm = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  if (/^\d{1,2}:\d{2}/.test(text)) return text.slice(0, 5).padStart(5, "0");
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${String(Math.floor(number / 100)).padStart(2, "0")}:${String(number % 100).padStart(2, "0")}`;
};

const normalizeName = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9 ]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const ROW_KEYS = ["slots", "bookingSlots", "facilities", "items", "results", "data"] as const;

const rowsFrom = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  for (const key of ROW_KEYS) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  if (value?.data && typeof value.data === "object") return rowsFrom(value.data);
  if (value?.result && typeof value.result === "object") return rowsFrom(value.result);
  return [];
};

const hasRowsEnvelope = (value: any): boolean =>
  Array.isArray(value)
  || ROW_KEYS.some((key) => Array.isArray(value?.[key]))
  || (!!value?.data && typeof value.data === "object" && hasRowsEnvelope(value.data))
  || (!!value?.result && typeof value.result === "object" && hasRowsEnvelope(value.result));

const bookingIdFrom = (value: any): number | null => {
  const candidates = [
    value?.bookingId,
    value?.BookingId,
    value?.booking_id,
    value?.id,
    value?.booking?.bookingId,
    value?.booking?.BookingId,
    value?.booking?.id,
    value?.result?.bookingId,
    value?.result?.BookingId,
    value?.result?.id,
    value?.data?.bookingId,
    value?.data?.BookingId,
    value?.data?.id,
    Array.isArray(value?.bookings) ? value.bookings[0]?.bookingId : null,
    Array.isArray(value?.bookings) ? value.bookings[0]?.id : null,
  ];
  const found = candidates.map(Number).find((id) => Number.isInteger(id) && id > 0);
  return found ?? null;
};

const providerBookingIdFrom = (value: any): number | null => {
  const direct = bookingIdFrom(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return null;
  const queue: any[] = Array.isArray(value) ? [...value] : Object.values(value);
  const seen = new Set<any>();
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
    seen.add(candidate);
    const nested = bookingIdFrom(candidate);
    if (nested) return nested;
    queue.push(...(Array.isArray(candidate) ? candidate : Object.values(candidate)));
  }
  return null;
};

const activeProviderBookings = (value: any): any[] => rowsFrom(value).filter((booking) => {
  const status = String(booking?.status ?? booking?.bookingStatus ?? "").toLowerCase();
  return booking?.cancelled !== true && status !== "c" && status !== "cancelled";
});

const matchingProviderBooking = (
  bookings: any[],
  expected: { date: string; courtId: number | null; startTime: string; endTime: string | null },
  excludedIds: Set<number> = new Set(),
): any | null => {
  const matches = bookings.filter((booking) => {
    const id = bookingIdFrom(booking);
    if (!id || excludedIds.has(id)) return false;
    const date = String(booking?.bookingDate ?? booking?.date ?? "").slice(0, 10);
    const courtId = Number(booking?.providerConsultantId ?? booking?.consultantId ?? 0);
    const start = hhmm(booking?.startTime ?? booking?.start_time);
    const end = hhmm(booking?.endTime ?? booking?.end_time);
    return date === expected.date
      && (!expected.courtId || courtId === expected.courtId)
      && start === expected.startTime
      && (!expected.endTime || !end || end === expected.endTime);
  });
  return matches.length === 1 ? matches[0] : null;
};

// A schedule slot's generic `id` is often the schedule-time id, not the
// provider booking id. Never use it to create a cancellation reference.
const slotBookingIdFrom = (value: any): number | null => {
  const candidates = [
    value?.bookingId,
    value?.BookingId,
    value?.booking_id,
    value?.booking?.bookingId,
    value?.booking?.BookingId,
    value?.booking?.id,
  ];
  const found = candidates.map(Number).find((id) => Number.isInteger(id) && id > 0);
  return found ?? null;
};

const isBookedSlot = (value: any) => {
  return slotBookingIdFrom(value) !== null
    || value?.isBooked === true
    || value?.booked === true
    || value?.available === false
    || value?.isAvailable === false;
};

const bookerNameFrom = (value: any) => String(
  value?.bookedText
  ?? value?.bookedBy
  ?? value?.clientName
  ?? value?.clientFullName
  ?? value?.booking?.clientName
  ?? value?.booking?.clientFullName
  ?? "",
).trim() || null;

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

    /** Resolve a verified club member's GoBook client id (auto-links on an exact name match). */
    const resolveMyClient = async () => {
      const requestedMemberId = String(payload.club_member_id ?? "").trim();
      const canActForAnotherMember = !!(isAdmin || isSuper);
      let q = admin
        .from("club_members")
        .select("id, name, email, user_id, gobook_client_id, gobook_client_name")
        .eq("club_id", clubId)
        .eq("status", "active");
      if (requestedMemberId) {
        q = q.eq("id", requestedMemberId);
        if (!canActForAnotherMember) q = q.eq("user_id", user.id);
      } else {
        q = q.eq("user_id", user.id);
      }
      const { data: me } = await q.maybeSingle();
      if (!me) {
        return {
          member: null,
          clientId: null,
          candidates: [] as any[],
          forbidden: !!requestedMemberId,
        };
      }
      if (me.gobook_client_id) {
        return { member: me, clientId: Number(me.gobook_client_id), candidates: [], forbidden: false };
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
          .eq("id", me.id)
          .eq("club_id", clubId);
        return { member: me, clientId: Number(exact[0].clientId), candidates: [], forbidden: false };
      }
      return {
        member: me,
        clientId: null,
        candidates: candidates.slice(0, 8).map((c) => ({
          clientId: c.clientId,
          name: clientFullName(c),
        })),
        forbidden: false,
      };
    };

    if (action === "my_client") {
      const r = await resolveMyClient();
      if (r.forbidden) return json({ error: "You may only use your own GoBook member profile" }, 403);
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
      if (r.forbidden) return json({ error: "You may only use your own GoBook member profile" }, 403);
      if (!r.clientId) return json({ success: true, clientId: null, bookings: [] });
      const list = (await apiGet(token, `/Booking/List?clientId=${r.clientId}`)) ?? [];
      const hhmm = (n: number) => `${String(Math.floor(Number(n) / 100)).padStart(2, "0")}:${String(Number(n) % 100).padStart(2, "0")}`;
      // Club-local "today" (SAST) so a member only sees bookings they can still cancel.
      const todayLocal = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const includePast = payload.include_past === true;
      return json({
        success: true,
        clientId: r.clientId,
        bookings: (list as any[])
          .filter((b) => !b.cancelled && String(b.status ?? "").toLowerCase() !== "c")
          .map((b) => ({
            bookingId: b.bookingId,
            date: String(b.bookingDate ?? "").slice(0, 10),
            startTime: hhmm(b.startTime),
            endTime: hhmm(b.endTime),
            courtId: b.providerConsultantId,
            courtName: b.consultantName ?? null,
            status: b.status,
          }))
          .filter((b) => includePast || b.date >= todayLocal)
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
      });
    }

    if (action === "cancel") {
      const bookingId = Number(payload.booking_id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) return json({ error: "booking_id must be a positive integer" }, 400);
      const target = await resolveMyClient();
      if (target.forbidden) return json({ error: "You may only cancel your own GoBook bookings" }, 403);
      if (!target.clientId) return json({ error: "The selected club member is not linked to a GoBook account yet", needsLink: true }, 409);

      // Never trust a client-supplied booking id alone. Confirm GoBook lists it
      // under the selected, server-verified member before sending the destructive action.
      const ownedBookings = rowsFrom((await apiGet(token, `/Booking/List?clientId=${target.clientId}`)) ?? []);
      const owned = ownedBookings.some((b) => {
        const status = String(b.status ?? b.bookingStatus ?? "").toLowerCase();
        return Number(b.bookingId ?? b.BookingId ?? b.booking_id ?? b.id) === bookingId
          && b.cancelled !== true
          && status !== "c"
          && status !== "cancelled";
      });
      if (!owned) return json({ error: "That booking does not belong to the selected GoBook member" }, 403);

      const result = await apiPost(token, "/Booking/Action", { bookingId, action: "cancel" });
      return json({ success: true, bookingId, result });
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
      const resolved = await resolveMyClient();
      if (resolved.forbidden) return json({ error: "You may only use your own GoBook member profile" }, 403);
      const clientId = Number(resolved.clientId ?? 0);
      if (!clientId) return json({ success: true, dates: [], needsLink: true });

      const dates = rowsFrom((await apiGet(token, `/Schedule/ListAvailableBookingDates?clientId=${clientId}`)) ?? []);
      return json({
        success: true,
        dates: dates.map((d) => ({ date: d.dateFormatted ?? d.date ?? null, label: d.dateText ?? d.label ?? null })),
      });
    }

    // Live slot grid. One court when provider_consultant_id is given, otherwise
    // every active court for the club's service (so the core calendar can draw it).
    if (action === "list_slots") {
      const { data: club } = await admin
        .from("clubs")
        .select("gobook_service_id")
        .eq("id", clubId)
        .maybeSingle();
      const providerServiceId = Number(payload.provider_service_id ?? club?.gobook_service_id ?? 0);
      const resolved = await resolveMyClient();
      if (resolved.forbidden) return json({ error: "You may only use your own GoBook member profile" }, 403);
      const clientId = Number(resolved.clientId ?? 0);
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

      const all: any[] = [];
      for (const court of courtIds) {
        const slots = rowsFrom((await apiGet(
          token,
          `/Schedule/ListBookingSlots?providerServiceId=${providerServiceId}` +
            `&bookingDate=${date}&includeUnavailable=true` +
            `&providerConsultantId=${court.id}` +
            (clientId ? `&clientId=${clientId}` : ""),
        )) ?? []);
        for (const s of slots) {
           const booked = isBookedSlot(s);
           all.push({
             scheduleTimeId: s.providerServiceScheduleTimeId ?? s.scheduleTimeId ?? s.id,
             bookingId: bookingIdFrom(s),
             courtId: s.providerConsultantId ?? s.consultantId ?? court.id,
             courtName: s.consultantName ?? s.courtName ?? court.name,
             startTime: hhmm(s.startTime ?? s.start_time),
             endTime: hhmm(s.endTime ?? s.end_time),
             label: s.timeText ?? s.label ?? null,
             booked,
             ownBooking: s.ownBooking === true || s.isOwnBooking === true,
             bookedBy: bookerNameFrom(s),
             bookable: !s.excludedFromBooking && !booked,
           });
         }
      }

      return json({ success: true, courts: courtIds, clientId: clientId || null, slots: all });
    }

    // Pull one day from GoBook into the core calendar. Only rows written by
    // this official API mirror are reconciled; native and legacy rows are never
    // deleted or overwritten. A failed/partial provider read never cancels
    // existing mirror rows.
    if (action === "sync_core_day") {
      const date = String(payload.booking_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "booking_date must be YYYY-MM-DD" }, 400);
      const { data: localCourts, error: courtError } = await admin.from("courts").select("id, name").eq("club_id", clubId).eq("is_external", false);
      if (courtError) throw courtError;
      const courtByName = new Map((localCourts ?? []).map((c: any) => [normalizeName(c.name), c]));
      const courtByNumber = new Map<string, any>();
      for (const court of localCourts ?? []) {
        const number = String(court.name).match(/\d+/)?.[0];
        if (number && !courtByNumber.has(number)) courtByNumber.set(number, court);
      }
      const { data: club } = await admin.from("clubs").select("gobook_service_id").eq("id", clubId).maybeSingle();
      const providerServiceId = Number(club?.gobook_service_id ?? 0);
      if (!providerServiceId) throw new Error("No GoBook service configured for this club");
      // GoBook's slot endpoint only returns still-bookable slots, so existing
      // bookings never appear there. Booking/List returns the provider's real
      // booking register (all dates), which we filter down to the day asked for.
      const listResponse = await apiGet(token, `/Booking/List?providerServiceId=${providerServiceId}&bookingDate=${date}`);
      if (!hasRowsEnvelope(listResponse)) {
        return json({ error: "GoBook returned an unreadable booking list; existing bookings were left unchanged" }, 502);
      }
      const dayBookings = rowsFrom(listResponse).filter((row: any) => {
        if (String(row?.bookingDate ?? "").slice(0, 10) !== date) return false;
        if (row?.cancelled) return false;
        const status = String(row?.status ?? "").toUpperCase();
        return status !== "C" && status !== "X";
      });
      const memberRows = (await admin.from("club_members").select("id, user_id, name, gobook_client_id").eq("club_id", clubId).eq("status", "active")).data ?? [];
      const seen = new Set<string>();
      let synced = 0;
      let skipped = 0;
      for (const row of dayBookings) {
        const bookingId = Number(row?.bookingId ?? 0);
        if (!Number.isInteger(bookingId) || bookingId <= 0) { skipped++; continue; }
        const providerCourtName = String(row.consultantName ?? row.courtName ?? "");
        const court = courtByName.get(normalizeName(providerCourtName)) || courtByNumber.get(providerCourtName.match(/\d+/)?.[0] ?? "");
        const startTime = hhmm(row.startTime ?? row.start_time);
        const endTime = hhmm(row.endTime ?? row.end_time);
        if (!court || !startTime || !endTime) { skipped++; continue; }
        const externalId = `gobook:${bookingId}`;
        // clientName arrives as "1004; M 2nd LEAGUE"; pcMappingText is the readable part.
        const rawName = String(row.pcMappingText ?? row.clientName ?? "").trim();
        const rawBooker = (rawName.includes(";") ? rawName.split(";").slice(1).join(";") : rawName).trim() || null;
        // GoBook stores clients as "Surname, First" (e.g. "Fick, Werner") or
        // sometimes "Initial Surname" (e.g. "F Werner"). Normalise to natural
        // "First Surname" order and, where a club member matches, display the
        // member's real full name.
        const commaSplit = rawBooker?.match(/^([A-Za-z' -]{2,}),\s*([A-Za-z' -]+)$/);
        const initialFirst = !commaSplit && rawBooker?.match(/^([A-Za-z])\s+([A-Za-z' -]{2,})$/);
        const naturalName = commaSplit
          ? `${commaSplit[2].trim()} ${commaSplit[1].trim()}`
          : initialFirst
            ? `${initialFirst[2].trim()} ${initialFirst[1].toUpperCase()}.`
            : rawBooker;
        const bookerSurname = commaSplit ? commaSplit[1].trim() : initialFirst ? initialFirst[2].trim() : null;
        const bookerInitial = naturalName?.trim().charAt(0).toUpperCase() ?? null;
        const exactMatches = naturalName ? memberRows.filter((m: any) => normalizeName(m.name) === normalizeName(naturalName)) : [];
        const surnameMatches = !exactMatches.length && bookerSurname
          ? memberRows.filter((m: any) => {
              const parts = String(m.name ?? "").trim().split(/\s+/);
              const mSurname = parts.slice(1).join(" ");
              return normalizeName(mSurname) === normalizeName(bookerSurname)
                && (!bookerInitial || String(m.name ?? "").trim().charAt(0).toUpperCase() === bookerInitial);
            })
          : [];
        const member = exactMatches.length === 1 ? exactMatches[0]
          : surnameMatches.length === 1 ? surnameMatches[0]
          : null;
        const bookerName = member?.name ?? naturalName;
        const { error } = await admin.from("bookings").upsert({
          club_id: clubId, court_id: court.id, date,
          start_time: `${startTime}:00`, end_time: `${endTime}:00`,
          status: "active", source: "gobook", external_id: externalId,
          external_booker_name: bookerName, user_id: member?.user_id ?? null,
          club_member_id: member?.id ?? null, is_friendly: true,
        }, { onConflict: "club_id,source,external_id" });
        if (error) throw error;
        seen.add(externalId);
        synced++;
      }

      const { data: existing, error: existingError } = await admin.from("bookings").select("id, external_id").eq("club_id", clubId).eq("date", date).eq("source", "gobook").like("external_id", "gobook:%").eq("status", "active");
      if (existingError) throw existingError;
      const stale = (existing ?? []).filter((row: any) => !seen.has(row.external_id)).map((row: any) => row.id);
      if (stale.length) {
        const { error } = await admin.from("bookings").update({ status: "cancelled" }).in("id", stale);
        if (error) throw error;
      }
      return json({ success: true, date, synced, cancelled: stale.length, skipped });
    }

    if (action === "book") {
      let ids = Array.isArray(payload.schedule_time_ids) ? payload.schedule_time_ids : [];
      const bookingDate = String(payload.booking_date ?? "").slice(0, 10);
      let providerConsultantId: number | null = null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) return json({ error: "booking_date must be YYYY-MM-DD" }, 400);
      if (!ids.length && payload.court_id && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate) && payload.start_time) {
        const { data: club } = await admin.from("clubs").select("gobook_service_id").eq("id", clubId).maybeSingle();
        const providerServiceId = Number(club?.gobook_service_id ?? 0);
        const { data: localCourt } = await admin.from("courts").select("name").eq("id", Number(payload.court_id)).eq("club_id", clubId).maybeSingle();
        if (!providerServiceId || !localCourt) return json({ error: "The selected court is not mapped to GoBook" }, 400);
        // Resolve the caller's GoBook client first — availability differs per
        // client, and calls without clientId can return empty/misleading slots.
        const mineEarly = await resolveMyClient();
        if (mineEarly.forbidden) return json({ error: "You may only book for your own GoBook member profile" }, 403);
        const lookupClientId = mineEarly.clientId ?? 0;
        const fac = await apiGet(token, `/Facility/ListForProviderService?providerServiceId=${providerServiceId}` + (lookupClientId ? `&clientId=${lookupClientId}` : "") + `&includeInactive=false`);
        const target = ((fac?.facilities ?? []) as any[]).find((f) => normalizeName(f.consultantName) === normalizeName(localCourt.name) || String(f.consultantName ?? "").match(/\d+/)?.[0] === String(localCourt.name).match(/\d+/)?.[0]);
        if (!target) return json({ error: `GoBook court mapping not found for ${localCourt.name}` }, 400);
        providerConsultantId = Number(target.providerConsultantId) || null;
        const slots = rowsFrom((await apiGet(token, `/Schedule/ListBookingSlots?providerServiceId=${providerServiceId}&bookingDate=${bookingDate}&includeUnavailable=true&providerConsultantId=${target.providerConsultantId}` + (lookupClientId ? `&clientId=${lookupClientId}` : ""))) ?? []);
        const targetTime = String(payload.start_time).slice(0, 5);
        const endTime = payload.end_time ? String(payload.end_time).slice(0, 5) : null;
        // A SquashHub booking can span several GoBook slots (e.g. 60 min =
        // two 30-min GoBook slots). Gather every unbooked slot from start_time
        // up to end_time (or just the starting slot when no end_time given).
        const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const startMin = toMinutes(targetTime);
        const endMin = endTime && toMinutes(endTime) > startMin ? toMinutes(endTime) : null;
        ids = slots
          .filter((s) => {
            const t = hhmm(s.startTime ?? s.start_time);
            if (!t || isBookedSlot(s) || s.excludedFromBooking) return false;
            const m = toMinutes(t);
            return m >= startMin && (endMin === null ? m === startMin : m < endMin);
          })
          .sort((a, b) => toMinutes(hhmm(a.startTime ?? a.start_time)) - toMinutes(hhmm(b.startTime ?? b.start_time)))
          .map((s) => s.providerServiceScheduleTimeId ?? s.scheduleTimeId ?? s.id)
          .filter((id) => Number.isInteger(Number(id)) && Number(id) > 0);
      }
      ids = ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
      if (!ids.length) return json({ error: "No bookable GoBook slot matches the selected court and time" }, 409);

      // Members can only book for their own linked GoBook client. Club admins
      // may target another active club member via club_member_id.
      const mine = await resolveMyClient();
      if (mine.forbidden) return json({ error: "You may only book for your own GoBook member profile" }, 403);
      const clientId = mine.clientId;
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

      const expectedStart = String(payload.start_time ?? "").slice(0, 5);
      const expectedEnd = payload.end_time ? String(payload.end_time).slice(0, 5) : null;
      const beforeBookings = activeProviderBookings(
        (await apiGet(token, `/Booking/List?clientId=${clientId}`)) ?? [],
      );
      const existing = expectedStart
        ? matchingProviderBooking(beforeBookings, {
            date: bookingDate,
            courtId: providerConsultantId,
            startTime: expectedStart,
            endTime: expectedEnd,
          })
        : null;
      const existingId = existing ? bookingIdFrom(existing) : null;
      if (existingId) {
        return json({ success: true, bookingId: existingId, recovered: true, alreadyBooked: true });
      }
      const beforeIds = new Set(
        beforeBookings.map((booking) => bookingIdFrom(booking)).filter((id): id is number => id !== null),
      );

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
      let createdBookingId = providerBookingIdFrom(body);
      if (!createdBookingId && expectedStart) {
        // Some GoBook environments return success without the new booking id.
        // Re-read the member's provider register and recover only one exact,
        // newly-created match. Never repeat Booking/Book after provider success.
        for (let attempt = 0; attempt < 3 && !createdBookingId; attempt++) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300));
          const afterBookings = activeProviderBookings(
            (await apiGet(token, `/Booking/List?clientId=${clientId}`)) ?? [],
          );
          const recovered = matchingProviderBooking(afterBookings, {
            date: bookingDate,
            courtId: providerConsultantId,
            startTime: expectedStart,
            endTime: expectedEnd,
          }, beforeIds);
          createdBookingId = recovered ? bookingIdFrom(recovered) : null;
        }
      }
      if (!createdBookingId) {
        console.error("GoBook accepted Booking/Book but its booking id could not be recovered", {
          bookingDate,
          providerConsultantId,
          clientId,
          scheduleTimeIds: ids,
          responseKeys: body && typeof body === "object" ? Object.keys(body) : [],
        });
        return json({
          error: "GoBook accepted the booking, but its reference is still being confirmed. Refresh the calendar before trying again.",
          providerAccepted: true,
        }, 202);
      }
      return json({ success: true, bookingId: createdBookingId, recovered: bookingIdFrom(body) === null, result: body });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    console.error("gobook-api", e);
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});
