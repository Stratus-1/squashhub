/**
 * Standings method per stage — how results turn into a table. Separate from match scoring
 * (PAR/Bells), structure, rotation and pairing. Nothing is assumed: undecided = Needs confirmation.
 */
import type { Stage, TournamentDefinition } from "./definition";
import { effectiveScoring, isBells } from "./scoring";

export type StandingsMethod = "raw_total" | "result_points" | "rubbers_won" | "combined";
export type TieBreak = NonNullable<NonNullable<Stage["standings"]>["tieBreaks"]>[number];

export const STANDINGS_LABEL: Record<StandingsMethod, string> = {
  raw_total: "Raw score total — points actually scored count",
  result_points: "Result points — winner decided by the score, then standings points",
  rubbers_won: "Games / rubbers won",
  combined: "Combined — primary measure, then secondary measures",
};
export const SHORT: Record<string, string> = { raw_total: "raw score total", result_points: "result points", rubbers_won: "rubbers won", combined: "combined" };
export const TIEBREAK_LABEL: Record<TieBreak, string> = {
  head_to_head: "Head-to-head", points_difference: "Points difference", rubbers_difference: "Rubbers difference",
  points_scored: "Points scored", rubbers_won: "Rubbers won", games_difference: "Games difference", seed: "Original seed", playoff: "Play-off",
};

const TABLE_KINDS = new Set(["round_robin", "cross_pool_league", "swiss"]);
/** Stages that produce a standings table. */
export const hasStandings = (st: Stage) => TABLE_KINDS.has(st.kind);

export interface StandingsIssue { stageId: string; level: "error" | "warning"; message: string }

/**
 * Required when the stage is a pool-v-pool league, uses Bells, or the owner has started choosing
 * (standings object present). Older round robins without a choice keep the existing default (warning only).
 */
export function standingsIssues(def: TournamentDefinition | null | undefined, st: Stage, label = st.name): StandingsIssue[] {
  if (!hasStandings(st)) return [];
  const s = st.standings;
  const bells = isBells(effectiveScoring(def, st));
  const required = !!s || st.kind === "cross_pool_league" || bells;
  const out: StandingsIssue[] = [];
  const need = (m: string) => out.push({ stageId: st.id, level: required ? "error" : "warning", message: `${label}: ${m}` });
  if (!s?.method) { need(required ? "standings method needs confirmation (raw score total, result points, rubbers won or combined)." : "standings method not set — the existing default (match wins) is used."); }
  const usesResult = s?.method === "result_points" || (s?.method === "combined" && (s.combined?.primary === "result_points" || s.combined?.secondary?.includes("result_points")));
  if (usesResult && [s?.resultPoints?.win, s?.resultPoints?.draw, s?.resultPoints?.loss].some((v) => v == null)) need("result points need win, draw and loss values.");
  if (s?.method === "combined" && !s.combined?.primary) need("combined standings need a primary measure.");
  if (bells && !s?.bellsScore) need("Bells: does the score at the bell count directly, or only decide the rubber winner? Needs confirmation.");
  if (required && !s?.tieBreaks?.length) need("tie-break order needs confirmation.");
  return out;
}

export function standingsLines(def: TournamentDefinition | null | undefined, st: Stage): string[] {
  if (!hasStandings(st)) return [];
  const s = st.standings;
  const bells = isBells(effectiveScoring(def, st));
  const m = s?.method;
  const rp = s?.resultPoints;
  const lines = [`Standings: ${!m ? "Needs confirmation" : m === "combined" ? `combined — ${s?.combined?.primary ? SHORT[s.combined.primary] : "primary ?"}${s?.combined?.secondary?.length ? ` then ${s.combined.secondary.map((x) => SHORT[x]).join(", ")}` : ""}` : SHORT[m]}${m === "result_points" || s?.combined?.primary === "result_points" ? ` (win ${rp?.win ?? "?"} / draw ${rp?.draw ?? "?"} / loss ${rp?.loss ?? "?"})` : ""}`];
  if (bells) lines.push(`Score at the bell: ${s?.bellsScore === "counts_directly" ? "counts directly towards the total" : s?.bellsScore === "decides_winner" ? "only decides the rubber winner" : "Needs confirmation"}`);
  lines.push(`Tie-breaks: ${s?.tieBreaks?.length ? s.tieBreaks.map((t) => TIEBREAK_LABEL[t]).join(" → ") : "Needs confirmation"}`);
  return lines;
}
