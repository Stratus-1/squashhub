/**
 * Human label for a category's playing format ("Swiss", "Round robin", …).
 *
 * Both the tournament detail page (standings) and the tournaments list page
 * (fixtures) show this next to the category name so players know how their
 * category is played. Structured (Beta builder) tournaments decide the format
 * per stage from the saved spec; legacy tournaments fall back to their
 * round_format / per-league format config.
 */
import { divisionGroup, type SpecDivision, type TournamentSpec } from "./engine-service";

/** Fields a champ row must carry for legacy format detection. */
export type ChampFormatRow = {
  round_format?: string | null;
  scoring_mode?: string | null;
  league_formats?: Record<string, string> | null;
} | null | undefined;

/** Builder architecture row (tournaments.builder_architecture / builder_spec). */
export type ChampArchRow = {
  builder_architecture?: string | null;
  builder_spec?: TournamentSpec | null;
} | null | undefined;

const LEGACY_LABELS: Record<string, string> = {
  swiss: "Swiss",
  double_round_robin: "Double round robin",
  round_robin: "Round robin",
  single_round_robin: "Round robin",
  knockout: "Knockout",
};

/** The stage a category's standings come from: its division's first planned stage. */
function mainStageOf(arch: ChampArchRow, groupNumber: number) {
  if (arch?.builder_architecture !== "structured") return null;
  const spec = arch.builder_spec;
  const division = (spec?.divisions ?? []).find(
    (d: SpecDivision) => spec != null && divisionGroup(spec, d) === groupNumber,
  );
  if (!division) return null;
  return [...(division.stages ?? [])].sort((a, b) => a.order - b.order)[0] ?? null;
}

/**
 * Format label for one category, or null when nothing identifies it.
 * Returns the same wording everywhere it is shown.
 */
export function formatLabelForGroup(
  champ: ChampFormatRow,
  arch: ChampArchRow,
  groupNumber: number,
): string | null {
  const stage = mainStageOf(arch, groupNumber);
  if (stage) {
    if (stage.kind === "round_robin") return Number(stage.legs) >= 2 ? "Double round robin" : "Round robin";
    if (stage.kind === "swiss") return "Swiss";
    if (stage.kind === "knockout") return "Knockout";
    if (stage.kind === "pools") return "Pools";
    return "Round robin";
  }
  const perGroup = champ?.league_formats?.[String(groupNumber)];
  const fmt = perGroup
    || (champ?.scoring_mode === "swiss" || champ?.round_format === "swiss" ? "swiss" : null)
    || champ?.round_format
    || null;
  const label = fmt ? LEGACY_LABELS[fmt] : null;
  if (label) return label;
  if (champ?.scoring_mode === "time_capped_points") return "Timed points";
  return "Round robin";
}

/**
 * Short scoring label for a category, e.g. "PAR 11, best of 5" or "Bells".
 * Category value wins over the tournament-wide value; null when not saved.
 */
export function scoringLabelForGroup(champ: any, groupNumber: number): string | null {
  const at = (map: unknown) =>
    map && typeof map === "object" ? (map as Record<string, unknown>)[String(groupNumber)] : undefined;
  const mode = at(champ?.league_scoring_modes) ?? champ?.scoring_mode;
  if (mode === "time_capped_points") return "Bells, timed points";
  const p = Number(at(champ?.league_points_per_game) ?? champ?.points_per_game);
  const b = Number(at(champ?.league_best_of) ?? champ?.best_of);
  const parts: string[] = [];
  if (p === 7 || p === 11 || p === 15) parts.push(`PAR ${p}`);
  if (b === 3 || b === 5) parts.push(`best of ${b}`);
  return parts.length ? parts.join(", ") : null;
}
