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
  const fmt = perGroup || champ?.round_format || null;
  const label = fmt ? LEGACY_LABELS[fmt] : null;
  if (label) return label;
  if (champ?.scoring_mode === "time_capped_points") return "Timed points";
  return fmt ? null : "Round robin";
}
