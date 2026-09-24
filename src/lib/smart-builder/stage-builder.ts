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

/** Re-link every stage to the one before it, and give the first stage the entries. */
export function relink(d: Division) {
  const ss = stagesOf(d);
  ss.forEach((s, i) => {
    s.input = { ...s.input, fromStageId: i === 0 ? null : ss[i - 1].id };
    if (i === 0) { s.progression = null; s.qualifierMapping = s.kind === "knockout" ? null : s.qualifierMapping; }
    else if (!s.progression) s.progression = defaultProgression(ss[i - 1], s);
  });
}

export function defaultProgression(prev: Stage, cur: Stage): NonNullable<Stage["progression"]> {
  if (prev.discipline === "singles" && cur.discipline === "doubles") return { mode: "form_pairs", standings: null, pairing: null };
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

export function addStage(d: Division, format: BuilderFormat = "round_robin") {
  const ss = stagesOf(d);
  const last = ss[ss.length - 1];
  const s = makeStage(format, (last?.discipline as "singles" | "doubles") ?? (d.entry === "pairs" ? "doubles" : "singles"), ss.length + 1);
  if (last) { s.schedule = { mode: last.schedule.mode, courtsPerVenue: last.schedule.courtsPerVenue ?? null }; s.generation = "owner_approval"; }
  ss.push(s);
  relink(d);
  return s.id;
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

export function setFormat(d: Division, id: string, format: BuilderFormat) {
  const ss = stagesOf(d);
  const s = ss.find((x) => x.id === id)!;
  s.kind = format;
  if (format !== "round_robin") { s.groups = 1; s.legs = undefined; }
  if (format === "swiss") s.swissRounds = s.swissRounds ?? 5; else s.swissRounds = null;
  if (format !== "knockout") s.thirdPlace = undefined;
  const i = ss.indexOf(s);
  if (i > 0) s.progression = defaultProgression(ss[i - 1], s);
  if (ss[i + 1]) ss[i + 1].progression = defaultProgression(s, ss[i + 1]);
}

export function setDiscipline(d: Division, id: string, disc: "singles" | "doubles") {
  const ss = stagesOf(d);
  const i = ss.findIndex((x) => x.id === id);
  ss[i].discipline = disc;
  if (i > 0) ss[i].progression = defaultProgression(ss[i - 1], ss[i]);
  if (ss[i + 1]) ss[i + 1].progression = defaultProgression(ss[i], ss[i + 1]);
}

/** Starting template: singles round robin → pairs formed → doubles round robin, points added up. */
export function diamondTemplate(def: TournamentDefinition) {
  const d = def.divisions[0];
  if (!d) return;
  d.entry = "individual";
  const s1 = makeStage("round_robin", "singles", 1); s1.name = "Singles round robin";
  const s2 = makeStage("round_robin", "doubles", 2); s2.name = "Doubles round robin";
  s2.progression = { mode: "form_pairs", standings: "carry", pairing: "fold" };
  s2.generation = "owner_approval";
  d.sections = [{ id: d.sections[0]?.id ?? "sec1", name: "Main", stages: [s1, s2] }];
  def.finalStandings = "cumulative";
  relink(d);
}

export function transitionText(prev: Stage, cur: Stage): string {
  const p = cur.progression;
  if (!p) return "↓ not decided";
  const carry = p.standings === "carry" ? "points carry forward" : p.standings === "reset" ? "points reset" : "points: not decided";
  if (p.mode === "qualifiers") return `↓ top ${prev.advance?.perGroup ?? "?"}${prev.groups > 1 ? " from each pool" : ""} qualify`;
  if (p.mode === "form_pairs") {
    const how = p.pairing === "fold" ? "1st + last" : p.pairing === "positions" ? "1st + 2nd" : p.pairing === "manual" ? "pairs set by you" : "pairing not decided";
    return `↓ pairs formed (${how}) · ${carry}`;
  }
  return `↓ same players continue · ${carry}`;
}

export function stageSummary(s: Stage, entrants?: number | null): string {
  const disc = s.discipline === "doubles" ? "Doubles" : "Singles";
  const fmt = FORMAT_LABEL[s.kind as BuilderFormat] ?? s.kind;
  const extra = s.kind === "swiss" ? ` · ${s.swissRounds ?? "?"} rounds`
    : s.kind === "round_robin" ? (s.groups > 1 ? ` · ${s.groups} pools${s.groupSize ? ` × ${s.groupSize}` : entrants ? ` × ~${Math.ceil(entrants / s.groups)}` : ""}` : " · one field") + (s.legs === 2 ? " · twice" : "")
    : s.thirdPlace ? " · with 3rd/4th" : "";
  return `${disc} · ${fmt}${extra}`;
}
