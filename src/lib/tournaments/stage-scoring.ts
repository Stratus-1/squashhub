/**
 * Play-off (QF/SF/Final) scoring is never typed per stage: every stage of a category inherits that
 * category's saved structured scoring — the same per-division columns the marker and result entry read
 * (effectiveTournamentSettings). Unlike the marker, this resolver never falls back to guessed defaults:
 * a missing or invalid value blocks stage set-up so the admin fixes it in Tournament Setup.
 */
import { divisionGroup, type TournamentSpec } from "./engine-service";

export type InheritedScoring =
  | { ok: true; mode: "standard" | "time_capped_points" | "swiss" | "first_to_target"; pointsPerGame: number | null; bestOf: 1 | 3 | 5 | null; text: string; categoryName: string; groupNumber: number }
  | { ok: false; issue: string; categoryName: string; groupNumber: number };

const at = (map: unknown, g: number) => (map && typeof map === "object" ? (map as Record<string, unknown>)[String(g)] : undefined);
const mode = (v: unknown) => (v === "first_to_target" || v === "standard" || v === "time_capped_points" || v === "swiss" ? v : null);
const pts = (v: unknown) => (v == null || v === "" ? null : Number(v) === 11 ? 11 : Number(v) === 15 ? 15 : Number(v) === 7 ? 7 : undefined);
const bo = (v: unknown) => (v == null || v === "" ? null : Number(v) === 3 ? 3 : Number(v) === 5 ? 5 : undefined);

/** Resolve the saved scoring for one category (by group number). Category value wins over the tournament-wide value. */
export function inheritedScoringForGroup(t: any, groupNumber: number, categoryName: string): InheritedScoring {
  const fix = "edit this category in Tournament Setup";
  const base = { categoryName, groupNumber };
  const m = mode(at(t?.league_scoring_modes, groupNumber)) ?? mode(t?.scoring_mode);
  if (!m) return { ok: false, issue: `${categoryName} has no saved match scoring — ${fix}.`, ...base };
  if (m === "time_capped_points") return { ok: true, mode: m, pointsPerGame: null, bestOf: null, text: "Bells (time-capped points)", ...base };
  const rawP = at(t?.league_points_per_game, groupNumber) ?? t?.points_per_game;
  if (m === "first_to_target") {
    const target = Number(rawP);
    if (!Number.isInteger(target) || target < 1) return { ok: false, issue: `${categoryName} has no valid winning target — ${fix}.`, ...base };
    return { ok: true, mode: m, pointsPerGame: target, bestOf: 1, text: `First to ${target} · ${at(t?.league_win_conditions, groupNumber) === "win_by_2" ? "win by 2" : "sudden death"}`, ...base };
  }
  const rawB = at(t?.league_best_of, groupNumber) ?? t?.best_of;
  // Play-off game length override: when the category unticked "Keep same
  // format as pools", its QF/SF/Final play to this PAR instead of the pool PAR.
  const p = pts(at(t?.league_playoff_points_per_game, groupNumber)) ?? pts(rawP);
  const b = bo(rawB);
  if (p === undefined || b === undefined) return { ok: false, issue: `${categoryName} has an invalid saved scoring value — ${fix}.`, ...base };
  if (p === null || b === null) return { ok: false, issue: `${categoryName} is missing its ${p === null ? "PAR target" : "best-of game count"} — ${fix}.`, ...base };
  return { ok: true, mode: m, pointsPerGame: p, bestOf: b, text: `PAR ${p} · Best of ${b}`, ...base };
}

/** Scoring every play-off stage of this division inherits. */
export function inheritedStageScoring(t: any, spec: TournamentSpec, divisionKey: string): InheritedScoring {
  const d = spec.divisions.find((x) => x.divisionId === divisionKey);
  if (!d) return { ok: false, issue: "Unknown category.", categoryName: divisionKey, groupNumber: 0 };
  return inheritedScoringForGroup(t, divisionGroup(spec, d), (d as any).name ?? divisionKey);
}
