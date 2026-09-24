/**
 * Fast "I know what I want" path.
 * Progressive disclosure over the SAME TournamentDefinition: a preset structure plus a
 * list of which questions apply. Generation still goes definition → spec → engine.
 */
import { emptyDefinition, newStage, type Stage, type TournamentDefinition } from "./definition";

export type QuickPath = "round_robin" | "swiss" | "knockout" | "pools_playoffs" | "custom";

export const QUICK_PATHS: Array<{ key: QuickPath; label: string; hint: string }> = [
  { key: "round_robin", label: "Simple round robin", hint: "Everyone plays everyone. Optional play-offs after." },
  { key: "swiss", label: "Swiss pairing", hint: "Set number of rounds, paired by results. Works for big fields." },
  { key: "knockout", label: "Simple knockout", hint: "Seeded draw, byes where needed, win and move on." },
  { key: "pools_playoffs", label: "Pools, then play-offs", hint: "Pools first, top finishers into a knockout." },
  { key: "custom", label: "More complicated / custom", hint: "Multi-stage, different formats per division, custom progression." },
];

const ko = (from: string, perGroup: number): Stage => ({
  ...newStage("knockout", "Play-offs"),
  input: { fromStageId: from }, groupSize: null, qualifierMapping: "reseed", generation: "owner_approval", playoffScheduling: "owner",
  schedule: { mode: "unset" },
});

/** First-stage shape for a path. Never includes playoffs unless the path requires them. */
function firstStage(path: QuickPath): Stage {
  if (path === "swiss") return { ...newStage("swiss", "Swiss rounds"), groupSize: null, swissRounds: 5 };
  if (path === "knockout") return { ...newStage("knockout", "Knockout"), groupSize: null };
  if (path === "pools_playoffs") return { ...newStage("round_robin", "Pool stage"), groups: 2, groupSize: 4, advance: { role: "qualify", perGroup: 2 } };
  return { ...newStage("round_robin", "Round robin"), groupSize: null };
}

export function presetDefinition(path: QuickPath): TournamentDefinition {
  const def = emptyDefinition();
  def.quickPath = path;
  if (path === "custom") return def;
  const st = firstStage(path);
  const stages = [st];
  if (path === "pools_playoffs") stages.push({ ...ko(st.id, 2), qualifierMapping: "cross_pool" });
  def.divisions = [{ id: "div1", name: "Main draw", eligibility: "open", entry: "individual", sections: [{ id: "sec1", name: "Main", stages }] } as any];
  return def;
}

export const hasPlayoffs = (def: TournamentDefinition) => (def.divisions[0]?.sections[0]?.stages.length ?? 0) > 1;

/** Turn play-offs on/off for RR / Swiss. Pools path always has them. */
export function setPlayoffs(def: TournamentDefinition, on: boolean, qualifiers = 4) {
  for (const d of def.divisions) {
    const sec = d.sections[0];
    if (!sec) continue;
    const first = sec.stages[0];
    if (on && sec.stages.length === 1) {
      first.advance = { role: "qualify", perGroup: qualifiers };
      sec.stages.push(ko(first.id, qualifiers));
    } else if (!on && sec.stages.length > 1) {
      sec.stages = [first];
      first.advance = { role: "none" };
    }
  }
}

/** Which question groups show for a path. Anything not listed is hidden, not defaulted silently. */
export function quickQuestions(def: TournamentDefinition) {
  const p = def.quickPath;
  const po = p === "pools_playoffs" || ((p === "round_robin" || p === "swiss") && hasPlayoffs(def));
  return {
    divisions: true, entries: true, schedule: true, courts: true, seeding: true,
    swiss: p === "swiss",
    pools: p === "pools_playoffs",
    playoffToggle: p === "round_robin" || p === "swiss",
    playoffs: po,
  };
}

/** Copy division 1's structure to every other division (fresh ids per division). */
export function syncDivisions(def: TournamentDefinition) {
  const src = def.divisions[0];
  if (!src) return;
  def.divisions.forEach((d, k) => {
    if (k === 0) return;
    d.poolLabels = src.poolLabels ? [...src.poolLabels] : undefined;
    d.sections = JSON.parse(JSON.stringify(src.sections)
      .replace(/"id":"([^"]+)"/g, (_m, id) => `"id":"${id}-${d.id}"`)
      .replace(/"fromStageId":"([^"]+)"/g, (_m, id) => `"fromStageId":"${id}-${d.id}"`));
  });
}

/** Short Tournament Map line per division, shown before Generate. */
export function tournamentMap(def: TournamentDefinition): string[] {
  return def.divisions.map((d) => {
    const n = d.sections[0]?.stages[0]?.input?.entrants;
    const parts = (d.sections[0]?.stages ?? []).map((s) => {
      if (s.kind === "swiss") return `Swiss ${s.swissRounds ?? "?"} rounds`;
      if (s.kind === "knockout") return s.input.fromStageId ? `Play-offs (top ${s.input.fromStageId ? "qualifiers" : ""})` : "Knockout";
      return s.groups > 1 ? `${s.groups} pools, top ${s.advance?.perGroup ?? "?"} each` : "Round robin";
    });
    return `${d.name}: ${n ?? "?"} ${d.entry === "pairs" ? "pairs" : "players"} · ${parts.join(" → ")}`;
  });
}
