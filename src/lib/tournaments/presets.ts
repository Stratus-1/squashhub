/**
 * Ready-made tournament structures.
 *
 * A preset is nothing more than a described plan of division settings the
 * setup screen applies in one go — the organiser can change every value
 * afterwards. Kept pure so the shape of a preset can be tested without the UI.
 */

import type { PairingMethod } from "./stage-sequence";

export type PresetDivision = {
  /** group_number (1-based). */
  gn: number;
  label: string;
  matchType: "singles" | "doubles";
  format: "single_round_robin";
  scoringMode: "standard" | "time_capped_points";
  /** Minutes per game for this division. */
  minutes: number;
  pools: number;
  /** Division this one is played after, when it is a later stage. */
  follows?: number;
  /** How this division builds its pairs from the stage it follows. */
  pairing?: PairingMethod;
};

export type TournamentPreset = {
  id: string;
  name: string;
  /** One-line description shown on the button. */
  description: string;
  divisions: PresetDivision[];
};

/**
 * Durbanville's "Diamond League": teams of six play a timed singles
 * round-robin first, then the same players pair up as neighbours in the
 * finishing order (6+5, 4+3, 2+1) for a longer timed doubles round-robin.
 */
export const DIAMOND_LEAGUE_PRESET: TournamentPreset = {
  id: "diamond_league",
  name: "Diamond League",
  description:
    "Timed singles round robin first, then a doubles round robin where neighbours in the finishing order pair up (6+5, 4+3, 2+1).",
  divisions: [
    {
      gn: 1,
      label: "Singles",
      matchType: "singles",
      format: "single_round_robin",
      scoringMode: "time_capped_points",
      minutes: 20,
      pools: 1,
    },
    {
      gn: 2,
      label: "Doubles",
      matchType: "doubles",
      format: "single_round_robin",
      scoringMode: "time_capped_points",
      minutes: 30,
      pools: 1,
      follows: 1,
      pairing: "adjacent",
    },
  ],
};

export const TOURNAMENT_PRESETS: TournamentPreset[] = [DIAMOND_LEAGUE_PRESET];

export type PresetMaps = {
  numGroups: number;
  labels: Record<string, string>;
  formats: Record<string, PresetDivision["format"]>;
  matchTypes: Record<string, "singles" | "doubles">;
  scoringModes: Record<string, "standard" | "time_capped_points">;
  durations: Record<string, number>;
  pools: Record<string, number>;
  follows: Record<string, number>;
  pairing: Record<string, PairingMethod>;
  /** Default game length for the event — the first stage's time. */
  matchDuration: number;
};

/** Flatten a preset into the keyed maps the setup screen stores. */
export function presetToMaps(preset: TournamentPreset): PresetMaps {
  const maps: PresetMaps = {
    numGroups: preset.divisions.length,
    labels: {},
    formats: {},
    matchTypes: {},
    scoringModes: {},
    durations: {},
    pools: {},
    follows: {},
    pairing: {},
    matchDuration: preset.divisions[0]?.minutes || 20,
  };
  preset.divisions.forEach((d) => {
    const key = String(d.gn);
    maps.labels[key] = d.label;
    maps.formats[key] = d.format;
    maps.matchTypes[key] = d.matchType;
    maps.scoringModes[key] = d.scoringMode;
    maps.durations[key] = d.minutes;
    maps.pools[key] = d.pools;
    if (d.follows) maps.follows[key] = d.follows;
    if (d.pairing) maps.pairing[key] = d.pairing;
  });
  return maps;
}
