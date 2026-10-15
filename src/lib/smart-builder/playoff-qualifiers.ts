/**
 * Row-builder playoff planning (planning/display only — never generates fixtures).
 * Knockout playoffs: championship bracket, optional 3rd-place match.
 * Ranking playoffs: Monrad-style positional bands, every place inside a band decided by matches.
 * Qualifiers come from the preceding Swiss/RR standings: All entrants or Top N.
 */
import { monradPlan } from "./monrad";

export type PlayoffKind = "none" | "knockout" | "ranking";
export type NonQualifierPlan = "standings" | "band";
export interface RankingBand { from: number; to: number }
export interface RowPlayoffPlan { kind: PlayoffKind; scope: "all" | "top_n"; topN?: number | null; thirdPlace?: boolean; bands?: RankingBand[]; nonQualifiers?: NonQualifierPlan }

export const PLAYOFF_TIEBREAK = "matches won, game difference, games won, points difference, head-to-head";

export interface PlayoffBandEstimate { from: number; to: number; size: number; bracket: number; byes: number; rounds: number; matches: number }
export interface PlayoffEstimate { field: number; qualifiers: number; bands: PlayoffBandEstimate[]; matches: number; finishOnStandings: RankingBand | null; issues: string[]; preview: string }

const bracketOf = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

export function qualifierCount(p: RowPlayoffPlan, field: number): number {
  return p.scope === "top_n" ? Math.min(field, Math.max(0, Math.floor(p.topN ?? 0))) : field;
}

/** Ranking bands, defaulting to one band of all qualifiers; non-qualifier band appended when chosen. */
export function rankingBands(p: RowPlayoffPlan, field: number): RankingBand[] {
  const q = qualifierCount(p, field);
  const bands = p.bands?.length ? p.bands : [{ from: 1, to: q }];
  if (p.scope === "top_n" && p.nonQualifiers === "band" && q < field) return [...bands, { from: q + 1, to: field }];
  return bands;
}

/** Split 1..q into equal bands of `size` (last band may be smaller). */
export function splitBands(q: number, size: number): RankingBand[] {
  const out: RankingBand[] = [];
  for (let f = 1; f <= q; f += size) out.push({ from: f, to: Math.min(q, f + size - 1) });
  return out;
}

export function playoffEstimate(p: RowPlayoffPlan | undefined, field: number): PlayoffEstimate | null {
  if (!p || p.kind === "none") return null;
  const issues: string[] = [];
  const q = qualifierCount(p, field);
  if (field < 2) issues.push("Enter expected entries to size the playoffs.");
  if (p.scope === "top_n" && (!p.topN || p.topN < 2)) issues.push("Top N must be at least 2.");
  if (p.scope === "top_n" && p.topN && p.topN > field && field >= 2) issues.push(`Top ${p.topN} is more than the ${field} entrants expected.`);
  let bands: PlayoffBandEstimate[] = [];
  if (p.kind === "knockout") {
    if (q >= 2) {
      const bracket = bracketOf(q);
      const third = p.thirdPlace && q >= 4 ? 1 : 0;
      bands = [{ from: 1, to: q, size: q, bracket, byes: bracket - q, rounds: Math.log2(bracket), matches: q - 1 + third }];
    }
  } else {
    const list = rankingBands(p, field);
    let expect = 1;
    for (const b of list) {
      if (b.from !== expect) issues.push(`Bands must follow on: expected a band starting at ${expect}, got ${b.from}.`);
      if (b.to - b.from + 1 < 2) issues.push(`Band ${b.from}–${b.to} needs at least 2 entrants.`);
      expect = b.to + 1;
      const size = Math.max(0, Math.min(b.to, field) - b.from + 1);
      const m = monradPlan(size);
      bands.push({ from: b.from, to: b.to, size, bracket: m?.bracket ?? 0, byes: m?.byes ?? 0, rounds: m?.rounds ?? 0, matches: m?.matches ?? 0 });
    }
    const last = list[list.length - 1]?.to ?? 0;
    const covered = p.scope === "top_n" && p.nonQualifiers === "band" ? field : q;
    if (last !== covered && field >= 2) issues.push(`Bands cover places 1–${last}, but ${covered} entrants ${covered === q ? "qualify" : "take part"}.`);
  }
  const playing = bands.reduce((s, b) => s + b.size, 0);
  const finishOnStandings = playing < field && field >= 2 ? { from: playing + 1, to: field } : null;
  const base = p.scope === "all" ? `All ${field} entrants` : `Top ${q} of ${field}`;
  const what = p.kind === "knockout" ? `knockout bracket of ${bands[0]?.bracket ?? "?"}${bands[0]?.byes ? ` (${bands[0].byes} byes to the top seeds)` : ""}${p.thirdPlace && q >= 4 ? " + 3rd-place match" : ""}; only the champion${p.thirdPlace ? ", runner-up and 3rd" : " and runner-up"} are decided by matches`
    : `ranking playoffs, places ${bands.map((b) => `${b.from}–${b.to}`).join(", ")} decided by placement matches`;
  const rest = finishOnStandings ? ` Places ${finishOnStandings.from}–${finishOnStandings.to} finish on the preceding stage standings (not ranked by playoff matches).` : "";
  return { field, qualifiers: q, bands, matches: bands.reduce((s, b) => s + b.matches, 0), finishOnStandings, issues, preview: `${base} by preceding standings (tie-break: ${PLAYOFF_TIEBREAK}) → ${what}.${rest}` };
}

/** Legacy mirror so older readers keep a sensible playoff summary. */
export function legacyPlayoffMirror(p: RowPlayoffPlan, field: number) {
  const q = qualifierCount(p, field);
  const rounds = Math.min(3, Math.max(1, Math.ceil(Math.log2(Math.max(2, q))))) as 1 | 2 | 3;
  return { choice: p.kind === "none" ? "none" as const : "playoffs" as const, rounds, qualification: p.scope === "top_n" ? "seeded" as const : "later" as const, pairing: "seeded" as const, style: p.kind === "ranking" ? "placement" as const : "championship" as const };
}
