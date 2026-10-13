import { describe, it, expect } from "vitest";
import { formatLabelForGroup } from "./format-label";

/** Minimal structured spec: one division per group, one main stage. */
const spec = (divisions: Array<{ groupNumber: number; stage: any }>) =>
  ({
    version: 1,
    architecture: "structured",
    name: "T",
    divisions: divisions.map((d) => ({
      label: `G${d.groupNumber}`,
      entrants: [],
      groupNumber: d.groupNumber,
      stages: [{ id: "s1", order: 0, kind: d.stage.kind, name: d.stage.name ?? d.stage.kind, schedule: {}, ...d.stage }],
    })),
  }) as any;

const structured = (divisions: Array<{ groupNumber: number; stage: any }>) => ({
  builder_architecture: "structured",
  builder_spec: spec(divisions),
});

describe("formatLabelForGroup", () => {
  it("reads Swiss categories from the saved spec", () => {
    const champ = { round_format: "single_round_robin", scoring_mode: "standard" };
    const arch = structured([{ groupNumber: 3, stage: { kind: "swiss", swissRounds: 6 } }]);
    expect(formatLabelForGroup(champ, arch, 3)).toBe("Swiss");
  });

  it("reads round robin categories from the saved spec", () => {
    const champ = { round_format: "single_round_robin", scoring_mode: "standard" };
    const arch = structured([{ groupNumber: 1, stage: { kind: "round_robin" } }]);
    expect(formatLabelForGroup(champ, arch, 1)).toBe("Round robin");
  });

  it("says double round robin when the stage plays twice", () => {
    const arch = structured([{ groupNumber: 1, stage: { kind: "round_robin", legs: 2 } }]);
    expect(formatLabelForGroup({}, arch, 1)).toBe("Double round robin");
  });

  it("uses the per-category format on legacy tournaments", () => {
    const champ = { round_format: "single_round_robin", league_formats: { "2": "swiss" } };
    expect(formatLabelForGroup(champ, null, 2)).toBe("Swiss");
    expect(formatLabelForGroup(champ, null, 1)).toBe("Round robin");
  });

  it("uses the tournament format when no per-category setting exists", () => {
    expect(formatLabelForGroup({ round_format: "knockout" }, null, 1)).toBe("Knockout");
    expect(formatLabelForGroup({ round_format: "double_round_robin" }, null, 1)).toBe("Double round robin");
    expect(formatLabelForGroup({ scoring_mode: "swiss" }, null, 1)).toBe("Swiss");
    expect(formatLabelForGroup({ scoring_mode: "time_capped_points" }, null, 1)).toBe("Timed points");
  });

  it("falls back to round robin when nothing identifies the format", () => {
    expect(formatLabelForGroup({}, null, 1)).toBe("Round robin");
    expect(formatLabelForGroup(null, null, 1)).toBe("Round robin");
  });

  it("ignores a spec from a different tournament architecture", () => {
    const champ = { round_format: "swiss" };
    const arch = { builder_architecture: "legacy", builder_spec: null };
    expect(formatLabelForGroup(champ, arch, 1)).toBe("Swiss");
  });
});

import { scoringLabelForGroup } from "./format-label";
describe("scoringLabelForGroup", () => {
  it("prefers category values", () => {
    expect(scoringLabelForGroup({ points_per_game: 11, best_of: 5, league_points_per_game: { "2": 15 }, league_best_of: { "2": 3 } }, 2)).toBe("PAR 15, best of 3");
    expect(scoringLabelForGroup({ points_per_game: 11, best_of: 5 }, 1)).toBe("PAR 11, best of 5");
    expect(scoringLabelForGroup({ scoring_mode: "time_capped_points" }, 1)).toBe("Bells, timed points");
    expect(scoringLabelForGroup({}, 1)).toBeNull();
  });
});
