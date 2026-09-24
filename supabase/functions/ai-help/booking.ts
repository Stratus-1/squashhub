// Court booking "doer" tool for the AI assistant.
//
// Two phases, always: the assistant PROPOSES a booking (read-only, resolves the
// court, checks the slot is free and inside booking hours), and the user must
// explicitly CONFIRM before anything is written. All writes go through the
// caller's authenticated client so RLS, capability gating, suspension and
// peak-cap triggers still apply exactly as they do in the normal booking UI.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type BookingArgs = {
  date?: string;
  start_time?: string;
  duration_minutes?: number;
  court_name?: string;
};

export type BookingProposal = {
  club_id: string;
  court_id: number;
  court_name: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  summary: string;
};

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toMinutes(t: string): number {
  const m = TIME_RE.exec(t.slice(0, 5));
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function fromMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export type ProposeResult =
  | { ok: true; proposal: BookingProposal }
  | { ok: false; message: string };

/** Resolve a natural-language booking request into a concrete, free slot. */
export async function proposeBooking(
  supabase: SupabaseClient,
  clubId: string,
  args: BookingArgs,
): Promise<ProposeResult> {
  const date = String(args.date ?? "").trim();
  const start = String(args.start_time ?? "").trim().slice(0, 5);
  if (!DATE_RE.test(date)) return { ok: false, message: "I need a date for that booking — which day?" };
  if (!TIME_RE.test(start)) return { ok: false, message: "What time would you like to play?" };

  const { data: club } = await supabase
    .from("clubs")
    .select("booking_slot_minutes, booking_open_time, booking_last_slot_time")
    .eq("id", clubId)
    .maybeSingle();

  const slot = Number(club?.booking_slot_minutes) || 40;
  const duration = [30, 40, 45, 60, 90].includes(Number(args.duration_minutes))
    ? Number(args.duration_minutes)
    : slot;

  const startMin = toMinutes(start);
  const endMin = startMin + duration;
  if (endMin > 1440) return { ok: false, message: "That slot runs past midnight — please pick an earlier time." };

  // Booking can't be in the past.
  const nowIso = new Date().toISOString().slice(0, 10);
  if (date < nowIso) return { ok: false, message: "That date has already passed." };

  const openMin = club?.booking_open_time ? toMinutes(String(club.booking_open_time)) : NaN;
  const lastMin = club?.booking_last_slot_time ? toMinutes(String(club.booking_last_slot_time)) : NaN;
  if (!Number.isNaN(openMin) && startMin < openMin) {
    return { ok: false, message: `The courts only open at ${fromMinutes(openMin)}.` };
  }
  if (!Number.isNaN(lastMin) && startMin > lastMin) {
    return { ok: false, message: `The last bookable slot is ${fromMinutes(lastMin)}.` };
  }

  const { data: courts, error: courtErr } = await supabase
    .from("courts")
    .select("id, name")
    .eq("club_id", clubId)
    .order("id");
  if (courtErr) return { ok: false, message: "I couldn't read the court list just now." };
  if (!courts?.length) return { ok: false, message: "This club has no courts set up yet." };

  const wanted = String(args.court_name ?? "").trim().toLowerCase();
  let candidates = courts;
  if (wanted) {
    const digits = wanted.replace(/\D+/g, "");
    const match = courts.filter((c) => {
      const name = String(c.name ?? "").toLowerCase();
      return name === wanted || name.includes(wanted) || (digits && name.replace(/\D+/g, "") === digits);
    });
    if (!match.length) {
      return { ok: false, message: `I couldn't find a court called "${args.court_name}" at this club.` };
    }
    candidates = match;
  }

  const { data: existing } = await supabase
    .from("bookings")
    .select("court_id, start_time, end_time, status")
    .eq("club_id", clubId)
    .eq("date", date)
    .neq("status", "cancelled");

  const busy = new Set<number>();
  for (const b of existing ?? []) {
    const bs = toMinutes(String(b.start_time ?? "").slice(0, 5));
    const be = toMinutes(String(b.end_time ?? "").slice(0, 5));
    if (Number.isNaN(bs) || Number.isNaN(be)) continue;
    if (overlaps(startMin, endMin, bs, be)) busy.add(Number(b.court_id));
  }

  const free = candidates.find((c) => !busy.has(Number(c.id)));
  if (!free) {
    return {
      ok: false,
      message: wanted
        ? `${candidates[0].name} is already booked at ${start} on ${date}.`
        : `Every court is booked at ${start} on ${date}.`,
    };
  }

  const end = fromMinutes(endMin);
  return {
    ok: true,
    proposal: {
      club_id: clubId,
      court_id: Number(free.id),
      court_name: String(free.name ?? `Court ${free.id}`),
      date,
      start_time: start,
      end_time: end,
      duration_minutes: duration,
      summary: `${free.name} on ${date} from ${start} to ${end}`,
    },
  };
}

export type ConfirmResult =
  | { ok: true; bookingId: string; message: string }
  | { ok: false; message: string };

/** Write the booking the user just confirmed. Re-checks the slot first. */
export async function confirmBooking(
  supabase: SupabaseClient,
  userId: string,
  clubId: string,
  memberId: string | null,
  proposal: BookingProposal,
): Promise<ConfirmResult> {
  if (!proposal || proposal.club_id !== clubId) {
    return { ok: false, message: "That booking request is no longer valid." };
  }
  // Re-resolve against live data so a race since the proposal is caught.
  const recheck = await proposeBooking(supabase, clubId, {
    date: proposal.date,
    start_time: proposal.start_time,
    duration_minutes: proposal.duration_minutes,
    court_name: proposal.court_name,
  });
  if (!recheck.ok) return { ok: false, message: recheck.message };

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      user_id: userId,
      club_id: clubId,
      club_member_id: memberId,
      court_id: recheck.proposal.court_id,
      date: recheck.proposal.date,
      start_time: `${recheck.proposal.start_time}:00`,
      end_time: `${recheck.proposal.end_time}:00`,
      is_friendly: true,
      booking_type: "match",
    })
    .select("id")
    .single();

  if (error) {
    console.error("ai-assistant booking insert", error.message);
    return { ok: false, message: error.message || "The booking could not be saved." };
  }
  return {
    ok: true,
    bookingId: data.id,
    message: `Booked — ${recheck.proposal.summary}.`,
  };
}
