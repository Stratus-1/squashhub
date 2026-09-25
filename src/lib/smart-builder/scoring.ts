/**
 * Match scoring per stage and per round — separate from structure, rotation and pairing.
 * Resolution: tournament default → stage → round override. Bells (time-capped) needs its own
 * minutes on whichever level selects it, and those minutes drive schedule maths.
 */
import type { Scoring, Stage, TournamentDefinition } from "./definition";

export type ScoringChoice = "" | "par11_3" | "par11_5" | "par15_3" | "par15_5" | "bells";
export const SCORING_CHOICES: Array<[ScoringChoice, string]> = [
  ["par11_3", "PAR 11 — best of 3"], ["par11_5", "PAR 11 — best of 5"],
  ["par15_3", "PAR 15 — best of 3"], ["par15_5", "PAR 15 — best of 5"],
  ["bells", "Bells — time-capped points"],
];

const clean = (x?: Scoring | null) => Object.fromEntries(Object.entries(x ?? {}).filter(([, v]) => v !== undefined && v !== null)) as Scoring;

export function effectiveScoring(def: TournamentDefinition | null | undefined, st: Stage, round?: number): Scoring {
  const r = round != null ? st.roundScoring?.[String(round)] : undefined;
  const merged = { ...clean(def?.scoring), ...clean(st.scoring), ...clean(r) };
  // Choosing Bells or PAR at a lower level replaces the other family entirely.
  const top = clean(r).mode ? clean(r) : clean(st.scoring).mode ? clean(st.scoring) : null;
  if (top?.mode === "time_capped_points") return { mode: "time_capped_points", timeCapMinutes: top.timeCapMinutes ?? null };
  if (top?.mode === "standard") { const { timeCapMinutes: _t, ...rest } = merged; return { ...rest, mode: "standard" }; }
  return merged;
}

export const isBells = (sc: Scoring) => sc.mode === "time_capped_points";

export function choiceOf(sc?: Scoring | null): ScoringChoice {
  if (!sc?.mode) return "";
  if (sc.mode === "time_capped_points") return "bells";
  return `par${sc.pointsPerGame ?? 11}_${sc.bestOf ?? 5}` as ScoringChoice;
}

export function scoringFromChoice(c: ScoringChoice, prev?: Scoring | null): Scoring | undefined {
  if (!c) return undefined;
  if (c === "bells") return { mode: "time_capped_points", timeCapMinutes: prev?.mode === "time_capped_points" ? prev.timeCapMinutes ?? null : null };
  const [, p, b] = c.match(/par(\d+)_(\d)/)!;
  return { mode: "standard", pointsPerGame: Number(p) as 11 | 15, bestOf: Number(b) as 3 | 5 };
}

export function scoringText(sc: Scoring): string {
  if (isBells(sc)) return `Bells — ${sc.timeCapMinutes ? `${sc.timeCapMinutes} min per match` : "match minutes not set"}`;
  if (sc.pointsPerGame || sc.bestOf) return `PAR ${sc.pointsPerGame ?? 11} — best of ${sc.bestOf ?? 5}${sc.playAllGames ? ", play all games" : ""}`;
  return "Scoring not set";
}

/** "Singles — Bells — 20 min per match". */
export const stageScoringLine = (def: TournamentDefinition | null | undefined, st: Stage, round?: number) =>
  `${st.discipline === "doubles" ? "Doubles" : "Singles"} — ${scoringText(effectiveScoring(def, st, round))}`;

/** Match minutes set by scoring (Bells cap), or null when scoring doesn't fix a duration. */
export function scoringMinutes(def: TournamentDefinition | null | undefined, st: Stage, round?: number): number | null {
  const sc = effectiveScoring(def, st, round);
  return isBells(sc) ? sc.timeCapMinutes ?? null : null;
}

export interface ScoringIssue { stageId: string; round?: number; message: string }
const isStep = (s: Stage) => s.kind === "pair_from_positions" || s.kind === "split";

/** Bells selected without minutes anywhere (tournament, stage or round) — blocks Create. */
export function scoringIssues(def: TournamentDefinition): ScoringIssue[] {
  const out: ScoringIssue[] = [];
  for (const d of def.divisions) for (const sec of d.sections) for (const st of sec.stages) {
    if (isStep(st)) continue;
    const where = `${def.divisions.length > 1 ? `${d.name} · ` : ""}${st.name}`;
    const sc = effectiveScoring(def, st);
    if (isBells(sc) && !sc.timeCapMinutes) out.push({ stageId: st.id, message: `${where}: Bells scoring needs the minutes per match.` });
    for (const k of Object.keys(st.roundScoring ?? {})) {
      const r = effectiveScoring(def, st, Number(k));
      if (isBells(r) && !r.timeCapMinutes) out.push({ stageId: st.id, round: Number(k), message: `${where} round ${Number(k) + 1}: Bells scoring needs the minutes per match.` });
    }
  }
  return out;
}
