/**
 * Per-division Swiss progression for the organiser: which round is next, whether the current round is
 * fully finished (swissRoundGate — same rule as the engine and the DB trigger), and whether the next
 * round already has a schedule record in setup (main-phase plan stage N = Round N). A schedule record
 * is only a date/court plan; it never means the round's games exist.
 */
import { swissRoundGate, type GateFixture, type SwissGate } from "./swiss-round-gate";

export type PlanStage = { id?: string; name?: string; phase?: string; unit?: string; mode?: string; date?: string; deadline?: string };
export type SwissDivisionProgress = {
  divisionId: string; divisionIndex: number; label: string; stageId: string; swissRounds: number;
  gate: SwissGate;
  /** Real (non-bye) fixtures of the current round, and how many are final. */
  current: { round: number; done: number; total: number; pending: GateFixture[] };
  /** The next round's setup schedule, when one exists. */
  schedule: PlanStage | null;
  action: "none" | "wait" | "setup_round" | "generate" | "final";
};

const unitMatches = (unit: string | undefined, label: string) => {
  const u = String(unit ?? "").trim();
  if (!u) return true;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return u.split("::").some((p) => p && norm(label).startsWith(norm(p)));
};

export function scheduleForRound(plan: PlanStage[] | null | undefined, round: number, label: string): PlanStage | null {
  const main = (plan ?? []).filter((s) => (s?.phase ?? "main") === "main");
  const s = main[round - 1];
  if (!s || !unitMatches(s.unit, label)) return null;
  const has = (s.mode === "scheduled" && !!s.date) || (s.mode === "play_by" && !!s.deadline);
  return has ? s : null;
}

export function swissDivisionProgress(
  divisions: Array<{ divisionId: string; label: string; stages: Array<{ id: string; kind: string; swissRounds?: number }> }>,
  fixturesFor: (divisionIndex: number, stageId: string) => GateFixture[],
  plan: PlanStage[] | null | undefined,
): SwissDivisionProgress[] {
  const out: SwissDivisionProgress[] = [];
  divisions.forEach((d, di) => d.stages.filter((s) => s.kind === "swiss").forEach((s) => {
    const rows = fixturesFor(di, s.id);
    const gate = swissRoundGate(rows, s.swissRounds);
    const round = Math.max(0, ...rows.map((f) => Number(f.round) || 1));
    const real = rows.filter((f) => (Number(f.round) || 1) === round && f.a && f.b);
    const gateDone = gate.state === "in_progress" ? real.length - (real.length - (real.filter((f) => f.winner || ["completed", "walkover", "cancelled", "canceled", "void", "voided", "bye", "forfeit"].includes(String(f.status ?? "").toLowerCase()) || String(f.score ?? "").startsWith("No result")).length)) : real.length;
    const pending = gate.state === "in_progress" ? real.filter((f) => !(f.winner || ["completed", "walkover", "cancelled", "canceled", "void", "voided", "bye", "forfeit"].includes(String(f.status ?? "").toLowerCase()) || String(f.score ?? "").startsWith("No result"))) : [];
    const schedule = gate.state === "ready" ? scheduleForRound(plan, gate.nextRound, d.label) : null;
    const action = gate.state === "finished" ? "final" : gate.state === "in_progress" ? "wait" : gate.state === "ready" ? (schedule ? "generate" : "setup_round") : "none";
    out.push({ divisionId: d.divisionId, divisionIndex: di, label: d.label, stageId: s.id, swissRounds: Number(s.swissRounds) || 0, gate,
      current: { round, done: gateDone, total: real.length, pending }, schedule, action });
  }));
  return out;
}
