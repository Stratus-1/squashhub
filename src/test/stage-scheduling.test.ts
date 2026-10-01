import { describe, expect, it } from "vitest";
import {
  applyPlayoffPreset, assignFixedSlots, parseStageScheduling, presetFor,
  stageModeForGame, stageSchedulingFromChamp, validateStageScheduling, type PlayoffKey,
} from "@/lib/tournaments/round-plan";

const keys: PlayoffKey[] = ["quarter_final", "semi_final", "final"];

describe("mixed stage scheduling", () => {
  it("falls back to the tournament-wide mode when nothing is saved", () => {
    expect(stageModeForGame({ stage: "playoff_final" }, {}, "self")).toBe("self");
    expect(stageModeForGame({ stage: "pool" }, null, "club")).toBe("club");
  });
  it("only-final preset: pools play-by, final + 3rd/4th fixed", () => {
    const ss = applyPlayoffPreset("final_fixed", keys, {}, "self");
    expect(stageModeForGame({ stage: "pool" }, ss, "self")).toBe("self");
    expect(stageModeForGame({ stage: "playoff_sf" }, ss, "self")).toBe("self");
    expect(stageModeForGame({ stage: "playoff_final" }, ss, "self")).toBe("club");
    expect(stageModeForGame({ stage: "playoff_3rd" }, ss, "self")).toBe("club");
    expect(presetFor(ss, keys, "self")).toBe("final_fixed");
  });
  it("all-fixed preset and hand edits", () => {
    const ss = applyPlayoffPreset("all_fixed", keys, {}, "self");
    expect(presetFor(ss, keys, "self")).toBe("all_fixed");
    ss.playoffs!.quarter_final!.mode = "self";
    expect(presetFor(ss, keys, "self")).toBeNull();
  });
  it("requires time and courts on fixed rounds", () => {
    const ss = applyPlayoffPreset("final_fixed", keys, {}, "self");
    expect(validateStageScheduling(ss, keys, "self")).toHaveLength(2);
    ss.playoffs!.final = { mode: "club", start_time: "18:00", court_ids: [2] };
    expect(validateStageScheduling(ss, keys, "self")).toEqual([]);
  });
  it("fills courts, then the next time slot", () => {
    expect(assignFixedSlots(3, { mode: "club", start_time: "18:00", court_ids: [1, 2] }, 45)).toEqual([
      { court_id: 1, scheduled_time: "18:00" },
      { court_id: 2, scheduled_time: "18:00" },
      { court_id: 1, scheduled_time: "18:45" },
    ]);
    expect(assignFixedSlots(1, { mode: "club", court_ids: [] }, 45)).toEqual([null]);
  });
  it("reads from milestone_play_by and ignores junk", () => {
    expect(parseStageScheduling({ playoffs: { final: { mode: "bad" } } })).toEqual({ playoffs: {} });
    const ss = stageSchedulingFromChamp({ milestone_play_by: { final: "2026-10-30", stage_scheduling: { opening: "self", playoffs: { final: { mode: "club", start_time: "18:00:00", court_ids: ["3"] } } } } });
    expect(ss.playoffs?.final).toEqual({ mode: "club", start_time: "18:00", court_ids: [3] });
  });
});
