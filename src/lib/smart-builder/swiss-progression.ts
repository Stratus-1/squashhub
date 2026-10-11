/**
 * Swiss planning helpers for the Step-by-Step builder (pure, planning-only).
 * - Estimated Swiss rounds (`swissRounds`) is a planning guess; the Confirmed count (`swissRoundsConfirmed`)
 *   is what decides when Swiss ends and the next configured stage starts. Confirmed wins when set.
 * - The progression preview lists ONLY stages that are actually configured (never adds QF/SF/Final).
 * Changing the setup never rewrites a live draw; shortening a live Swiss stage stays in Manage Tournament.
 */
import { expectedGamesForStageName, seededOrder } from "@/lib/tournaments/seeded-bracket";

export type SwissFormatLike = { kind?: string | null; swissRounds?: string | number | null; swissRoundsConfirmed?: string | number | null };
export type PlanStageLike = { name: string; phase?: string; unit?: string };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null; };

export function confirmedSwissRounds(f: SwissFormatLike | null | undefined): number | null { return num(f?.swissRoundsConfirmed); }
/** Confirmed count when set, otherwise the estimate (legacy behaviour). */
export function effectiveSwissRounds(f: SwissFormatLike | null | undefined): number | null { return confirmedSwissRounds(f) ?? num(f?.swissRounds); }

/** Checks a proposed confirmed count against entries and rounds already generated/completed in a live draw. */
export function swissConfirmIssues(proposed: unknown, opts: { entrants?: number | null; generatedRounds?: number; completedRounds?: number } = {}): string[] {
  const n = num(proposed);
  if (n == null) return ["Enter a whole number of Swiss rounds (1 or more)."];
  const out: string[] = [];
  if (opts.entrants && opts.entrants > 1 && n > opts.entrants - 1) out.push(`${opts.entrants} entries allow at most ${opts.entrants - 1} Swiss rounds without repeat opponents.`);
  if (opts.generatedRounds && n < opts.generatedRounds) out.push(`Round ${opts.generatedRounds} already exists in the draw; the confirmed count cannot be lower. No results are deleted.`);
  if (opts.completedRounds && n < opts.completedRounds) out.push(`${opts.completedRounds} rounds are already completed.`);
  return [...new Set(out)];
}

export interface SwissProgression { steps: string[]; qualifiers: number | null; bracket: string[] | null; issues: string[] }

/** Read-only chain from saved config: "5 Swiss rounds → Top 8 → Quarterfinal → Semifinal → Final". */
export function swissProgression(f: SwissFormatLike, stages: PlanStageLike[] = [], unit = ""): SwissProgression {
  const rounds = effectiveSwissRounds(f);
  const confirmed = confirmedSwissRounds(f) != null;
  const playoff = stages.filter((s) => s.phase === "playoff" && (!s.unit || !unit || s.unit === unit || unit.startsWith(s.unit + "::")));
  const issues: string[] = [];
  const names = playoff.map((s) => s.name.trim());
  const seen = new Set<string>();
  for (const n of names) { const k = n.toLowerCase().replace(/[\s-]/g, ""); if (seen.has(k)) issues.push(`"${n}" is configured more than once.`); seen.add(k); }
  const games = playoff.map((s) => expectedGamesForStageName(s.name));
  for (let i = 1; i < games.length; i++) {
    const prev = games[i - 1], cur = games[i];
    if (prev != null && cur != null && cur * 2 !== prev) issues.push(`${names[i]} does not follow ${names[i - 1]} (winners of ${prev} game${prev > 1 ? "s" : ""} make ${prev / 2 || 0} game${prev === 2 ? "" : "s"}).`);
  }
  const qualifiers = games[0] != null ? games[0]! * 2 : null;
  if (playoff.length && qualifiers == null) issues.push(`How many qualify for "${names[0]}" isn't clear from its name — set it when the stage is set up.`);
  const steps = [rounds ? `${rounds} Swiss round${rounds > 1 ? "s" : ""}${confirmed ? "" : " (estimate)"}` : "Swiss rounds (count not set)"];
  if (qualifiers) steps.push(`Top ${qualifiers}`);
  steps.push(...names);
  let bracket: string[] | null = null;
  if (qualifiers && qualifiers >= 2 && (qualifiers & (qualifiers - 1)) === 0) {
    const o = seededOrder(qualifiers);
    bracket = [];
    for (let i = 0; i < o.length; i += 2) bracket.push(`${names[0]} ${i / 2 + 1}: ${o[i]} v ${o[i + 1]}`);
  }
  return { steps, qualifiers, bracket, issues };
}
