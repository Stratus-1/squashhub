import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { rowStages, structureUnits, renameStructureKey, writeRowStages } from "./structure-rows";
import { newStageId, type StageKind } from "./stage-plan";

/** Full original-screen snapshot stays local; only supported answers are mirrored. */
export type OriginalStructure = Record<string, any>;
const originalFormat = (kind: StageKind | null) => kind === "round_robin" || kind === "pools" ? "single_round_robin" : kind ?? "single_round_robin";

export function originalStructureFromAnswers(a: StepAnswers): OriginalStructure {
  const keys = structureUnits(a).filter((key) => key.trim());
  const saved = a.originalStructure ?? {};
  const out: OriginalStructure = { ...saved, _unit_keys: keys, num_groups: keys.length };
  const maps = ["group_labels", "expected_players", "league_formats", "swiss_pools", "swiss_rounds", "league_genders", "league_match_types", "league_scoring_modes", "league_points_per_game", "league_best_of", "league_play_all_games", "league_win_conditions", "group_durations", "group_break_minutes", "league_doubles_serving_methods", "league_playoffs", "league_sources", "league_source_modes"];
  for (const map of maps) out[map] = { ...(saved[map] ?? {}) };
  keys.forEach((key, i) => {
    const id = String(i + 1), cat = key.split("::")[0];
    const s = rowStages(a, key)[0];
    const sc = a.scoringOverrides[key] ?? a.scoringOverrides[cat] ?? a.scoring;
    out.group_labels[id] = key.includes("::") ? key.split("::")[1] : key;
    out.expected_players[id] = Number(a.unitEntries[key]) || 0;
    out.league_formats[id] = saved.league_formats?.[id] === "double_round_robin" && (s.kind === "pools" || s.kind === "round_robin") ? "double_round_robin" : originalFormat(s.kind);
    out.swiss_pools[id] = s.pools ?? 1;
    out.swiss_rounds[id] = s.rounds ?? 5;
    if (s.kind === "monrad" && s.rounds != null) out.monrad_rounds = { ...(out.monrad_rounds ?? {}), [id]: s.rounds };
    out.league_genders[id] = a.categoryTypes?.[cat] ?? "open";
    out.league_match_types[id] = a.disc[key] ?? a.disc[cat] ?? "singles";
    out.league_scoring_modes[id] = sc?.mode ?? "standard";
    out.league_points_per_game[id] = sc?.pointsPerGame ?? 11;
    out.league_best_of[id] = sc?.bestOf ?? 5;
    out.league_play_all_games[id] = sc?.playAllGames ?? false;
    out.league_win_conditions[id] = sc?.winCondition ?? "win_by_2";
    if (sc?.mode === "time_capped_points") {
      out.group_durations[id] = Number(sc.timeCapPlay || sc.timeCapMinutes) || 0;
      out.group_break_minutes[id] = Number(sc.timeCapBreak) || 0;
    }
    out.league_doubles_serving_methods[id] = a.serving?.[key];
    out.league_seeding_plans = { ...(out.league_seeding_plans ?? {}), [id]: saved.league_seeding_plans?.[id] ?? a.seedingOverrides?.[key] ?? a.seedingOverrides?.[cat] ?? a.seeding ?? "later" };
    const po = a.playoffOverrides[key];
    if (po) out.league_playoffs[id] = po.choice === "playoffs";
    const elig = a.elig?.[key];
    if (elig?.mode === "leagues") { out.league_sources[id] = elig.leagueIds; out.league_source_modes[id] = "selected"; }
  });
  return out;
}

export function answersFromOriginalStructure(a: StepAnswers, raw: OriginalStructure): StepAnswers {
  let next = structuredClone(a);
  const sourceKeys: string[] = raw._unit_keys ?? [];
  const activeKeys: string[] = [];
  for (let i = 1; i <= Number(raw.num_groups); i++) {
    const id = String(i), source = sourceKeys[i - 1];
    const name = String(raw.group_labels?.[id] || source?.split("::").at(-1) || `Division ${i}`).trim();
    let key = source;
    if (source) {
      const dest = source.includes("::") ? `${source.split("::")[0]}::${name}` : name;
      next = renameStructureKey(next, source, name);
      key = structureUnits(next).includes(dest) ? dest : source;
    } else {
      key = name;
      let suffix = 2;
      while (next.categories.includes(key)) key = `${name} ${suffix++}`;
      next.categories = [...next.categories.filter((c) => c.trim()), key];
    }
    activeKeys.push(key);
    const cat = key.split("::")[0];
    next.categoryTypes = { ...next.categoryTypes, [cat]: raw.league_genders?.[id] ?? "open" };
    next.disc[key] = raw.league_match_types?.[id] ?? "singles";
    next.unitEntries[key] = String(raw.expected_players?.[id] || "");
    const fmt = raw.league_formats?.[id] ?? "single_round_robin";
    const kind: StageKind = fmt === "single_round_robin" || fmt === "double_round_robin" ? "round_robin" : fmt;
    const plan = rowStages(next, key);
    next = writeRowStages(next, key, [{ ...plan[0], id: plan[0]?.id ?? newStageId(), kind, pools: Number(raw.swiss_pools?.[id]) || 1, rounds: kind === "swiss" ? Number(raw.swiss_rounds?.[id]) || 5 : kind === "monrad" ? Number(raw.monrad_rounds?.[id]) || null : null }, ...plan.slice(1)]);
    next.scoringOverrides[key] = { mode: raw.league_scoring_modes?.[id] ?? "standard", pointsPerGame: raw.league_points_per_game?.[id] === 15 ? 15 : 11, bestOf: raw.league_best_of?.[id] === 3 ? 3 : 5, playAllGames: !!raw.league_play_all_games?.[id], winCondition: raw.league_win_conditions?.[id] ?? "win_by_2", timeCapPlay: String(raw.group_durations?.[id] ?? ""), timeCapBreak: String(raw.group_break_minutes?.[id] ?? ""), timeCapMinutes: "" };
    if (raw.league_doubles_serving_methods?.[id]) next.serving = { ...next.serving, [key]: raw.league_doubles_serving_methods[id] };
    const seed = raw.league_seeding_plans?.[id];
    if (["ranking", "ladder", "manual", "random", "none", "later"].includes(seed)) next.seedingOverrides = { ...(next.seedingOverrides ?? {}), [key]: seed };
    if (raw.league_playoffs?.[id] !== undefined) next.playoffOverrides[key] = { ...(next.playoffOverrides[key] ?? next.playoff ?? { rounds: 2, qualification: "later", pairing: "later" }), choice: raw.league_playoffs[id] ? "playoffs" : "none" };
  }
  // Deletions are draft-only; retain parent categories while any child remains.
  next.categories = next.categories.filter((cat) => activeKeys.includes(cat) || activeKeys.some((k) => k.startsWith(`${cat}::`)));
  next.subcats = Object.fromEntries(Object.entries(next.subcats).map(([cat, subs]) => [cat, subs.filter((sub) => activeKeys.includes(`${cat}::${sub}`))]));
  const ds = activeKeys.map((key) => next.disc[key]);
  next.playType = ds.every((d) => d === "doubles") ? "doubles" : ds.every((d) => d === "singles") ? "singles" : "both";
  next.scoring = next.scoring ?? next.scoringOverrides[activeKeys[0]] ?? null;
  next.originalStructure = { ...raw, _unit_keys: activeKeys };
  return next;
}