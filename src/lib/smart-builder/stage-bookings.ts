/**
 * Step-by-Step Beta: turn scheduled stages (date + time window + courts) into
 * real court reservations, only when the organiser explicitly asks.
 *
 * - Idempotent: each reservation has a stable external id
 *   `sbs:<planId>:<stageId>:<courtId>` and is upserted on
 *   (club_id, source, external_id), so revisiting never duplicates.
 * - Never double-books: any overlapping active booking that is not one of our
 *   own reservations is reported as a conflict and that slot is skipped.
 * - Club-scoped: only the club's own courts, written into that club's diary.
 */
import { supabase } from "@/integrations/supabase/client";

export type BookableStage = { id: string; name: string; mode: string; date: string; from: string; to: string; courtIds: string[] };
export type StageSlot = { stageId: string; stageName: string; courtId: number; date: string; start: string; end: string; externalId: string };
export type SlotConflict = StageSlot & { reason: string };

const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t);
export const planPrefix = (planId: string) => `sbs:${planId}:`;

/** Pure: which slots can be booked (scheduled, dated, timed, with courts). */
export function bookableSlots(planId: string, stages: BookableStage[]): StageSlot[] {
  return stages
    .filter((s) => s.mode === "scheduled" && s.date && s.from && s.to && s.from < s.to && s.courtIds.length > 0)
    .flatMap((s) => s.courtIds.map((c) => ({
      stageId: s.id, stageName: s.name, courtId: Number(c), date: s.date, start: hhmmss(s.from), end: hhmmss(s.to),
      externalId: `${planPrefix(planId)}${s.id}:${c}`,
    })))
    .filter((x) => Number.isFinite(x.courtId));
}

/** Existing reservations made from this plan. */
export async function loadPlanBookings(clubId: string, planId: string) {
  const { data, error } = await supabase.from("bookings").select("id, external_id, court_id, date, start_time, end_time")
    .eq("club_id", clubId).eq("source", "club_event").eq("status", "active").like("external_id", `${planPrefix(planId)}%`);
  if (error) throw error;
  return data ?? [];
}

/**
 * Pure: slots in this same plan that overlap an earlier slot on the same court/date
 * (e.g. two categories' rounds on Court 1 at the same time). The backend refuses
 * overlapping bookings, so these must be reported, never sent.
 */
export function internalOverlaps(slots: StageSlot[]): SlotConflict[] {
  const out: SlotConflict[] = [];
  slots.forEach((s, i) => {
    const hit = slots.slice(0, i).find((o) => o.courtId === s.courtId && o.date === s.date && o.start < s.end && o.end > s.start && !out.some((x) => x.externalId === o.externalId));
    if (hit) out.push({ ...s, reason: `overlaps ${hit.stageName} on the same court ${hit.start.slice(0, 5)}–${hit.end.slice(0, 5)}` });
  });
  return out;
}

export async function findConflicts(clubId: string, slots: StageSlot[]): Promise<SlotConflict[]> {
  const out: SlotConflict[] = internalOverlaps(slots);
  const own = new Set(slots.map((x) => x.externalId));
  for (const s of slots) {
    if (out.some((x) => x.externalId === s.externalId)) continue;
    const { data, error } = await supabase.from("bookings").select("id, external_id, start_time, end_time, guest_name")
      .eq("club_id", clubId).eq("court_id", s.courtId).eq("date", s.date).eq("status", "active")
      .lt("start_time", s.end).gt("end_time", s.start);
    if (error) throw error;
    // Our own other slots are handled by internalOverlaps (they may be moving in this same save).
    const clash = (data ?? []).find((b: any) => b.external_id !== s.externalId && !own.has(b.external_id));
    if (clash) out.push({ ...s, reason: `already booked ${String((clash as any).start_time).slice(0, 5)}–${String((clash as any).end_time).slice(0, 5)}${(clash as any).guest_name ? ` (${(clash as any).guest_name})` : ""}` });
  }
  return out;
}

/** Books free slots, skips conflicts, removes this plan's reservations no longer in the schedule. */
export async function bookPlanSlots(clubId: string, planId: string, label: string, slots: StageSlot[]) {
  const conflicts = await findConflicts(clubId, slots);
  const blocked = new Set(conflicts.map((c) => c.externalId));
  const free = slots.filter((s) => !blocked.has(s.externalId));
  // One row at a time: a single refused slot must never stop the other stages being booked.
  let booked = 0;
  for (const s of free) {
    const { error } = await supabase.from("bookings").upsert({
      club_id: clubId, court_id: s.courtId, user_id: null, club_member_id: null, date: s.date, start_time: s.start, end_time: s.end,
      status: "active", is_friendly: false, guest_name: `${label} — ${s.stageName}`, source: "club_event", external_id: s.externalId,
      ops_note: "Tournament court reservation (Step-by-Step Beta)",
    } as any, { onConflict: "club_id,source,external_id" });
    if (error) conflicts.push({ ...s, reason: error.message }); else booked++;
  }
  const keep = new Set(slots.map((s) => s.externalId));
  const stale = (await loadPlanBookings(clubId, planId)).filter((b: any) => !keep.has(b.external_id)).map((b: any) => b.id);
  if (stale.length) {
    const { error } = await supabase.from("bookings").delete().in("id", stale);
    if (error) throw error;
  }
  return { booked, conflicts, removed: stale.length };
}

export async function releasePlanBookings(clubId: string, planId: string) {
  const { error } = await supabase.from("bookings").delete().eq("club_id", clubId).eq("source", "club_event").like("external_id", `${planPrefix(planId)}%`);
  if (error) throw error;
}
