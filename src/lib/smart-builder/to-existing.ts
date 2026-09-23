/**
 * Map a validated Smart Builder definition onto the EXISTING tournament model
 * (club_champs view + tournaments extras). Nothing new is invented here: each
 * division × section becomes one existing competition division ("group").
 *
 * Structures the existing engine cannot represent yet are reported as
 * `unsupported` instead of being saved in a lossy way.
 */
import type { Division, Section, Stage, TournamentDefinition } from "./definition";

export interface ExistingMapping {
  champ: Record<string, any>;
  extras: Record<string, any>;
  unsupported: string[];
}

const GENDER: Record<Division["eligibility"], string> = {
  men: "men",
  ladies: "ladies",
  mixed: "mixed",
  open: "open",
  open_any_pair: "open",
};

export function mapToExistingTournament(def: TournamentDefinition): ExistingMapping {
  const unsupported: string[] = [];
  const leagueFormats: Record<string, string> = {};
  const swissPools: Record<string, number> = {};
  const expected: Record<string, number> = {};
  const genders: Record<string, string> = {};
  const matchTypes: Record<string, string> = {};
  const labels: Record<string, string> = {};
  const playoffModes: Record<string, string> = {};
  const playoffQualifiers: Record<string, number> = {};
  let swissRounds: number | null = null;
  let g = 0;

  const add = (division: Division, section: Section) => {
    g += 1;
    const key = String(g);
    const label = division.sections.length > 1 ? `${division.name} ${section.name}` : division.name;
    labels[key] = label;
    genders[key] = GENDER[division.eligibility];
    const stages = section.stages;
    const [first, second, ...rest] = stages as (Stage | undefined)[];
    if (!first) { unsupported.push(`${label} has no stages.`); return; }
    matchTypes[key] = first.discipline;
    if (rest.length > 0 || stages.some((s) => ["pair_from_positions", "split", "placement", "custom"].includes(s.kind))) {
      unsupported.push(`${label}: ${stages.map((s) => s.name).join(" → ")} needs the new multi-stage engine (derived pairs, splits, placements or 3+ stages), which is preview-only in this beta.`);
      return;
    }
    if (first.kind === "knockout") {
      leagueFormats[key] = "knockout";
      swissPools[key] = first.groups;
      if (first.groupSize) expected[key] = first.groups * first.groupSize;
      if (second) unsupported.push(`${label}: a stage after a knockout isn't supported by the existing engine.`);
      return;
    }
    if (first.kind === "round_robin" || first.kind === "swiss") {
      leagueFormats[key] = first.kind === "swiss" ? "swiss" : "single_round_robin";
      swissPools[key] = first.groups;
      if (first.groupSize) expected[key] = first.groups * first.groupSize;
      if (first.kind === "swiss") swissRounds = first.swissRounds ?? swissRounds;
      if (second) {
        if (second.kind !== "knockout") { unsupported.push(`${label}: only a knockout can follow pools in the existing engine.`); return; }
        if (second.discipline !== first.discipline) { unsupported.push(`${label}: singles → doubles transitions are preview-only.`); return; }
        playoffModes[key] = "knockout";
        playoffQualifiers[key] = first.advance.perGroup ?? first.advance.positions?.length ?? 1;
      }
      return;
    }
    unsupported.push(`${label}: ${first.kind} isn't supported by the existing engine yet.`);
  };

  def.divisions.forEach((d) => d.sections.forEach((s) => add(d, s)));

  const genderValues = Array.from(new Set(Object.values(genders)));
  const matchValues = Array.from(new Set(Object.values(matchTypes)));
  const firstFormat = Object.values(leagueFormats)[0] ?? "knockout";

  return {
    unsupported,
    champ: {
      name: def.name,
      gender: genderValues.length === 1 ? genderValues[0] : "open",
      match_type: matchValues.length === 1 ? matchValues[0] : "singles",
      num_groups: Math.max(1, g),
      round_format: firstFormat === "knockout" ? undefined : firstFormat,
      league_formats: leagueFormats,
      swiss_pools: swissPools,
      swiss_rounds: swissRounds,
      expected_players: Object.keys(expected).length ? expected : null,
      group_labels: labels,
    },
    extras: {
      league_genders: genders,
      league_match_types: matchTypes,
      league_playoff_modes: Object.keys(playoffModes).length ? playoffModes : null,
      league_playoff_qualifiers: Object.keys(playoffQualifiers).length ? playoffQualifiers : null,
    },
  };
}
