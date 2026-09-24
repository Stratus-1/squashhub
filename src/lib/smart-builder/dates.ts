/** Builder-side view of the canonical date hierarchy. Uses the same checks as the engine. */
import { allStages, type Stage, type TournamentDefinition } from "./definition";
import { d10, specDateIssues, stageWindow, type DateIssue, type DateWindow } from "@/lib/tournaments/date-window";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";

/** The ONE tournament window (maps to tournaments.start_date / end_date). */
export function tournamentWindow(def: TournamentDefinition): DateWindow {
  return { start: d10(def.scheduleDefaults?.startDate), end: d10(def.scheduleDefaults?.endDate) };
}

const planned = (st: Stage) => ({
  id: st.id, name: st.name, order: 0, kind: "pools" as const,
  schedule: {
    rule: st.schedule.mode === "fixed" ? "fixed" as const : st.schedule.mode === "play_by" ? "play_by" as const : null,
    start: d10(st.schedule.startDate), end: d10(st.schedule.endDate),
    date: st.schedule.roundDates?.[0] ?? null,
    deadline: st.schedule.mode === "play_by" ? d10(st.schedule.endDate) : null,
    roundDates: st.schedule.roundDates,
  },
});

export function stageWindowOf(def: TournamentDefinition, st: Stage) {
  return stageWindow(planned(st) as any, tournamentWindow(def));
}

export function definitionDateIssues(def: TournamentDefinition): DateIssue[] {
  const spec = {
    version: 1, architecture: "structured", name: def.name,
    divisions: def.divisions.map((d) => ({
      divisionId: d.id, label: d.name,
      stages: allStages(def).filter((r) => r.division.id === d.id).map((r) => planned(r.stage)),
    })),
  } as unknown as TournamentSpec;
  return specDateIssues(spec, tournamentWindow(def));
}
