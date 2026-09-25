/**
 * Custom / mixed format — ordered stage builder over the SAME TournamentDefinition.
 * Each stage keeps separate dimensions: discipline, format (kind), grouping (groups/groupSize),
 * rounds (swissRounds/legs, derived otherwise), schedule, and progression from the previous stage.
 * Nothing here generates games; the definition → spec → engine path is unchanged.
 */
import { newStage, type Division, type Stage, type TournamentDefinition } from "./definition";

export type BuilderFormat = "round_robin" | "swiss" | "knockout";
export const FORMAT_LABEL: Record<BuilderFormat, string> = { round_robin: "Round robin", swiss: "Swiss", knockout: "Knockout" };

const stagesOf = (d: Division) => d.sections[0]?.stages ?? [];

/** Re-link every stage to the one before it. Never chooses a transition for the owner. */
export function relink(d: Division) {
  const ss = stagesOf(d);
  ss.forEach((s, i) => {
    s.input = { ...s.input, fromStageId: i === 0 ? null : ss[i - 1].id };
    if (i === 0) { s.progression = null; s.qualifierMapping = s.kind === "knockout" ? null : s.qualifierMapping; }
    else if (s.progression) reconcile(ss[i - 1], s);
  });
}

/** Match-type change between two stages: singles→doubles needs pairs, doubles→singles needs a split. */
export function shapeChange(prev: Stage, cur: Stage): "to_pairs" | "to_singles" | null {
  if (prev.discipline !== "doubles" && cur.discipline === "doubles") return "to_pairs";
  if (prev.discipline === "doubles" && cur.discipline !== "doubles") return "to_singles";
  return null;
}

/** Drop only the parts of THIS stage's transition that no longer fit. Never touches another stage's settings. */
export function reconcile(prev: Stage, cur: Stage) {
  const p = cur.progression;
  if (!p) return;
  const sc = shapeChange(prev, cur);
  if (p.mode === "form_pairs" && sc !== "to_pairs") p.mode = "all_continue";
  if (sc === "to_pairs" && (p.pairing === "split")) p.pairing = null;
  if (sc === "to_singles" && p.pairing && p.pairing !== "split") p.pairing = null;
  if (!sc) p.pairing = null;
  if (p.mode === "qualifiers" && (cur.kind !== "knockout" || sc)) cur.progression = { mode: "top_n", top: null, standings: p.standings ?? null, pairing: p.pairing ?? null };
}

/** Suggestion shown to the owner (never applied silently). */
export function defaultProgression(prev: Stage, cur: Stage): NonNullable<Stage["progression"]> {
  const sc = shapeChange(prev, cur);
  if (sc) return { mode: "all_continue", standings: null, pairing: sc === "to_singles" ? "split" : null };
  if (cur.kind === "knockout" && (prev.kind === "round_robin" || prev.kind === "swiss")) return { mode: "qualifiers" };
  return { mode: "all_continue", standings: null };
}

export function makeStage(format: BuilderFormat, discipline: "singles" | "doubles", n: number): Stage {
  const s = newStage(format, `Stage ${n}`);
  s.discipline = discipline;
  s.groupSize = null;
  if (format === "swiss") s.swissRounds = 5;
  return s;
}

/** A new stage starts independent: the division's entry type, round robin, one field, nothing scheduled, no transition chosen. */
export function addStage(d: Division, format: BuilderFormat = "round_robin") {
  const ss = stagesOf(d);
  const s = makeStage(format, d.entry === "pairs" ? "doubles" : "singles", ss.length + 1);
  s.schedule = { mode: "unset" };
  s.generation = null as any;
  s.progression = null;
  ss.push(s);
  relink(d);
  return s.id;
}

/** Owner-chosen only: copy the previous stage's match type, format, grouping, rounds and schedule mode. */
export function copyPreviousStage(d: Division, id: string, started = new Set<string>()) {
  const ss = stagesOf(d);
  const i = ss.findIndex((x) => x.id === id);
  if (i <= 0 || started.has(id)) return false;
  const src = ss[i - 1], s = ss[i];
  Object.assign(s, {
    discipline: src.discipline, kind: src.kind, groups: src.groups, groupSize: src.groupSize, legs: src.legs,
    swissRounds: src.swissRounds, thirdPlace: src.thirdPlace, schedule: { ...src.schedule, roundDates: [] },
  });
  reconcile(src, s);
  if (ss[i + 1]) reconcile(s, ss[i + 1]);
  return true;
}

/** Locked stages (games exist) and everything before them cannot move or be removed. */
export function lockedUpTo(d: Division, startedStageIds: Set<string>) {
  const ss = stagesOf(d);
  let last = -1;
  ss.forEach((s, i) => { if (startedStageIds.has(s.id)) last = i; });
  return last;
}

export function removeStage(d: Division, id: string, started = new Set<string>()) {
  const ss = stagesOf(d);
  const i = ss.findIndex((s) => s.id === id);
  if (i < 0 || ss.length <= 1 || i <= lockedUpTo(d, started)) return false;
  ss.splice(i, 1);
  if (ss[i]) ss[i].progression = null;
  if (ss[i - 1]) ss[i - 1].advance = ss[i]?.progression?.mode === "qualifiers" ? ss[i - 1].advance : { role: "none" };
  relink(d);
  return true;
}

export function moveStage(d: Division, id: string, dir: -1 | 1, started = new Set<string>()) {
  const ss = stagesOf(d);
  const i = ss.findIndex((s) => s.id === id);
  const j = i + dir;
  const lock = lockedUpTo(d, started);
  if (i < 0 || j < 0 || j >= ss.length || Math.min(i, j) <= lock) return false;
  [ss[i], ss[j]] = [ss[j], ss[i]];
  // Order changed: transitions around the swap must be answered again.
  [ss[i], ss[j], ss[Math.max(i, j) + 1]].forEach((s) => { if (s) s.progression = null; });
  relink(d);
  return true;
}

export function setFormat(d: Division, id: string, format: BuilderFormat, started = new Set<string>()) {
  const ss = stagesOf(d);
  const s = ss.find((x) => x.id === id)!;
  if (started.has(id)) return false;
  s.kind = format;
  if (format !== "round_robin") { s.groups = 1; s.legs = undefined; }
  if (format === "swiss") s.swissRounds = s.swissRounds ?? 5; else s.swissRounds = null;
  if (format !== "knockout") s.thirdPlace = undefined;
  const i = ss.indexOf(s);
  if (i > 0) reconcile(ss[i - 1], s);
  if (ss[i + 1]) reconcile(s, ss[i + 1]);
  return true;
}

export function setDiscipline(d: Division, id: string, disc: "singles" | "doubles", started = new Set<string>()) {
  const ss = stagesOf(d);
  const i = ss.findIndex((x) => x.id === id);
  if (i < 0 || started.has(id)) return false;
  ss[i].discipline = disc;
  if (i > 0) reconcile(ss[i - 1], ss[i]);
  if (ss[i + 1]) reconcile(ss[i], ss[i + 1]);
  return true;
}

/** Starting template: singles round robin → pairs formed → doubles round robin, points added up. */
export function diamondTemplate(def: TournamentDefinition) {
  const d = def.divisions[0];
  if (!d) return;
  d.entry = "individual";
  const s1 = makeStage("round_robin", "singles", 1); s1.name = "Singles round robin";
  const s2 = makeStage("round_robin", "doubles", 2); s2.name = "Doubles round robin";
  s2.progression = { mode: "all_continue", standings: "carry", pairing: "positions" };
  s2.generation = "owner_approval";
  d.sections = [{ id: d.sections[0]?.id ?? "sec1", name: "Main", stages: [s1, s2] }];
  def.finalStandings = "cumulative";
  relink(d);
}

export const PAIRING_LABEL: Record<string, string> = {
  fold: "pairs: 1st + last, 2nd + second-last", positions: "pairs: 1st + 2nd, 3rd + 4th", manual: "pairs set by you", split: "each pair's players continue individually",
};

export function transitionText(prev: Stage, cur: Stage): string {
  const p = cur.progression;
  if (!p) return "↓ not decided";
  const carry = p.standings === "carry" ? "points carry forward" : p.standings === "reset" ? "points reset" : "points: not decided";
  if (p.mode === "qualifiers") return `↓ top ${prev.advance?.perGroup ?? "?"}${prev.groups > 1 ? " from each pool" : ""} qualify`;
  const who = p.mode === "top_n" ? `top ${p.top ?? "?"} continue` : "everyone continues";
  const sc = shapeChange(prev, cur);
  const shape = sc ? ` · ${p.pairing ? PAIRING_LABEL[p.pairing] : sc === "to_pairs" ? "pairing not decided" : "split not decided"}` : "";
  return `↓ ${who}${shape} · ${carry}`;
}

export function stageSummary(s: Stage, entrants?: number | null): string {
  const disc = s.discipline === "doubles" ? "Doubles" : "Singles";
  const fmt = FORMAT_LABEL[s.kind as BuilderFormat] ?? s.kind;
  const extra = s.kind === "swiss" ? ` · ${s.swissRounds ?? "?"} rounds`
    : s.kind === "round_robin" ? (s.groups > 1 ? ` · ${s.groups} pools${s.groupSize ? ` × ${s.groupSize}` : entrants ? ` × ~${Math.ceil(entrants / s.groups)}` : ""}` : " · one field") + (s.legs === 2 ? " · twice" : "")
    : s.thirdPlace ? " · with 3rd/4th" : "";
  return `${disc} · ${fmt}${extra}`;
}
