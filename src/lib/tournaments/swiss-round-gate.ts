/**
 * Swiss round gate — the ONE rule for when the next Swiss round may be created.
 * Used by the engine (`nextSwissRound`), the management UI button and mirrored by the DB trigger
 * `guard_swiss_round_progression` (server-side; button disabling is only a convenience).
 *
 *  - Only Round 1 is created at draw time; Round N+1 only after every real fixture of Round N is final.
 *  - Byes (one side, no opponent) are final by definition.
 *  - Final = completed / walkover / has a winner, or closed as cancelled / void / "No result".
 *  - Never skip a round, never exceed the configured round count.
 */
export interface GateFixture { a: string | null; b: string | null; round?: number | null; status?: string | null; winner?: string | null; score?: string | null }

export type SwissGate =
  | { state: "not_started"; nextRound: 1; message: string }
  | { state: "in_progress"; round: number; done: number; total: number; remaining: number; message: string }
  | { state: "ready"; round: number; nextRound: number; message: string }
  | { state: "finished"; round: number; message: string };

const CLOSED = new Set(["completed", "walkover", "cancelled", "canceled", "void", "voided", "bye", "forfeit"]);

export function isFinalFixture(f: GateFixture): boolean {
  if (f.a && !f.b) return true; // bye
  if (f.winner) return true;
  if (typeof f.score === "string" && f.score.startsWith("No result")) return true;
  return CLOSED.has(String(f.status ?? "").toLowerCase());
}

export function swissRoundGate(fixtures: GateFixture[], swissRounds: number | null | undefined): SwissGate {
  const rounds = Math.max(0, Number(swissRounds) || 0);
  const current = Math.max(0, ...fixtures.map((f) => Number(f.round) || 1));
  if (!fixtures.length || current === 0) return { state: "not_started", nextRound: 1, message: "Generate the draw to create Round 1." };
  const real = fixtures.filter((f) => (Number(f.round) || 1) === current && f.a && f.b);
  const done = real.filter(isFinalFixture).length;
  const total = real.length;
  if (done < total) {
    const remaining = total - done;
    return {
      state: "in_progress", round: current, done, total, remaining,
      message: `${done} of ${total} matches complete; finish ${remaining} remaining match${remaining === 1 ? "" : "es"} before generating Round ${current + 1}.`,
    };
  }
  if (current >= rounds) return { state: "finished", round: current, message: `All ${rounds} Swiss rounds are complete — standings are final.` };
  return { state: "ready", round: current, nextRound: current + 1, message: `Round ${current} is complete. Standings updated — you can generate Round ${current + 1} of ${rounds}.` };
}

export type SwissStandingsStatus =
  | { state: "not_started"; total: number }
  | { state: "in_progress"; round: number; total: number; done: number; of: number }
  | { state: "after_round"; round: number; total: number }
  | { state: "final"; round: number; total: number };

/** Standings heading status from actual fixture state: a round counts only once every
 *  real fixture in it is final (byes always final). Round created ≠ round completed. */
export function swissStandingsStatus(fixtures: GateFixture[], swissRounds: number | null | undefined): SwissStandingsStatus {
  const total = Math.max(0, Number(swissRounds) || 0);
  const current = Math.max(0, ...fixtures.map((f) => Number(f.round) || 1));
  if (!fixtures.length || current === 0) return { state: "not_started", total };
  const inRound = fixtures.filter((f) => (Number(f.round) || 1) === current);
  const real = inRound.filter((f) => f.a && f.b);
  const done = real.filter(isFinalFixture).length;
  if (done < real.length || inRound.some((f) => !isFinalFixture(f))) {
    // Round created but no result yet = not underway: standings still reflect the previous round.
    if (done === 0) return current === 1 ? { state: "not_started", total } : { state: "after_round", round: current - 1, total };
    return { state: "in_progress", round: current, total, done, of: real.length };
  }
  if (total > 0 && current >= total) return { state: "final", round: current, total };
  return { state: "after_round", round: current, total };
}
