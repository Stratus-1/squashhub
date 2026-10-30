import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { rowStages, structureUnits, renameStructureKey, writeRowStages } from "./structure-rows";
import { newStageId, type StageKind } from "./stage-plan";
import { poolNamesFor } from "./category-pools";
import { poolMinutes } from "@/lib/tournaments/stage-sequence";

/** Full original-screen snapshot stays local; only supported answers are mirrored. */
export type OriginalStructure = Record<string, any>;
const originalFormat = (kind: StageKind | null) => kind === "round_robin" || kind === "pools" ? "single_round_robin" : kind ?? "single_round_robin";

/** Read saved setup times without rewriting legacy estimates or scheduled games. */
export function structureSlotTimes(a: StepAnswers, key: string) {
  const raw = a.originalStructure;
  const keys: string[] = raw?._unit_keys ?? structureUnits(a);
  const groupNumber = keys.indexOf(key) + 1;
  const sc = a.scoringOverrides[key] ?? a.scoringOverrides[key.split("::")[0]] ?? a.scoring;
  const bells = sc?.mode === "time_capped_points";
  const kind = (a.disc[key] ?? a.disc[key.split("::")[0]] ?? a.playType) === "doubles" ? "doubles" : "singles";
  const breakMinutes = bells ? Math.max(0, Number(raw?.group_break_minutes?.[String(groupNumber)] ?? sc?.timeCapBreak) || 0) : 0;
  const fallback = bells ? Number(sc?.timeCapPlay || sc?.timeCapMinutes) : Number(a.scheduling?.[kind] || raw?.match_duration);
  const base = poolMinutes({ groupDurations: raw?.group_durations, groupNumber, fallbackMinutes: fallback }) ?? 0;
  const pools = Number(raw?.swiss_pools?.[String(groupNumber)] ?? rowStages(a, key)[0]?.pools) || 1;
  const poolSlots = Array.from({ length: pools }, (_, i) => {
    const play = poolMinutes({ poolDurations: raw?.pool_durations, groupDurations: raw?.group_durations, groupNumber, pool: i + 1, fallbackMinutes: fallback }) ?? 0;
    return play > 0 ? play + breakMinutes : 0;
  });
  const inherited = Number(raw?.group_durations?.[String(groupNumber)]) > 0 || poolSlots.some((_, i) => Number(raw?.pool_durations?.[`${groupNumber}:${i + 1}`]) > 0) || (bells && Number(sc?.timeCapPlay || sc?.timeCapMinutes) > 0);
  return { slotMinutes: poolSlots.every((n) => n > 0) ? Math.max(...poolSlots) : 0, poolSlots, inherited };
}

export interface StructurePoolGroup { parent: string; label: string; slots: number[] }
/** Display numbered round-robin children as pools without merging positional draw IDs. */
export function structurePoolGroups(a: StepAnswers): StructurePoolGroup[] {
  const keys = structureUnits(a);
  return Object.entries(a.subcats).flatMap(([parent, children]) => {
    if (children.length < 2 || children.some((child) => !/^\d+$/.test(child))) return [];
    const slots = children.map((child) => keys.indexOf(`${parent}::${child}`) + 1);
    if (slots.some((slot) => slot < 1) || slots.some((slot, i) => i > 0 && slot !== slots[0] + i)) return [];
    if (children.some((child) => !["round_robin", "pools"].includes(rowStages(a, `${parent}::${child}`)[0]?.kind ?? ""))) return [];
    return [{ parent, label: parent.replace(/^Mens\b/, "Men's"), slots }];
  });
}

export function originalStructureFromAnswers(a: StepAnswers): OriginalStructure {
  const keys = structureUnits(a).filter((key) => key.trim());
  const saved = a.originalStructure ?? {};
  const out: OriginalStructure = { ...saved, _unit_keys: keys, _pool_groups: structurePoolGroups(a), _identity_locked: !!a.createdTournamentId, num_groups: keys.length };
  const maps = ["group_labels", "expected_players", "league_formats", "swiss_pools", "swiss_rounds", "swiss_rr_finish", "league_genders", "league_match_types", "league_scoring_modes", "league_points_per_game", "league_best_of", "league_play_all_games", "league_win_conditions", "group_durations", "group_break_minutes", "league_doubles_serving_methods", "league_playoffs", "league_playoff_points_per_game", "league_sources", "league_source_modes", "league_pool_names"];
  for (const map of maps) out[map] = { ...(saved[map] ?? {}) };
  keys.forEach((key, i) => {
    const id = String(i + 1), cat = key.split("::")[0];
    const s = rowStages(a, key)[0];
    const sc = a.scoringOverrides[key] ?? a.scoringOverrides[cat] ?? a.scoring;
    out.group_labels[id] = a.categoryLabels?.[key] ?? (key.includes("::") ? key.split("::")[1] : key);
    out.expected_players[id] = Number(a.unitEntries[key]) || 0;
    out.league_formats[id] = saved.league_formats?.[id] === "double_round_robin" && (s.kind === "pools" || s.kind === "round_robin") ? "double_round_robin" : originalFormat(s.kind);
    out.swiss_pools[id] = s.pools ?? 1;
    if ((s.pools ?? 1) > 1) out.league_pool_names[id] = poolNamesFor({ pools: s.pools, poolNames: s.poolNames ?? saved.league_pool_names?.[id] });
    out.swiss_rounds[id] = s.endAfterRound ?? s.rounds ?? 5;
    out.swiss_rr_finish[id] = s.rrFinish ?? null;
    if (s.kind === "monrad" && s.rounds != null) out.monrad_rounds = { ...(out.monrad_rounds ?? {}), [id]: s.rounds };
    out.league_genders[id] = ((a.categoryTypes?.[cat] as string) === "mens" ? "men" : a.categoryTypes?.[cat] ?? "open") as any;
    out.league_match_types[id] = a.disc[key] ?? a.disc[cat] ?? "singles";
    out.league_scoring_modes[id] = sc?.mode ?? "standard";
    out.league_points_per_game[id] = sc?.pointsPerGame ?? 11;
    out.league_best_of[id] = sc?.bestOf ?? 5;
    out.league_play_all_games[id] = sc?.playAllGames ?? false;
    out.league_win_conditions[id] = sc?.winCondition ?? "win_by_2";
    if (sc?.playoffPointsPerGame === 7 || sc?.playoffPointsPerGame === 11 || sc?.playoffPointsPerGame === 15) out.league_playoff_points_per_game[id] = sc.playoffPointsPerGame;
    else delete out.league_playoff_points_per_game[id];
    if (sc?.mode === "time_capped_points") {
      out.group_durations[id] = Number(sc.timeCapPlay || sc.timeCapMinutes) || 0;
      out.group_break_minutes[id] = Number(sc.timeCapBreak) || 0;
    }
    out.league_doubles_serving_methods[id] = a.serving?.[key];
    out.league_seeding_plans = { ...(out.league_seeding_plans ?? {}), [id]: saved.league_seeding_plans?.[id] ?? a.seedingOverrides?.[key] ?? a.seedingOverrides?.[cat] ?? a.seeding ?? "later" };
    const po = a.playoffOverrides[key];
    if (po) out.league_playoffs[id] = po.choice === "playoffs";
    const elig = a.elig?.[key] ?? a.elig?.[cat];
    if (elig?.mode === "leagues") {
      out.league_sources[id] = elig.leagueIds;
      // Combining source leagues and permitting manual allocation are independent choices.
      out.league_source_modes[id] = saved.league_source_modes?.[id] === "combined" ? "combined" : "selected";
    }
  });
  return out;
}

/** Settings shared by every pool of one category; legacy numbered pool slots inherit them from the first pool. */
const SHARED_POOL_MAPS = ["league_formats", "swiss_rounds", "swiss_rr_finish", "monrad_rounds", "league_genders", "league_match_types", "league_scoring_modes", "league_points_per_game", "league_best_of", "league_play_all_games", "league_win_conditions", "group_durations", "group_break_minutes", "league_doubles_serving_methods", "league_seeding_plans", "league_playoffs", "league_playoff_points_per_game", "league_bye_handling", "league_forfeit_rules", "league_forfeit_points"];
export function mirrorPoolGroupSettings(raw: OriginalStructure): OriginalStructure {
  const groups: StructurePoolGroup[] = raw._pool_groups ?? [];
  if (!groups.length) return raw;
  const out: OriginalStructure = { ...raw };
  for (const map of SHARED_POOL_MAPS) {
    if (!raw[map]) continue;
    const m = { ...raw[map] };
    for (const g of groups) { const src = String(g.slots[0]); if (!(src in m)) continue; g.slots.slice(1).forEach((slot) => { m[String(slot)] = m[src]; }); }
    out[map] = m;
  }
  return out;
}

export function answersFromOriginalStructure(a: StepAnswers, input: OriginalStructure): StepAnswers {
  const raw = mirrorPoolGroupSettings(input);
  if (a.createdTournamentId) {
    const previous = originalStructureFromAnswers(a);
    const settings = (value: OriginalStructure) => {
      const copy = structuredClone(value);
      delete copy.group_labels;
      delete copy.category_locks;
      const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, stable(v[key])])) : v;
      return JSON.stringify(stable(copy));
    };
    if (settings(previous) === settings(raw)) {
      const next = structuredClone(a);
      const labels = { ...(a.categoryLabels ?? {}) };
      (previous._unit_keys as string[]).forEach((key, i) => {
        const defaultName = key.includes("::") ? key.split("::")[1] : key;
        const name = String(raw.group_labels?.[String(i + 1)] ?? "").trim();
        if (!name || name.includes("::")) return;
        if (name === defaultName) delete labels[key];
        else labels[key] = name;
      });
      next.categoryLabels = labels;
      next.originalStructure = { ...raw, _unit_keys: previous._unit_keys };
      return next;
    }
  }
  let next = structuredClone(a);
  const sourceKeys: string[] = raw._unit_keys ?? [];
  const activeKeys: string[] = [];
  for (let i = 1; i <= Number(raw.num_groups); i++) {
    const id = String(i), source = sourceKeys[i - 1];
    const name = String(raw.group_labels?.[id] || source?.split("::").at(-1) || `Division ${i}`).trim();
    let key = source;
    if (source && a.createdTournamentId) {
      // Saved unit keys index entries, stages and scheduling: never rename those identities.
      const defaultName = source.includes("::") ? source.split("::")[1] : source;
      const names = { ...(next.categoryLabels ?? {}) };
      if (name !== defaultName) names[source] = name;
      else delete names[source];
      next.categoryLabels = names;
    } else if (source) {
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
    next.categoryTypes = { ...next.categoryTypes, [cat]: (raw.league_genders?.[id] === "men" ? "mens" : raw.league_genders?.[id] ?? "open") as any };
    next.disc[key] = raw.league_match_types?.[id] ?? "singles";
    next.unitEntries[key] = String(raw.expected_players?.[id] || "");
    const fmt = raw.league_formats?.[id] ?? "single_round_robin";
    const kind: StageKind = fmt === "single_round_robin" || fmt === "double_round_robin" ? "round_robin" : fmt;
    const plan = rowStages(next, key);
    const pools = Number(raw.swiss_pools?.[id]) || 1;
    const savedNames: string[] | undefined = raw.league_pool_names?.[id] ?? plan[0]?.poolNames;
    const poolNames = pools > 1 ? poolNamesFor({ pools, poolNames: savedNames }) : undefined;
    next = writeRowStages(next, key, [{ ...plan[0], id: plan[0]?.id ?? newStageId(), kind, pools, poolNames, rounds: kind === "swiss" ? Number(raw.swiss_rounds?.[id]) || 5 : kind === "monrad" ? Number(raw.monrad_rounds?.[id]) || null : null, endAfterRound: kind === "swiss" ? Number(raw.swiss_rounds?.[id]) || 5 : null, rrFinish: kind === "swiss" ? raw.swiss_rr_finish?.[id] ?? null : null }, ...plan.slice(1)]);
    const targetMode = raw.league_scoring_modes?.[id] === "first_to_target";
    next.scoringOverrides[key] = { mode: raw.league_scoring_modes?.[id] ?? "standard", pointsPerGame: targetMode ? Math.max(1, Math.floor(Number(raw.league_points_per_game?.[id]) || 7)) : raw.league_points_per_game?.[id] === 15 ? 15 : raw.league_points_per_game?.[id] === 7 ? 7 : 11, bestOf: targetMode ? 1 : raw.league_best_of?.[id] === 3 ? 3 : 5, playAllGames: targetMode ? false : !!raw.league_play_all_games?.[id], winCondition: raw.league_win_conditions?.[id] ?? (targetMode ? "sudden_death" : "win_by_2"), timeCapPlay: String(raw.group_durations?.[id] ?? ""), timeCapBreak: String(raw.group_break_minutes?.[id] ?? ""), timeCapMinutes: "" };
    next.serving = { ...next.serving };
    if (raw.league_doubles_serving_methods?.[id]) next.serving[key] = raw.league_doubles_serving_methods[id];
    else delete next.serving[key];
    const seed = raw.league_seeding_plans?.[id];
    if (["ranking", "ladder", "manual", "random", "none", "later"].includes(seed)) next.seedingOverrides = { ...(next.seedingOverrides ?? {}), [key]: seed };
    if (raw.league_playoffs?.[id] !== undefined) next.playoffOverrides[key] = { ...(next.playoffOverrides[key] ?? next.playoff ?? { rounds: 2, qualification: "later", pairing: "later" }), choice: raw.league_playoffs[id] ? "playoffs" : "none" };
  }
  // Deletions are draft-only; retain parent categories while any child remains.
  next.categories = next.categories.filter((cat) => activeKeys.includes(cat) || activeKeys.some((k) => k.startsWith(`${cat}::`)));
  next.subcats = Object.fromEntries(Object.entries(next.subcats).map(([cat, subs]) => [cat, subs.filter((sub) => activeKeys.includes(`${cat}::${sub}`))] as [string, string[]]).filter(([, subs]) => subs.length > 0));
  const ds = activeKeys.map((key) => next.disc[key]);
  next.playType = ds.every((d) => d === "doubles") ? "doubles" : ds.every((d) => d === "singles") ? "singles" : "both";
  next.scoring = next.scoring ?? next.scoringOverrides[activeKeys[0]] ?? null;
  next.originalStructure = { ...raw, _unit_keys: activeKeys };
  return next;
}