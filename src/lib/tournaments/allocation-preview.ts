/** Read-only allocation checks. This module has no persistence or provider calls. */
export interface AllocationBooking {
  id: string; club_id: string; court_id: number; date: string; start_time: string; end_time: string;
  external_id?: string | null; source?: string; booking_type?: string; ops_note?: string | null;
  user_id?: string | null; club_member_id?: string | null; opponent_id?: string | null; opponent_member_id?: string | null;
  guest_name?: string | null; external_booker_name?: string | null;
}
export interface AllocationMatch {
  id: string; champ_id: string; scheduled_date?: string | null; scheduled_time?: string | null; court_id?: number | null;
  booking_id?: string | null; status?: string; score?: string | null; game_scores?: unknown; winner_member_id?: string | null;
  side_a_points?: number | null; side_b_points?: number | null; is_bye?: boolean;
  player_a_member_id?: string | null; player_b_member_id?: string | null; partner_a_member_id?: string | null; partner_b_member_id?: string | null;
  duration?: number | null; play_by?: string | null; deadline?: string | null; windowDate?: string | null;
  windowFrom?: string | null; windowTo?: string | null; allowedCourts?: number[]; restMinutes?: number;
  title?: string; category?: string;
}
export interface VerifiedBlock extends AllocationBooking { envelope: string; tournamentId: string }
export interface AllocationSlot { date: string; time: string; courtId: number }
export interface AllocationContext {
  clubId: string; tournamentId: string; authorized: boolean; complete: boolean;
  bookings: AllocationBooking[]; blocks: VerifiedBlock[]; matches: AllocationMatch[];
  now: string; personByMember?: Record<string, string>;
}
export const minutesOf = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export const timeOf = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const overlap = (a: number, b: number, c: number, d: number) => a < d && c < b;
export const individuallyBooked = (b: AllocationBooking) => !!(b.user_id || b.club_member_id || b.opponent_id || b.opponent_member_id);
/** Only a server-saved plan, exact stage ID/range and the existing reservation writer's provenance qualify. */
export function verifyPlanBlocks(bookings: AllocationBooking[], tournament: { id: string; club_id: string; beta_lifecycle?: any }): VerifiedBlock[] {
  const answers = tournament.beta_lifecycle?.answers;
  if (!answers?.planId || !Array.isArray(answers.stages)) return [];
  return bookings.flatMap((b) => {
    if (b.club_id !== tournament.club_id || individuallyBooked(b) || b.external_booker_name?.trim() || b.source !== "club_event" || b.ops_note !== "Tournament court reservation (Step-by-Step Beta)") return [];
    const stage = answers.stages.find((s: any) => {
      if (!s.id || s.mode !== "scheduled") return false;
      const days = [{ date: s.date, from: s.from, to: s.to, courtIds: s.courtIds, extra: false }, ...(s.extraDays ?? []).map((d: any) => ({ ...d, extra: true }))];
      return days.some((d: any) => b.external_id === `sbs:${answers.planId}:${s.id}:${d.extra ? `${d.date}:` : ""}${b.court_id}` && d.date === b.date && d.from?.slice(0, 5) === b.start_time.slice(0, 5) && d.to?.slice(0, 5) === b.end_time.slice(0, 5) && d.courtIds?.map(String).includes(String(b.court_id)));
    });
    return stage ? [{ ...b, envelope: `sbs:${answers.planId}:${stage.id}`, tournamentId: tournament.id }] : [];
  });
}
export function blockAt(ctx: AllocationContext, slot: AllocationSlot, duration: number) {
  const start = minutesOf(slot.time);
  return ctx.blocks.find((b) => b.tournamentId === ctx.tournamentId && b.date === slot.date && b.court_id === slot.courtId && minutesOf(b.start_time) <= start && minutesOf(b.end_time) >= start + duration);
}
export function fixtureEligibility(ctx: AllocationContext, m: AllocationMatch): string | null {
  if (!ctx.authorized) return "Tournament management permission required";
  if (!ctx.complete) return "Availability or ownership read incomplete — retry";
  if (m.champ_id !== ctx.tournamentId) return "Another tournament";
  if (!/^[0-9a-f-]{36}$/i.test(m.id)) return "Proposed slot is not a saved fixture";
  if (m.status !== "scheduled" || m.is_bye || m.winner_member_id || m.score || m.side_a_points != null || m.side_b_points != null) return "Started, scored or decided match cannot move";
  if (m.game_scores && !["[]", "{}", "null"].includes(String(m.game_scores))) return "Recorded scoring state — cannot move";
  if (!m.player_a_member_id || !m.player_b_member_id) return "TBD players — clash verification unavailable";
  if (m.booking_id) return "Individually booked — member arrangement required";
  if (!m.duration || m.duration <= 0) return "Saved match duration unavailable";
  if (!m.scheduled_date || !m.scheduled_time || !m.court_id) return "No saved allocation";
  if (!blockAt(ctx, { date: m.scheduled_date, time: m.scheduled_time, courtId: m.court_id }, m.duration)) return "Block ownership verification required";
  return null;
}
function participants(m: AllocationMatch, ctx: AllocationContext) {
  return [m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id].filter((x): x is string => !!x).map((id) => ctx.personByMember?.[id] ?? id);
}
export function validateAllocation(ctx: AllocationContext, m: AllocationMatch, slot: AllocationSlot, excluded: string[] = [m.id]): string | null {
  const eligibility = fixtureEligibility(ctx, m); if (eligibility) return eligibility;
  const duration = m.duration ?? 0, start = minutesOf(slot.time), end = start + duration;
  if (!Number.isFinite(start) || end > 1440 || start < 0) return "Invalid time or duration";
  if (`${slot.date}T${slot.time.slice(0, 5)}` <= ctx.now) return "Past start time";
  const origin = blockAt(ctx, { date: m.scheduled_date ?? "", time: m.scheduled_time ?? "", courtId: m.court_id ?? 0 }, duration);
  const target = blockAt(ctx, slot, duration);
  if (!target) return "Outside verified tournament block capacity";
  if (origin?.envelope !== target.envelope) return "Different block envelope";
  if (m.allowedCourts && !m.allowedCourts.includes(slot.courtId)) return "Court not allowed for this category/stage";
  if (m.windowDate && slot.date !== m.windowDate) return "Outside saved round/stage date";
  if (m.windowFrom && start < minutesOf(m.windowFrom) || m.windowTo && end > minutesOf(m.windowTo)) return "Outside saved round/stage time window";
  if ((m.deadline ?? m.play_by) && slot.date > String(m.deadline ?? m.play_by)) return "After play-by deadline";
  const players = participants(m, ctx);
  for (const b of ctx.bookings) {
    if (b.date !== slot.date || !overlap(start, end, minutesOf(b.start_time), minutesOf(b.end_time))) continue;
    if (b.id === target.id) continue;
    if (b.court_id === slot.courtId) return individuallyBooked(b) ? "Individually booked — member arrangement required" : "Externally occupied or unverified booking";
    if ([b.club_member_id, b.opponent_member_id].some((id) => id && players.includes(ctx.personByMember?.[id] ?? id))) return "Player has another club booking";
  }
  for (const other of ctx.matches) {
    if (excluded.includes(other.id) || other.is_bye || ["cancelled", "placeholder"].includes(other.status ?? "") || other.scheduled_date !== slot.date || !other.scheduled_time) continue;
    if (!other.duration) return "Another fixture duration is unknown on this date";
    const os = minutesOf(other.scheduled_time), oe = os + other.duration;
    if (other.court_id === slot.courtId && overlap(start, end, os, oe)) return "Another fixture occupies this court (all categories checked)";
    const rest = m.restMinutes ?? 0;
    if (participants(other, ctx).some((id) => players.includes(id)) && overlap(start - rest, end + rest, os, oe)) return "Player clash or saved rest requirement";
  }
  return null;
}
export function previewSwap(ctx: AllocationContext, a: AllocationMatch, b: AllocationMatch): string | null {
  if (a.id === b.id) return "Select another fixture";
  const excluded = [a.id, b.id];
  const reason = validateAllocation(ctx, a, { date: b.scheduled_date ?? "", time: b.scheduled_time ?? "", courtId: b.court_id ?? 0 }, excluded) ?? validateAllocation(ctx, b, { date: a.scheduled_date ?? "", time: a.scheduled_time ?? "", courtId: a.court_id ?? 0 }, excluded);
  if (reason) return reason;
  const aPlayers = participants(a, ctx), bPlayers = participants(b, ctx);
  if (a.scheduled_date === b.scheduled_date && aPlayers.some((id) => bPlayers.includes(id)) && overlap(minutesOf(b.scheduled_time ?? ""), minutesOf(b.scheduled_time ?? "") + (a.duration ?? 0), minutesOf(a.scheduled_time ?? ""), minutesOf(a.scheduled_time ?? "") + (b.duration ?? 0))) return "Swapped players would overlap";
  return null;
}