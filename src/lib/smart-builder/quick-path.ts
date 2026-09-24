/**
 * Fast "I know what I want" path.
 * Three SEPARATE layers over the SAME TournamentDefinition:
 *   1. format      — how matches are played (stage.kind: round_robin | swiss | knockout)
 *   2. grouping    — one field or pools (stage.groups / groupSize; a pool is a container, not a format)
 *   3. progression — play-offs after the stage or not (a second knockout stage fed by qualifiers)
 * Generation still goes definition → spec → engine. No separate simple-format logic.
 */
import { emptyDefinition, newStage, type Stage, type TournamentDefinition } from "./definition";

export type QuickPath = "round_robin" | "swiss" | "knockout" | "custom";

export const QUICK_PATHS: Array<{ key: QuickPath; label: string; hint: string }> = [
  { key: "round_robin", label: "Round robin", hint: "Everyone in the field or group plays everyone." },
  { key: "swiss", label: "Swiss pairing", hint: "Paired each round by results, for a set number of rounds." },
  { key: "knockout", label: "Knockout", hint: "Seeded or drawn bracket; winners advance." },
  { key: "custom", label: "Custom / mixed format", hint: "Multiple stages, different formats per division, custom progression." },
];

/** Format of the fast path. Legacy "pools_playoffs" drafts read as round robin. */
export const quickFormat = (def: TournamentDefinition): QuickPath | null =>
  (def.quickPath as string) === "pools_playoffs" ? "round_robin" : ((def.quickPath as QuickPath | null | undefined) ?? null);

const ko = (from: string): Stage => ({
  ...newStage("knockout", "Play-offs"),
  input: { fromStageId: from }, groupSize: null, qualifierMapping: "reseed", generation: "owner_approval", playoffScheduling: "owner",
  schedule: { mode: "unset" },
});

function firstStage(path: QuickPath): Stage {
  if (path === "swiss") return { ...newStage("swiss", "Swiss rounds"), groupSize: null, swissRounds: 5 };
  if (path === "knockout") return { ...newStage("knockout", "Knockout"), groupSize: null };
  return { ...newStage("round_robin", "Round robin"), groupSize: null };
}

export function presetDefinition(path: QuickPath): TournamentDefinition {
  const def = emptyDefinition();
  def.quickPath = path;
  if (path === "custom") {
    // Stage builder starts with one stage; the owner adds more in order.
    const s = { ...newStage("round_robin", "Stage 1"), groupSize: null, discipline: "singles" as const };
    def.divisions = [{ id: "div1", name: "Main draw", eligibility: "open", entry: "individual", sections: [{ id: "sec1", name: "Main", stages: [s] }] } as any];
    return def;
  }
  def.quickAnswers = { pools: null, playoffs: null };
  def.divisions = [{ id: "div1", name: "Main draw", eligibility: "open", entry: "individual", sections: [{ id: "sec1", name: "Main", stages: [firstStage(path)] }] } as any];
  return def;
}

export const hasPools = (def: TournamentDefinition) => (def.divisions[0]?.sections[0]?.stages[0]?.groups ?? 1) > 1;
export const hasPlayoffs = (def: TournamentDefinition) => (def.divisions[0]?.sections[0]?.stages.length ?? 0) > 1;

/** Grouping layer: only changes how the field is divided. Does not touch format or progression. */
export function setPools(def: TournamentDefinition, on: boolean, groups = 2) {
  def.quickAnswers = { pools: on, playoffs: def.quickAnswers?.playoffs ?? null };
  for (const d of def.divisions) {
    const sec = d.sections[0];
    const first = sec?.stages[0];
    if (!first) continue;
    if (on) {
      first.groups = Math.max(2, first.groups > 1 ? first.groups : groups);
      first.name = first.kind === "round_robin" ? "Pool stage" : first.name;
      const po = sec.stages[1];
      if (po && po.qualifierMapping === "reseed") po.qualifierMapping = "cross_pool";
    } else {
      first.groups = 1;
      first.groupSize = null;
      d.poolLabels = undefined;
      if (first.kind === "round_robin") first.name = "Round robin";
      const po = sec.stages[1];
      if (po && po.qualifierMapping !== "reseed") po.qualifierMapping = "reseed";
    }
  }
}

/** Progression layer: add/remove the play-off stage. Does not touch format or grouping. */
export function setPlayoffs(def: TournamentDefinition, on: boolean, qualifiers?: number) {
  def.quickAnswers = { pools: def.quickAnswers?.pools ?? null, playoffs: on };
  for (const d of def.divisions) {
    const sec = d.sections[0];
    if (!sec) continue;
    const first = sec.stages[0];
    if (on && sec.stages.length === 1) {
      const pooled = first.groups > 1;
      first.advance = { role: "qualify", perGroup: qualifiers ?? (pooled ? 2 : 4) };
      sec.stages.push({ ...ko(first.id), qualifierMapping: pooled ? "cross_pool" : "reseed" });
    } else if (!on && sec.stages.length > 1) {
      sec.stages = [first];
      first.advance = { role: "none" };
    }
  }
}

/** Given expected entries, fill in the other of pool count / pool size. */
export function derivePoolShape(entrants: number | null | undefined, groups: number | null, size: number | null) {
  if (!entrants) return { groups, size };
  if (groups && groups > 1) return { groups, size: Math.ceil(entrants / groups) };
  if (size && size > 1) return { groups: Math.max(2, Math.ceil(entrants / size)), size };
  return { groups, size };
}

/**
 * Which question groups show. Each layer only appears once the previous one is answered.
 * Pools are offered for round robin only: the engine does not generate Swiss inside pools, and
 * knockout has no grouping question (separate brackets = separate divisions).
 */
export function quickQuestions(def: TournamentDefinition) {
  const p = quickFormat(def);
  const a = def.quickAnswers ?? { pools: hasPools(def) ? true : null, playoffs: hasPlayoffs(def) ? true : null };
  const poolsQ = p === "round_robin";
  const poolsAnswered = !poolsQ || a.pools !== null || hasPools(def);
  const playoffToggle = (p === "round_robin" || p === "swiss") && poolsAnswered;
  return {
    divisions: true, entries: true, schedule: true, courts: true, seeding: true,
    swiss: p === "swiss",
    poolsToggle: poolsQ,
    pools: poolsQ && hasPools(def),
    playoffToggle,
    playoffs: playoffToggle && hasPlayoffs(def),
    thirdPlace: p === "knockout",
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

const FORMAT_LABEL: Record<string, string> = { round_robin: "Round robin", swiss: "Swiss", knockout: "Knockout", placement: "Placement" };

function koRounds(n: number | null | undefined): string {
  if (!n || n < 2) return "bracket";
  const names = ["Final", "Semi-final", "Quarter-final"];
  let size = 2; const out: string[] = [];
  while (size < n) size *= 2;
  for (let s = size, i = Math.log2(size) - 1; s >= 2; s /= 2, i--) out.push(names[i] ?? `Last ${s}`);
  return out.join(" → ");
}

/** Structured Tournament Map per division: stage → format → grouping → progression. */
export function tournamentMapBlocks(def: TournamentDefinition): Array<{ division: string; lines: string[] }> {
  return def.divisions.map((d) => {
    const stages = d.sections[0]?.stages ?? [];
    const n = stages[0]?.input?.entrants;
    const unit = d.entry === "pairs" ? "pairs" : "players";
    const lines: string[] = [];
    stages.forEach((s, i) => {
      let fmt = FORMAT_LABEL[s.kind] ?? s.kind;
      if (s.kind === "swiss") fmt += ` · ${s.swissRounds ?? "?"} rounds`;
      if (s.kind === "round_robin" && s.legs === 2) fmt += " · twice";
      lines.push(`Stage ${i + 1} — ${fmt}`);
      if (i === 0) {
        const grouping = s.groups > 1 ? `${s.groups} pools${s.groupSize ? ` × ${s.groupSize}` : n ? ` × ~${Math.ceil(n / s.groups)}` : ""}` : "One field";
        lines.push(`  ${grouping}${n ? ` (${n} ${unit})` : ""}`);
      } else {
        const prev = stages[i - 1];
        const q = prev.advance?.perGroup;
        const total = q ? q * Math.max(1, prev.groups) : null;
        lines.splice(lines.length - 1, 0, `  ↓ Top ${q ?? "?"}${prev.groups > 1 ? " from each pool" : ""} qualify`);
        if (s.kind === "knockout") lines.push(`  ${koRounds(total)}${s.thirdPlace ? " + 3rd/4th" : ""}`);
      }
      if (i === 0 && s.kind === "knockout") lines.push(`  ${koRounds(n)} (byes where needed)${s.thirdPlace ? " + 3rd/4th" : ""}`);
    });
    return { division: d.name, lines };
  });
}

/** One-line summary per division (kept for compact places and tests). */
export function tournamentMap(def: TournamentDefinition): string[] {
  return def.divisions.map((d) => {
    const n = d.sections[0]?.stages[0]?.input?.entrants;
    const parts = (d.sections[0]?.stages ?? []).map((s, i) => {
      const fmt = s.kind === "swiss" ? `Swiss ${s.swissRounds ?? "?"} rounds` : FORMAT_LABEL[s.kind] ?? s.kind;
      if (i === 0) return s.groups > 1 ? `${fmt} in ${s.groups} pools, top ${s.advance?.perGroup ?? "?"} each` : fmt;
      return `${fmt} play-offs`;
    });
    return `${d.name}: ${n ?? "?"} ${d.entry === "pairs" ? "pairs" : "players"} · ${parts.join(" → ")}`;
  });
}
