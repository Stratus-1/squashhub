/**
 * ONE canonical tournament date window.
 *
 *   Tournament window (tournaments.start_date / end_date — the only copy)
 *     → optional Stage window (explicit override; otherwise inherits)
 *       → Round schedule (fixed date / play-by deadline / window)
 *         → Fixture date
 *
 * Every level must sit inside its parent. The structured spec never stores its own
 * tournament range: inheriting stages keep start/end NULL and are resolved from the
 * tournament row at generation time, so there is nothing to disagree with.
 */
import type { TournamentSpec } from "./engine-service";
import type { PlannedStage } from "./contract";

export interface DateWindow { start: string | null; end: string | null }
export interface DateIssue {
  code: "window_order" | "window_missing" | "stage_order" | "stage_outside" | "round_outside" | "deadline_outside" | "fixture_outside";
  level: "error";
  message: string;
  divisionId?: string;
  stageId?: string;
  /** Suggested canonical window that would contain the offending date. */
  extendTo?: DateWindow;
}

export const d10 = (s?: string | null) => (s ? s.slice(0, 10) : null);
const before = (a: string, b: string) => a < b;

export function inside(date: string | null | undefined, w: DateWindow): boolean {
  const d = d10(date);
  if (!d) return true;
  if (w.start && before(d, d10(w.start)!)) return false;
  if (w.end && before(d10(w.end)!, d)) return false;
  return true;
}

/** Stage window: its own explicit override, otherwise the tournament window. */
export function stageWindow(stage: PlannedStage, tw: DateWindow): DateWindow & { inherits: boolean } {
  const s = stage.schedule ?? ({} as PlannedStage["schedule"]);
  const own = { start: d10(s.start), end: d10(s.end) };
  const inherits = !own.start && !own.end;
  return { start: own.start ?? d10(tw.start), end: own.end ?? d10(tw.end), inherits };
}

const widen = (tw: DateWindow, date: string): DateWindow => ({
  start: tw.start && before(date, d10(tw.start)!) ? date : d10(tw.start),
  end: tw.end && before(d10(tw.end)!, date) ? date : d10(tw.end),
});

/** Validate the whole hierarchy of a structured spec against the canonical window. */
export function specDateIssues(spec: TournamentSpec, tw: DateWindow): DateIssue[] {
  const out: DateIssue[] = [];
  if (tw.start && tw.end && before(d10(tw.end)!, d10(tw.start)!))
    out.push({ code: "window_order", level: "error", message: "Tournament end date is before its start date." });
  for (const d of spec.divisions) for (const st of d.stages) {
    const s = st.schedule ?? ({} as PlannedStage["schedule"]);
    const sw = stageWindow(st, tw);
    const where = `${d.label} · ${st.name}`;
    if (sw.start && sw.end && before(sw.end, sw.start))
      out.push({ code: "stage_order", level: "error", message: `${where}: stage window ends before it starts.`, divisionId: d.divisionId, stageId: st.id });
    for (const x of [d10(s.start), d10(s.end)]) if (x && !inside(x, tw))
      out.push({ code: "stage_outside", level: "error", message: `${where}: stage window (${x}) is outside the tournament dates.`, divisionId: d.divisionId, stageId: st.id, extendTo: widen(tw, x) });
    const rounds = [s.date, ...((s as any).roundDates ?? [])].map(d10).filter(Boolean) as string[];
    for (const r of rounds) if (!inside(r, sw))
      out.push({ code: "round_outside", level: "error", message: `${where}: round date ${r} is outside the ${sw.inherits ? "tournament" : "stage"} window.`, divisionId: d.divisionId, stageId: st.id, extendTo: sw.inherits ? widen(tw, r) : undefined });
    if (s.deadline && !inside(s.deadline, sw))
      out.push({ code: "deadline_outside", level: "error", message: `${where}: play-by deadline ${d10(s.deadline)} is outside the ${sw.inherits ? "tournament" : "stage"} window.`, divisionId: d.divisionId, stageId: st.id, extendTo: sw.inherits ? widen(tw, d10(s.deadline)!) : undefined });
  }
  return out;
}

/**
 * Fill inheriting stage schedules from the canonical window, for generation only.
 * Explicit overrides are kept as they are. Nothing here is persisted back.
 */
export function resolveSpecDates(spec: TournamentSpec, tw: DateWindow): TournamentSpec {
  return {
    ...spec,
    divisions: spec.divisions.map((d) => ({
      ...d,
      stages: d.stages.map((st) => {
        const s = st.schedule ?? ({ rule: null } as PlannedStage["schedule"]);
        const sw = stageWindow(st, tw);
        return {
          ...st,
          schedule: {
            ...s,
            start: s.start ?? sw.start, end: s.end ?? sw.end,
            date: s.rule === "fixed" ? s.date ?? sw.start : s.date,
            deadline: s.rule === "play_by" ? s.deadline ?? sw.end : s.deadline,
          },
        };
      }),
    })),
  };
}

/** A fixture date must fit its round, stage and tournament. */
export function fixtureDateIssue(spec: TournamentSpec, tw: DateWindow, divisionId: string, stageId: string, date: string, roundDeadline?: string | null): DateIssue | null {
  const d = spec.divisions.find((x) => x.divisionId === divisionId);
  const st = d?.stages.find((x) => x.id === stageId);
  if (!d || !st) return { code: "fixture_outside", level: "error", message: "Unknown division or stage." };
  const sw = stageWindow(st, tw);
  const where = `${d.label} · ${st.name}`;
  if (!inside(date, tw)) return { code: "fixture_outside", level: "error", message: `${where}: ${d10(date)} is outside the tournament dates.`, divisionId, stageId, extendTo: widen(tw, d10(date)!) };
  if (!inside(date, sw)) return { code: "fixture_outside", level: "error", message: `${where}: ${d10(date)} is outside the stage window.`, divisionId, stageId };
  const dl = roundDeadline ?? (st.schedule?.rule === "play_by" ? st.schedule.deadline : null);
  if (dl && before(d10(dl)!, d10(date)!)) return { code: "fixture_outside", level: "error", message: `${where}: ${d10(date)} is after the round's play-by date ${d10(dl)}.`, divisionId, stageId };
  return null;
}

/** What would fall outside if the tournament window changed to `next`. */
export function windowChangeImpact(spec: TournamentSpec, next: DateWindow, fixtures: Array<{ divisionId: string; stageId: string; date: string | null }>): string[] {
  const msgs = specDateIssues(spec, next).map((i) => i.message);
  for (const f of fixtures) {
    if (!f.date) continue;
    const i = fixtureDateIssue(spec, next, f.divisionId, f.stageId, f.date);
    if (i) msgs.push(i.message);
  }
  return [...new Set(msgs)];
}
