import type { ProgressionMatchInput, SwissProgressionModel } from "./swiss-progression-view";
import { rrFinishOn, rrFinishSplit, RR_FINISH_FROM_ROUND, RR_FINISH_ROUNDS } from "./swiss-rr-finish";
import { RIVERSIDE_CLUB_ID } from "./swiss-riverside-aabb-charts";

/** Persisted match activity, not a marker visit, a draw or a scheduled date. */
export function hasSwissMatchActivity(m: ProgressionMatchInput): boolean {
  if (!m.a || !m.b || m.isBye || m.forfeitMemberId) return false;
  if (!["in_progress", "paused", "completed"].includes(m.status ?? "")) return false;
  if (m.status === "completed" && m.winner !== m.a && m.winner !== m.b) return false;
  if ((m.sideAPoints ?? 0) > 0 || (m.sideBPoints ?? 0) > 0) return true;
  let scores = m.gameScores;
  if (typeof scores === "string") {
    try { scores = JSON.parse(scores); } catch { scores = null; }
  }
  const sets = Array.isArray(scores) ? scores : scores?.sets ?? [];
  const current = !Array.isArray(scores) ? scores?.current : null;
  if ([...sets, current].some((s) => s && (Number(s.a) > 0 || Number(s.b) > 0))) return true;
  return m.status === "completed" && /[1-9]\d*\s*[-–]\s*\d+|\d+\s*[-–]\s*[1-9]\d*/.test(m.score ?? "");
}

/** One display authority for locked positions, group colours and live RR visibility. */
export function swissRrDisplay(model: SwissProgressionModel, clubId: string | null | undefined) {
  const enabled = clubId === RIVERSIDE_CLUB_ID && model.configuredRounds === RR_FINISH_ROUNDS && rrFinishOn(model.rrFinish);
  const locked = enabled && !!model.rounds.find((r) => r.round === RR_FINISH_FROM_ROUND - 1)?.complete;
  const snapshot = locked ? [...model.rows].sort((a, b) => (a.positions[1] ?? a.seed) - (b.positions[1] ?? b.seed)).map((r) => r.id) : [];
  const split = rrFinishSplit(model.rows.length, enabled ? model.rrFinish?.groups ?? 0 : 0);
  const memberships = new Map(snapshot.map((id, i) => [id, {
    position: i + 1,
    group: i < split.groupRanges.length * 4 ? Math.floor(i / 4) + 1 : null,
  }]));
  const started = locked && model.rounds.some((r) => r.round >= RR_FINISH_FROM_ROUND && r.round <= RR_FINISH_ROUNDS && r.fixtures.some((f) => f.started));
  const groupCount = enabled ? split.groupRanges.length : 0;
  /** Colour group: follows the slot (position) until Round 2 ends, then the locked membership. */
  const groupOf = (id: string | null | undefined, slot: number | null | undefined): number | "swiss" | null => {
    if (!enabled) return null;
    if (locked) { const m = id ? memberships.get(id) : undefined; return m ? m.group ?? "swiss" : null; }
    if (slot == null || slot < 1) return null;
    return slot <= groupCount * 4 ? Math.floor((slot - 1) / 4) + 1 : "swiss";
  };
  const total = model.configuredRounds ?? RR_FINISH_ROUNDS;
  const heading = `${locked ? "Confirmed" : "Projected"} Pairing Groups — Swiss Rounds 1–${RR_FINISH_FROM_ROUND - 1} | Round Robin Rounds ${RR_FINISH_FROM_ROUND}–${total}`;
  const remainderLabel = `Continued Swiss Pairing — Rounds 1–${total}`;
  return { enabled, locked, snapshot, memberships, groupOf, heading, remainderLabel, groupRanges: enabled ? split.groupRanges : [], remainder: enabled ? split.remainder : null, showStandings: started };
}