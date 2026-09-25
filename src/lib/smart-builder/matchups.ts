/**
 * Builder side of the explicit matchup layer: proposes a mapping from the stage's stated intent
 * (pool rotation + in-tie pairing + qualification source) and returns the admin's edited mapping
 * when one is saved. The engine consumes exactly this object.
 */
import { deriveMapping, mappingIssues, mappingSummary, type MappingSource, type StageMapping } from "../tournaments/mapping";
import type { Division, Stage, TournamentDefinition } from "./definition";
import { opponentPositions } from "./ties";

const stagesOf = (d: Division) => d.sections.flatMap((s) => s.stages);

/** Default qualification source: an earlier individual pools stage's finishing positions, else entry-seeded pools. */
export function defaultSource(d: Division, st: Stage): { source: MappingSource; sourceStageId: string | null } {
  const all = stagesOf(d), i = all.findIndex((x) => x.id === st.id);
  const prev = i > 0 ? all[i - 1] : null;
  if (prev && prev.kind === "round_robin") return { source: "stage_standings", sourceStageId: prev.id };
  return { source: "seed_pools", sourceStageId: null };
}

/** The mapping the engine will run for a pool-v-pool stage (saved edit, else proposal). null = not enough info. */
export function effectiveMapping(d: Division, st: Stage): StageMapping | null {
  if (st.kind !== "cross_pool_league") return null;
  if (st.mapping && !st.mapping.derived) return st.mapping as StageMapping;
  const src = st.mapping ? { source: st.mapping.source, sourceStageId: st.mapping.sourceStageId ?? null } : defaultSource(d, st);
  const t = st.tieFormat;
  if (!st.groupSize || (st.groups ?? 0) < 2 || !t?.pairing || !t.rubbers.length) return null;
  const games = t.rubbers.map((r) => ({ positions: r.positions, opponent: opponentPositions(r, t.pairing) ?? [] }));
  if (games.some((g) => g.opponent.length !== g.positions.length)) return null;
  return deriveMapping({ pools: st.groups, poolSize: st.groupSize, legs: st.legs === 2 ? 2 : 1, discipline: st.discipline === "doubles" ? "doubles" : "singles", games, ...src });
}

export function stageMappingIssues(d: Division, st: Stage): string[] {
  if (st.kind !== "cross_pool_league") return [];
  const label = `${d.name} · ${st.name}`;
  const m = effectiveMapping(d, st);
  if (!m) return [`${label}: who plays whom can't be worked out yet — set pools, pool size, in-tie pairing and games, or enter the matchups.`];
  const out = mappingIssues(m, label);
  const all = stagesOf(d), i = all.findIndex((x) => x.id === st.id);
  if (m.source === "stage_standings") {
    const src = all.find((x) => x.id === m.sourceStageId);
    const si = src ? all.indexOf(src) : -1;
    if (!src || si >= i) out.push(`${label}: its finishing positions must come from an earlier stage.`);
    else if (src.kind !== "round_robin" && !(src.kind === "cross_pool_league" && effectiveMapping(d, src)?.source === "seed_pools"))
      out.push(`${label}: finishing positions can only come from a pools / round robin stage or entry-seeded pool-v-pool stage (${src.name} is not).`);
    else if ((src.groups ?? 1) !== m.pools) out.push(`${label}: ${src.name} has ${src.groups ?? 1} pools but the matchups use ${m.pools}.`);
    else if (src.groupSize && src.groupSize < m.poolSize) out.push(`${label}: ${src.name} pools have ${src.groupSize} places, the matchups use ${m.poolSize}.`);
  } else {
    const first = all.find((x) => x.kind === "cross_pool_league" && effectiveMapping(d, x)?.source === "seed_pools");
    const openers = all.slice(0, i).filter((x) => x.kind !== "pair_from_positions" && x.kind !== "split");
    if (openers.length && (!first || first.id === st.id)) out.push(`${label}: entry-seeded pools can only be used by the opening stage (or a stage sharing its pools).`);
    if (first && first.id !== st.id && (first.groups !== st.groups || first.groupSize !== st.groupSize)) out.push(`${label}: uses different pools from ${first.name}.`);
  }
  return out;
}

/** Review lines: source, pair formation, every matchup per round, the following stage. */
export function stageMappingLines(def: TournamentDefinition | null | undefined, st: Stage): string[] {
  const d = def?.divisions.find((x) => stagesOf(x).some((y) => y.id === st.id));
  if (!d) return [];
  const m = effectiveMapping(d, st);
  if (!m) return ["Matchups: not worked out yet"];
  const all = stagesOf(d), i = all.findIndex((x) => x.id === st.id);
  const next = all.slice(i + 1).find((x) => x.kind !== "pair_from_positions" && x.kind !== "split");
  const nextText = next ? `${next.name} — ${next.kind === "cross_pool_league" ? "pool-v-pool (explicit matchups)" : next.kind.replace(/_/g, " ")}` : null;
  return [
    `Matchups: ${m.derived ? "proposed from pool rotation + pairing (editable)" : "set by the organiser"}`,
    ...mappingSummary(m, { poolNames: d.poolNames ?? undefined, sourceName: all.find((x) => x.id === m.sourceStageId)?.name, roundDates: st.schedule?.roundDates ?? undefined, nextStage: nextText }),
  ];
}
