/**
 * Per-division Swiss progression for the organiser: which round is next, whether the current round is
 * fully finished (swissRoundGate — same rule as the engine and the DB trigger), and whether the next
 * round already has a schedule record in setup (main-phase plan stage N = Round N). A schedule record
 * is only a date/court plan; it never means the round's games exist.
 */
import { isFinalFixture, swissRoundGate, type GateFixture, type SwissGate } from "./swiss-round-gate";

export type PlanStage = { id?: string; name?: string; phase?: string; unit?: string; mode?: string; date?: string; deadline?: string };
export type SwissDivisionProgress = {
  divisionId: string; divisionIndex: number; label: string; stageId: string; swissRounds: number;
  gate: SwissGate;
  /** Real (non-bye) fixtures of the current round, and how many are final. */
  current: { round: number; done: number; total: number; pending: GateFixture[] };
  /** The next round's setup schedule, when one exists. */
  schedule: PlanStage | null;
  action: "none" | "wait" | "setup_round" | "generate" | "final" | "playoffs" | "plan_conflict";
  /** Setup (Stages & scheduling) vs the live draw, read only when the current round is complete. */
  transition: SwissTransition | null;
};

/** What setup says should follow the Swiss rounds (read-only view of the saved answers). */
export type SwissSetupPlan = { stages?: PlanStage[] | null; format?: { swissRounds?: unknown } | null; formatOverrides?: Record<string, { swissRounds?: unknown } | null> | null };
export type SwissTransition =
  | { kind: "playoff_next"; name: string }
  | {
    kind: "conflict";
    /** live_rounds: setup ends Swiss before the live draw's round count and plans play-offs the live draw doesn't have.
     *  setup_rounds: setup itself disagrees (N Swiss rounds configured, play-offs placed after round M).
     *  not_in_draw: every live Swiss round is done, setup plans play-offs, the live draw has none. */
    reason: "live_rounds" | "setup_rounds" | "not_in_draw";
    setupRounds: number | null; playoffAfterRound: number; liveRounds: number; playoffs: string[]; liveHasPlayoff: boolean; message: string;
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Setup's Swiss round count for one category (category/subcategory override → tournament format). */
export function setupSwissRounds(setup: SwissSetupPlan | null | undefined, label: string): number | null {
  const o = setup?.formatOverrides ?? {};
  const key = Object.keys(o).filter((k) => !!o[k] && norm(label).startsWith(norm(k.split("::")[0])))
    .sort((x, y) => y.length - x.length)[0];
  const n = Number((key ? o[key]?.swissRounds : undefined) ?? setup?.format?.swissRounds);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const joinNames = (xs: string[]) => xs.join(" → ");

/**
 * Compare setup's stage plan with the live draw once the current round is complete. Never chooses for the
 * admin: a disagreement is surfaced as a conflict; only a play-off stage that really exists in the live
 * draw is handed over to stage progression.
 */
export function swissTransition(args: {
  label: string; round: number; complete: boolean; liveRounds: number; liveHasNextStage: boolean; liveNextName?: string | null; setup?: SwissSetupPlan | null;
}): SwissTransition | null {
  const { label, round, complete, liveRounds, liveHasNextStage, setup } = args;
  if (!complete || round < 1) return null;
  const finished = round >= liveRounds;
  if (finished && liveHasNextStage) return { kind: "playoff_next", name: args.liveNextName || "the next stage" };
  const mine = (setup?.stages ?? []).filter((s) => unitMatches(s?.unit, label));
  const playoffs = mine.filter((s) => s?.phase === "playoff").map((s) => String(s.name || "Play-off"));
  if (!playoffs.length) return null;
  const mainRounds = mine.filter((s) => (s?.phase ?? "main") === "main").length;
  const setupRounds = setupSwissRounds(setup, label);
  const po = joinNames(playoffs);
  const base = { liveRounds, playoffs, liveHasPlayoff: liveHasNextStage };
  if (finished) return {
    kind: "conflict", reason: "not_in_draw", setupRounds, playoffAfterRound: mainRounds || setupRounds || round, ...base,
    message: `All ${liveRounds} Swiss rounds are complete. Setup plans ${po} next, but the live draw has no ${playoffs[0]} stage yet, so nothing can be generated from here.`,
  };
  if (setupRounds && mainRounds && setupRounds !== mainRounds && round === mainRounds) return {
    kind: "conflict", reason: "setup_rounds", setupRounds, playoffAfterRound: mainRounds, ...base,
    message: `${setupRounds} Swiss rounds are configured, but ${playoffs[0]} is set to follow Round ${mainRounds}. Decide which is right before continuing — Round ${round + 1} is not skipped automatically.`,
  };
  const end = setupRounds ?? mainRounds;
  if (end && round >= end && end < liveRounds) return {
    kind: "conflict", reason: "live_rounds", setupRounds: end, playoffAfterRound: end, ...base,
    message: liveHasNextStage
      ? `Setup plans ${end} Swiss rounds followed by ${po}. ${playoffs[0]} is saved on the live draw, but this category's live Swiss stage is still set to ${liveRounds} rounds, so ${playoffs[0]} only becomes available after Round ${liveRounds}. Round ${round + 1} is not created automatically.`
      : `Setup plans ${end} Swiss rounds followed by ${po}, but this category's live draw was created with ${liveRounds} Swiss rounds and has no ${playoffs[0]} stage. Round ${round + 1} is not created automatically and ${playoffs[0]} can't be generated until the live draw matches setup.`,
  };
  return null;
}

export function swissDivisionProgress(
  divisions: Array<{ divisionId: string; label: string; stages: Array<{ id: string; kind: string; swissRounds?: number; order?: number; name?: string }>; deferredStages?: Array<{ name?: string }> | null }>,
  fixturesFor: (divisionIndex: number, stageId: string) => GateFixture[],
  plan: PlanStage[] | null | undefined,
  setup?: SwissSetupPlan | null,
): SwissDivisionProgress[] {
  const out: SwissDivisionProgress[] = [];
  divisions.forEach((d, di) => d.stages.filter((s) => s.kind === "swiss").forEach((s) => {
    const rows = fixturesFor(di, s.id);
    const gate = swissRoundGate(rows, s.swissRounds);
    const round = Math.max(0, ...rows.map((f) => Number(f.round) || 1));
    const real = rows.filter((f) => (Number(f.round) || 1) === round && f.a && f.b);
    const pending = real.filter((f) => !isFinalFixture(f));
    const gateDone = real.length - pending.length;
    const schedule = gate.state === "ready" ? scheduleForRound(plan, gate.nextRound, d.label) : null;
    const liveRounds = Number(s.swissRounds) || 0;
    const later = d.stages.filter((x) => x.id !== s.id && (Number(x.order) || 0) > (Number(s.order) || 0)).sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0));
    const liveNextName = later[0]?.name ?? d.deferredStages?.[0]?.name ?? null;
    const transition = swissTransition({
      label: d.label, round, complete: gate.state === "ready" || gate.state === "finished", liveRounds,
      liveHasNextStage: later.length > 0 || (d.deferredStages?.length ?? 0) > 0, liveNextName, setup,
    });
    const base = gate.state === "finished" ? "final" : gate.state === "in_progress" ? "wait" : gate.state === "ready" ? (schedule ? "generate" : "setup_round") : "none";
    const action = transition?.kind === "conflict" ? "plan_conflict" : transition?.kind === "playoff_next" ? "playoffs" : base;
    out.push({ divisionId: d.divisionId, divisionIndex: di, label: d.label, stageId: s.id, swissRounds: liveRounds, gate,
      current: { round, done: gateDone, total: real.length, pending }, schedule, action, transition });
  }));
  return out;
}
