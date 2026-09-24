// Court booking helper for the AI Help Assistant (copy of the ai-assistant
// helper; edge functions can only import files inside their own folder).
// Propose is read-only; confirm re-checks and writes with the caller's client.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type BookingArgs = { date?: string; start_time?: string; duration_minutes?: number; court_name?: string };
export type BookingProposal = {
  club_id: string; court_id: number; court_name: string; date: string;
  start_time: string; end_time: string; duration_minutes: number; summary: string;
};

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function toMinutes(t: string): number {
  const m = TIME_RE.exec(t.slice(0, 5));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
export function fromMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export async function proposeBooking(supabase: SupabaseClient, clubId: string, args: BookingArgs):
  Promise<{ ok: true; proposal: BookingProposal } | { ok: false; message: string }> {
  const date = String(args.date ?? "").trim();
  const start = String(args.start_time ?? "").trim().slice(0, 5);
  if (!DATE_RE.test(date)) return { ok: false, message: "I need a date for that booking — which day?" };
  if (!TIME_RE.test(start)) return { ok: false, message: "What time would you like to play?" };
  const { data: club } = await supabase.from("clubs").select("booking_slot_minutes, booking_open_time, booking_last_slot_time").eq("id", clubId).maybeSingle();
  const slot = Number(club?.booking_slot_minutes) || 40;
  const duration = [30, 40, 45, 60, 90].includes(Number(args.duration_minutes)) ? Number(args.duration_minutes) : slot;
  const startMin = toMinutes(start), endMin = startMin + duration;
  if (endMin > 1440) return { ok: false, message: "That slot runs past midnight — please pick an earlier time." };
  if (date < new Date().toISOString().slice(0, 10)) return { ok: false, message: "That date has already passed." };
  const openMin = club?.booking_open_time ? toMinutes(String(club.booking_open_time)) : NaN;
  const lastMin = club?.booking_last_slot_time ? toMinutes(String(club.booking_last_slot_time)) : NaN;
  if (!Number.isNaN(openMin) && startMin < openMin) return { ok: false, message: `The courts only open at ${fromMinutes(openMin)}.` };
  if (!Number.isNaN(lastMin) && startMin > lastMin) return { ok: false, message: `The last bookable slot is ${fromMinutes(lastMin)}.` };
  const { data: courts } = await supabase.from("courts").select("id, name").eq("club_id", clubId).order("id");
  if (!courts?.length) return { ok: false, message: "This club has no courts set up yet." };
  const wanted = String(args.court_name ?? "").trim().toLowerCase();
  let candidates = courts;
  if (wanted) {
    const digits = wanted.replace(/\D+/g, "");
    candidates = courts.filter((c) => {
      const n = String(c.name ?? "").toLowerCase();
      return n === wanted || n.includes(wanted) || (digits && n.replace(/\D+/g, "") === digits);
    });
    if (!candidates.length) return { ok: false, message: `I couldn't find a court called "${args.court_name}".` };
  }
  const { data: existing } = await supabase.from("bookings").select("court_id, start_time, end_time").eq("club_id", clubId).eq("date", date).neq("status", "cancelled");
  const busy = new Set<number>();
  for (const b of existing ?? []) {
    const bs = toMinutes(String(b.start_time ?? "")), be = toMinutes(String(b.end_time ?? ""));
    if (!Number.isNaN(bs) && !Number.isNaN(be) && startMin < be && bs < endMin) busy.add(Number(b.court_id));
  }
  const free = candidates.find((c) => !busy.has(Number(c.id)));
  if (!free) return { ok: false, message: `No free court at ${start} on ${date}.` };
  const end = fromMinutes(endMin);
  return { ok: true, proposal: { club_id: clubId, court_id: Number(free.id), court_name: String(free.name), date, start_time: start, end_time: end, duration_minutes: duration, summary: `${free.name} on ${date} from ${start} to ${end}` } };
}

export async function confirmBooking(supabase: SupabaseClient, userId: string, clubId: string, memberId: string | null, p: BookingProposal):
  Promise<{ ok: true; bookingId: string; message: string } | { ok: false; message: string }> {
  if (!p || p.club_id !== clubId) return { ok: false, message: "That booking request is no longer valid." };
  const re = await proposeBooking(supabase, clubId, { date: p.date, start_time: p.start_time, duration_minutes: p.duration_minutes, court_name: p.court_name });
  if (!re.ok) return re;
  const { data, error } = await supabase.from("bookings").insert({
    user_id: userId, club_id: clubId, club_member_id: memberId, court_id: re.proposal.court_id, date: re.proposal.date,
    start_time: `${re.proposal.start_time}:00`, end_time: `${re.proposal.end_time}:00`, is_friendly: true, booking_type: "match",
  }).select("id").single();
  if (error) return { ok: false, message: error.message || "The booking could not be saved." };
  return { ok: true, bookingId: data.id, message: `Booked — ${re.proposal.summary}.` };
}
