/**
 * Schedule maths — are the dates actually feasible for the configured structure?
 *
 *   Tournament window → Stage window → Round dates / play-by deadlines → Fixtures
 *
 * Checks (per division, stages in order):
 * - required rounds per stage come from the stage's own format/size;
 * - FIXED: one valid round date per required round, inside the stage window, never out of order;
 * - PLAY-BY: per-round deadlines (if given) progress; the stage deadline closes the stage;
 * - a dependent stage cannot open before its source stage can be resolved;
 * - knockout rounds keep feeder order (QF ≤ SF ≤ Final);
 * - court capacity per day, only when courts + match minutes + session minutes are all known.
 * Same-day fixed rounds are allowed (weekend events run pools in the morning, knockouts after).
 */
import { allStages, effectiveSchedule, type Stage, type TournamentDefinition } from "./definition";
import { d10, inside } from "@/lib/tournaments/date-window";
import { selectedCourtPool } from "./venues";

export interface ScheduleIssue {
  code: "window" | "rounds_short" | "round_order" | "round_outside" | "dependency" | "deadline_order" | "knockout_order" | "capacity" | "after_end";
  message: string;
  divisionId: string;
  stageId: string;
  /** 0-based round the problem is on, for "Go there". */
  round?: number;
}

const isStep = (s: Stage) => s.kind === "pair_from_positions" || s.kind === "split";

/** Units per pool/field for this stage (null = not known yet). */
function unitsPerGroup(st: Stage): number | null {
  if (st.groupSize) return st.groupSize;
  const n = st.input?.entrants;
  return n ? Math.ceil(n / Math.max(1, st.groups ?? 1)) : null;
}

/** Rounds this stage needs, from its own format. null = can't be known yet. */
export function requiredRounds(st: Stage): number | null {
  const n = unitsPerGroup(st);
  if (st.kind === "swiss") return st.swissRounds ?? null;
  if (n == null || n < 2) return null;
  if (st.kind === "knockout") return Math.ceil(Math.log2(n));
  if (st.kind === "round_robin") return (n % 2 === 0 ? n - 1 : n) * ((st as any).legs === 2 ? 2 : 1);
  return null;
}

/** Display names for a stage's rounds (knockout rounds are named from the final back). */
export function roundNames(st: Stage, count: number): string[] {
  if (st.kind !== "knockout") return Array.from({ length: count }, (_, i) => `Round ${i + 1}`);
  const tail = ["Final", "Semi-final", "Quarter-final", "Round of 16", "Round of 32", "Round of 64"];
  return Array.from({ length: count }, (_, i) => tail[count - 1 - i] ?? `Round ${i + 1}`);
}

const matchesPerRound = (st: Stage) => {
  const n = unitsPerGroup(st) ?? 0;
  return st.kind === "knockout" ? 0 : Math.floor(n / 2) * Math.max(1, st.groups ?? 1);
};

export interface ScheduleFact { where: string; lines: string[]; result: string; ok: boolean }
export interface ScheduleMaths {
  issues: ScheduleIssue[];
  facts: ScheduleFact[];
  /** checked = court capacity was calculated; not_checked = some input is missing (NOT validated); none = nothing on fixed courts. */
  capacity: "checked" | "not_checked" | "none";
  capacityNote: string;
}

/** "Go there" anchor for an issue: exact round box, stage window, or tournament dates. */
export function issueField(i: ScheduleIssue): string {
  if (!i.stageId) return "defaults.startDate";
  if (i.code === "window" ) return `stage.${i.stageId}.window`;
  return i.round != null ? `stage.${i.stageId}.round${i.round}` : `stage.${i.stageId}`;
}

export function scheduleMaths(def: TournamentDefinition): ScheduleMaths {
  const out: ScheduleIssue[] = [];
  const facts: ScheduleFact[] = [];
  const tw = { start: d10(def.scheduleDefaults?.startDate), end: d10(def.scheduleDefaults?.endDate) };
  const load = new Map<string, number>();
  let cap = Infinity, fixedStages = 0;
  const capMissing = new Set<string>();
  if (!tw.start || !tw.end) out.push({ code: "window", divisionId: "", stageId: "", message: "Tournament dates: first and last day must both be set before the schedule can be checked." });
  else if (tw.end < tw.start) out.push({ code: "window", divisionId: "", stageId: "", message: `Tournament dates: last day (${tw.end}) is before the first day (${tw.start}).` });
  facts.push({ where: "Tournament", lines: [`Window: ${tw.start ?? "?"} → ${tw.end ?? "?"}`], result: tw.start && tw.end && tw.end >= tw.start ? "Valid" : "Not valid", ok: !!(tw.start && tw.end && tw.end >= tw.start) });
  for (const div of def.divisions) {
    const stages = allStages(def).filter((r) => r.division.id === div.id).map((r) => r.stage).filter((s) => !isStep(s));
    let prev: { where: string; name: string; done: string | null; fixed: boolean; deadline: string | null } | null = null;
    for (const st of stages) {
      const s = st.schedule;
      const where = `${def.divisions.length > 1 ? `${div.name} · ` : ""}${st.name}`;
      const own = { start: d10(s.startDate), end: d10(s.endDate) };
      const sw = { start: own.start ?? tw.start, end: own.end ?? tw.end };
      const need = requiredRounds(st);
      const before = out.length;
      const push = (i: Omit<ScheduleIssue, "divisionId" | "stageId">) => out.push({ ...i, divisionId: div.id, stageId: st.id });
      const dates = (s.roundDates ?? []).map(d10);
      const lines: string[] = [];
      let start: string | null = null, done: string | null = null, deadline: string | null = null;
      const names = roundNames(st, Math.max(need ?? 0, dates.length));
      lines.push(own.start || own.end ? `Stage window: ${own.start ?? "?"} → ${own.end ?? "?"}` : "Stage window: uses tournament dates");
      if (own.start && own.end && own.end < own.start) push({ code: "window", message: `${where}: stage window ends (${own.end}) before it starts (${own.start}).` });
      for (const x of [own.start, own.end]) if (x && !inside(x, tw))
        push({ code: tw.end && x > tw.end ? "after_end" : "window", message: `${where}: stage window date ${x} is outside the tournament dates ${tw.start} → ${tw.end}.` });
      if (s.mode !== "unset") lines.push(`Scheduling: ${s.mode === "fixed" ? "fixed dates" : s.mode === "play_by" ? "play-by" : s.mode.replace(/_/g, " ")}`);

      if (s.mode === "fixed") {
        fixedStages++;
        const valid = dates.filter((x): x is string => !!x && inside(x, sw));
        lines.push(`Required rounds: ${need ?? "not known until the stage size is set"}`, `Configured valid dates: ${valid.length}`);
        dates.forEach((x, i) => {
          if (x && !inside(x, sw)) push({ code: tw.end && x > tw.end ? "after_end" : "round_outside", round: i,
            message: `${where}: ${names[i] ?? `Round ${i + 1}`} (${x}) is outside the ${own.start || own.end ? "stage window" : "tournament dates"}${sw.start && sw.end ? ` ${sw.start} → ${sw.end}` : ""}.` });
        });
        if (need != null && valid.length < need)
          push({ code: "rounds_short", round: valid.length, message: `${where} requires ${need} rounds but only ${valid.length} valid round date${valid.length === 1 ? " is" : "s are"} configured.` });
        for (let i = 1; i < dates.length; i++) {
          const a = dates[i - 1], b = dates[i];
          if (a && b && b < a) push({ code: st.kind === "knockout" ? "knockout_order" : "round_order", round: i,
            message: st.kind === "knockout"
              ? `${where}: ${names[i]} (${b}) is before its feeder ${names[i - 1]} (${a}).`
              : `${where}: ${names[i]} (${b}) is before ${names[i - 1]} (${a}) — fixed round dates must be in order.` });
        }
        start = dates.find(Boolean) ?? own.start ?? null;
        done = (need != null ? dates[need - 1] : null) ?? [...dates].reverse().find(Boolean) ?? null;
        if (done) lines.push(`Latest required completion: ${done}`);
        const e = effectiveSchedule(def, st);
        const courts = selectedCourtPool(def).length, mm = e.matchMinutes.value as number | null, sm = e.sessionMinutes.value as number | null;
        if (!courts) capMissing.add("courts"); if (!mm) capMissing.add("match minutes"); if (!sm) capMissing.add("session minutes");
        if (courts && mm && sm) {
          dates.slice(0, need ?? dates.length).forEach((x) => { if (x) load.set(x, (load.get(x) ?? 0) + matchesPerRound(st)); });
          cap = Math.min(cap, courts * Math.floor(sm / mm));
        }
      } else if (s.mode === "play_by") {
        deadline = own.end ?? tw.end;
        start = own.start;
        done = deadline;
        lines.push(`Required rounds: ${need ?? "not known yet"}`, `Stage play-by date: ${deadline ?? "?"}`);
        for (let i = 1; i < dates.length; i++) {
          const a = dates[i - 1], b = dates[i];
          if (a && b && b <= a) push({ code: "deadline_order", round: i, message: `${where}: ${names[i]} play-by (${b}) must be after ${names[i - 1]} play-by (${a}).` });
        }
        dates.forEach((x, i) => { if (x && !inside(x, sw)) push({ code: "round_outside", round: i, message: `${where}: ${names[i]} play-by (${x}) is outside the stage's dates.` }); });
      } else {
        start = own.start; done = own.end;
      }

      if (prev) {
        lines.push(`Depends on: ${prev.where}`, `${prev.name} latest required completion: ${prev.done ?? "not known"}`);
        const both = prev.fixed && s.mode === "fixed";
        const firstDate = s.mode === "fixed" ? dates.find(Boolean) ?? null : null;
        const opening = firstDate ?? start;
        if (opening) lines.push(`${st.name} configured start: ${opening}`);
        if (prev.done && opening && (both ? opening < prev.done : opening <= prev.done))
          push({ code: "dependency", round: 0,
            message: `${where} opens on ${opening}, but ${prev.name} only resolves ${prev.fixed ? "after its last round on" : "at its play-by date"} ${prev.done}. Move ${st.name} after ${prev.done}.` });
        if (s.mode === "play_by" && prev.deadline && deadline && deadline <= prev.deadline)
          push({ code: "deadline_order", message: `${where}: play-by date ${deadline} must be after ${prev.name}'s play-by date ${prev.deadline}.` });
        if (s.mode === "play_by" && !own.start && !own.end && prev.deadline && prev.deadline === tw.end)
          push({ code: "dependency", message: `${where}: ${prev.name} plays until the tournament's last day (${tw.end}), so ${st.name} has no time left. Give ${prev.name} an earlier stage window or extend the tournament.` });
      }
      const mine = out.slice(before);
      facts.push({ where, lines, ok: !mine.length,
        result: !mine.length ? "Feasible" : mine.some((m) => m.code === "dependency") ? "Starts too early" : mine.some((m) => m.code === "rounds_short") ? "Not feasible — too few dates" : "Not feasible" });
      prev = { where, name: st.name, done, fixed: s.mode === "fixed", deadline };
    }
  }
  if (Number.isFinite(cap)) for (const [day, n] of load) if (n > cap) {
    const first = allStages(def).find((r) => (r.stage.schedule.roundDates ?? []).some((x) => d10(x) === day));
    const ri = (first?.stage.schedule.roundDates ?? []).findIndex((x) => d10(x) === day);
    out.push({ code: "capacity", divisionId: first?.division.id ?? "", stageId: first?.stage.id ?? "", round: ri >= 0 ? ri : undefined,
      message: `${day}: ${n} games are scheduled but the selected courts fit only ${cap} in the session.` });
  }
  const capacity: ScheduleMaths["capacity"] = !fixedStages ? "none" : capMissing.size ? "not_checked" : "checked";
  const capacityNote = capacity === "checked" ? `Court capacity checked: up to ${cap} games per day`
    : capacity === "not_checked" ? `Court capacity not checked — needs ${[...capMissing].join(", ")}` : "No fixed-date stages — court capacity not applicable";
  return { issues: out, facts, capacity, capacityNote };
}

export function scheduleMathsIssues(def: TournamentDefinition): ScheduleIssue[] {
  return scheduleMaths(def).issues;
}
