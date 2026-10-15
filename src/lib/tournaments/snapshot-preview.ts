/**
 * Super Admin snapshot preview (read-only). Takes an in-memory COPY of a live tournament and derives what the new
 * Swiss progression / round-robin log / Upcoming Fixtures / round scheduling would show, plus every discrepancy.
 * Pure: never writes, books, notifies or mutates its input. Owner decisions are explicit inputs, never assumed.
 */
import { buildSwissProgression, buildProposedSwissGrid, type GridRound } from "@/lib/tournaments/swiss-progression-view";
import { applyBookingEvent, linkedScheduleLabel, type BookingEvent } from "@/lib/tournaments/linked-booking-sync";
import { allocateRoundSlots, stageSchedules, type SlotBooking, type StageSchedule } from "@/lib/tournaments/round-scheduling";

export interface SnapMatch {
  id: string; group_number: number; round_number: number | null; status: string | null; is_bye: boolean | null;
  player_a_member_id: string | null; player_b_member_id: string | null; winner_member_id: string | null; score: string | null;
  scheduled_date: string | null; scheduled_time: string | null; court_id: number | null; booking_id: string | null; play_by: string | null;
}
export interface SnapDivision { groupNumber: number; label: string; kind: "swiss" | "round_robin" | string; swissRounds: number | null }
export interface SnapEntry { group_number: number; club_member_id: string; order_index: number | null }
export interface Snapshot {
  formatPlan: any; divisions: SnapDivision[]; entries: SnapEntry[]; matches: SnapMatch[]; names: Record<string, string>; bookings: SlotBooking[];
  minutes: number;
}
export interface Decisions {
  swissRounds: number;               // owner: 5
  moveRrToStageDates: boolean;       // owner: move RR rounds to their own stage dates
  treatMissingOpponentAsBye: boolean;// owner: yes
}
/** In-memory simulation inputs (never persisted). */
export interface Simulation { results: Record<string, string>; stageOverrides: Record<string, Partial<StageSchedule>>; bookingEvents?: Record<string, BookingEvent[]> }

export type Severity = "info" | "warn" | "block";
export interface Discrepancy { severity: Severity; category: string; text: string; matchIds?: string[] }
export interface UpcomingRow {
  key: string; category: string; round: number; a: string; b: string; when: string;
  source: "live_booked" | "live_play_by" | "live_slot" | "proposed_slot" | "awaiting_approval";
}
export interface CategoryPreview { gn: number; label: string; kind: string; entrants: number; swissGrid?: GridRound[]; swissIssues?: string[]; rrMatches?: SnapMatch[] }
export interface PreviewResult { categories: CategoryPreview[]; upcoming: UpcomingRow[]; discrepancies: Discrepancy[]; stages: StageSchedule[]; proposals: Array<{ round: number; category: string; a: string; b: string; date: string; time: string; courtId: number; source: string }>; unplaced: Array<{ category: string; round: number; label: string; reason: string }> }

const done = (m: SnapMatch) => m.status === "completed";
const fmt = (d: string | null) => d ?? "—";

/** Apply simulated results to a COPY of the matches. */
export function withSimulatedResults(matches: SnapMatch[], results: Record<string, string>): SnapMatch[] {
  return matches.map((m) => (results[m.id] && !done(m) && [m.player_a_member_id, m.player_b_member_id].includes(results[m.id])
    ? { ...m, status: "completed", winner_member_id: results[m.id], score: m.score ?? "3-0 (simulated)" } : { ...m }));
}

export function buildSnapshotPreview(snap: Snapshot, dec: Decisions, sim: Simulation = { results: {}, stageOverrides: {} }): PreviewResult {
  const name = (id: string | null) => (id ? snap.names[id] ?? "Unknown player" : "TBD");
  const stages = stageSchedules(snap.formatPlan).map((s) => ({ ...s, ...(sim.stageOverrides[s.id] ?? {}) }));
  const stageFor = (round: number) => stages[round - 1] ?? null;
  const matches = withSimulatedResults(snap.matches, sim.results).map((m) => (sim.bookingEvents?.[m.id] ?? []).reduce((acc, e) => applyBookingEvent(acc, e), m));
  const out: PreviewResult = { categories: [], upcoming: [], discrepancies: [], stages, proposals: [], unplaced: [] };
  const D = out.discrepancies;
  const pending: Array<{ key: string; category: string; round: number; a: string; b: string; players: string[] }> = [];

  if (stages.length < dec.swissRounds) D.push({ severity: "block", category: "All", text: `Timeline has ${stages.length} rounds; Swiss needs ${dec.swissRounds}.` });

  for (const div of [...snap.divisions].sort((x, y) => x.groupNumber - y.groupNumber)) {
    const gn = div.groupNumber, cat = div.label;
    const ms = matches.filter((m) => m.group_number === gn);
    const ents = snap.entries.filter((e) => e.group_number === gn).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const cp: CategoryPreview = { gn, label: cat, kind: div.kind, entrants: ents.length };

    // Round 1 (and any live round): booked matches keep their slot; open ones keep their play-by.
    for (const m of ms) {
      const oneSided = !!m.player_a_member_id !== !!m.player_b_member_id;
      if (oneSided && !m.is_bye) D.push({ severity: dec.treatMissingOpponentAsBye ? "warn" : "block", category: cat, text: `R${m.round_number}: ${name(m.player_a_member_id ?? m.player_b_member_id)} has no opponent and is not marked as a bye${dec.treatMissingOpponentAsBye ? " — preview treats it as a bye (free win)." : "."}`, matchIds: [m.id] });
      if (done(m) || m.is_bye || oneSided || !m.player_a_member_id) continue;
      const r = Number(m.round_number), st = stageFor(r);
      if (m.booking_id) { out.upcoming.push({ key: m.id, category: cat, round: r, a: name(m.player_a_member_id), b: name(m.player_b_member_id), when: linkedScheduleLabel(m), source: "live_booked" }); continue; }
      if (st?.mode === "play_by") {
        out.upcoming.push({ key: m.id, category: cat, round: r, a: name(m.player_a_member_id), b: name(m.player_b_member_id), when: `Play by ${fmt(st.deadline)}`, source: "live_play_by" });
        if (m.play_by !== st.deadline) D.push({ severity: "warn", category: cat, text: `R${r} ${name(m.player_a_member_id)} v ${name(m.player_b_member_id)}: deadline ${fmt(m.play_by)} differs from saved ${fmt(st.deadline)}.`, matchIds: [m.id] });
        continue;
      }
      // Timed stage: an existing slot is kept only if it sits inside the stage's saved window.
      const inside = !!st && st.windows.some((w) => w.date === m.scheduled_date);
      if (m.scheduled_date && inside) { out.upcoming.push({ key: m.id, category: cat, round: r, a: name(m.player_a_member_id), b: name(m.player_b_member_id), when: `${m.scheduled_date} ${String(m.scheduled_time ?? "").slice(0, 5)}`, source: "live_slot" }); continue; }
      if (m.scheduled_date && !inside) D.push({ severity: "warn", category: cat, text: `R${r} ${name(m.player_a_member_id)} v ${name(m.player_b_member_id)} sits on ${m.scheduled_date}, outside Round ${r}'s saved dates (${st?.windows.map((w) => w.date).join(", ") || "none"})${dec.moveRrToStageDates ? " — preview re-proposes it in the round's own dates." : "."}`, matchIds: [m.id] });
      if (!m.scheduled_date || dec.moveRrToStageDates) pending.push({ key: m.id, category: cat, round: r, a: name(m.player_a_member_id), b: name(m.player_b_member_id), players: [m.player_a_member_id!, m.player_b_member_id!] });
    }

    if (div.kind === "swiss") {
      if ((div.swissRounds ?? 0) !== dec.swissRounds) D.push({ severity: "warn", category: cat, text: `Saved Swiss rounds ${div.swissRounds ?? "—"}; owner decision ${dec.swissRounds}. Preview uses ${dec.swissRounds}.` });
      const model = buildSwissProgression({
        seedOrder: ents.map((e) => e.club_member_id), names: snap.names, totalRounds: dec.swissRounds,
        matches: ms.filter((m) => (m.round_number ?? 0) > 0).map((m) => {
          const bye = !!m.is_bye || (dec.treatMissingOpponentAsBye && !!m.player_a_member_id !== !!m.player_b_member_id);
          return { id: m.id, round: Number(m.round_number), a: m.player_a_member_id ?? m.player_b_member_id, b: bye ? null : m.player_b_member_id, winner: bye ? (m.player_a_member_id ?? m.player_b_member_id) : m.winner_member_id, isBye: bye, status: bye ? "completed" : m.status, score: m.score, date: m.scheduled_date, time: m.scheduled_time, playBy: m.play_by };
        }),
      });
      const appliedPlayBy: Record<number, string> = {};
      stages.forEach((s, i) => { if (s.mode === "play_by" && s.deadline) appliedPlayBy[i + 1] = s.deadline; });
      const grid = buildProposedSwissGrid(model, { appliedPlayBy });
      cp.swissGrid = grid.rounds; cp.swissIssues = grid.issues;
      if (grid.issues.length) D.push({ severity: "block", category: cat, text: `Positional template unavailable: ${grid.issues.join(" ")}` });
      // Next round: only pairings with BOTH players known become fixtures; never placeholders.
      for (const rd of grid.rounds.filter((x) => !x.created)) for (const b of rd.blocks) {
        const [x, y] = b.rows;
        if (!x.id || !y.id) continue;
        pending.push({ key: `${gn}:${b.matchId}`, category: cat, round: rd.round, a: x.name, b: y.name, players: [x.id, y.id] });
      }
    } else cp.rrMatches = ms;
    out.categories.push(cp);
  }

  // Schedule proposal per round (in memory, block holds + free time, named/player bookings respected).
  for (const r of [...new Set(pending.map((p) => p.round))].sort((a, b) => a - b)) {
    const st = stageFor(r), items = pending.filter((p) => p.round === r);
    if (!st) { items.forEach((p) => out.unplaced.push({ category: p.category, round: r, label: `${p.a} v ${p.b}`, reason: "No saved stage for this round" })); continue; }
    if (st.mode === "play_by") { items.forEach((p) => out.upcoming.push({ key: p.key, category: p.category, round: r, a: p.a, b: p.b, when: `Play by ${fmt(st.deadline)} · awaiting approval`, source: "awaiting_approval" })); continue; }
    const alloc = allocateRoundSlots(items.map((p) => ({ id: p.key, players: p.players })), st.windows.map((w) => ({ ...w, minutes: snap.minutes })), snap.bookings, { allowUnreserved: true });
    for (const a of alloc.assign) {
      const p = items.find((x) => x.key === a.matchId)!;
      out.proposals.push({ round: r, category: p.category, a: p.a, b: p.b, date: a.date, time: a.time, courtId: a.courtId, source: a.source });
      out.upcoming.push({ key: p.key, category: p.category, round: r, a: p.a, b: p.b, when: `${a.date} ${a.time} · Court ${a.courtId} · proposed, needs approval`, source: "proposed_slot" });
    }
    for (const u of alloc.unplaced) { const p = items.find((x) => x.key === u.matchId)!; out.unplaced.push({ category: p.category, round: r, label: `${p.a} v ${p.b}`, reason: u.reason }); }
  }
  if (out.unplaced.length) D.push({ severity: "warn", category: "All", text: `${out.unplaced.length} fixture(s) could not be placed in their round's saved slots (reported, never downgraded to play-by).` });
  out.upcoming.sort((a, b) => a.round - b.round || a.category.localeCompare(b.category));
  return out;
}
