import { describe, expect, it } from "vitest";
import { isStructuredPlayoffGame } from "@/lib/tournaments/round-plan";

/**
 * The member "By round" list groups games into collapsible sections. Structured
 * play-off games carry round numbers 901+ which read as "no round", so without
 * this gate they fell into the pool-games bucket and sat under a "Pool games"
 * heading. They must group under "Play-offs" instead.
 */
describe("isStructuredPlayoffGame — Play-offs vs Pool games grouping", () => {
  it("groups a structured semifinal as a play-off, not a pool game", () => {
    expect(isStructuredPlayoffGame({
      stage_key: "st_semi_1", stage: "playoff_sf", stage_label: "Semifinal 2", round_number: 901,
    })).toBe(true);
  });

  it("groups a structured final as a play-off", () => {
    expect(isStructuredPlayoffGame({
      stage_key: "st_final", stage: "playoff_final", stage_label: "Final", round_number: 902,
    })).toBe(true);
  });

  it("keeps legacy section games (no stage_key) under their stage labels", () => {
    expect(isStructuredPlayoffGame({ stage: "group", stage_label: "Section A · Semi-final", round_number: 3 })).toBe(false);
  });

  it("keeps paced knockout rounds as knockout rounds, not play-offs", () => {
    expect(isStructuredPlayoffGame({
      stage_key: "st_ko", stage: "ko", stage_label: "", round_number: 1,
    })).toBe(false);
  });

  it("never moves pool/round-robin games out of Pool games", () => {
    expect(isStructuredPlayoffGame({
      stage_key: "st_rr", stage: "group", stage_label: "", round_number: 2,
    })).toBe(false);
  });

  it("ignores Diamond League (dl:) stage keys", () => {
    expect(isStructuredPlayoffGame({
      stage_key: "dl:abc", stage: "playoff_final", stage_label: "Final", round_number: 902,
    })).toBe(false);
  });
});
