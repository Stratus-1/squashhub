import { describe, expect, it } from "vitest";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
// Generated bundle is exercised only through pure read-only exports.
import { buildSwissProgression as bundledModel, buildProposedSwissGrid as bundledGrid } from "../../supabase/functions/auto-progress-tournaments/engine.js";

describe("Withheld service bundle matches the shared display algorithm", () => {
  it.each([[18,3],[16,4]])("provisional R3–5 group/remainder parity for %i/%i", (n, groups) => {
    const input = { seedOrder: Array.from({ length: n }, (_, i) => `p${i + 1}`), names: {}, matches: [], totalRounds: 5 };
    const source = buildSwissProgression(input), bundled = bundledModel(input);
    source.rrFinish = bundled.rrFinish = { enabled: true, groups };
    expect(bundledGrid(bundled)).toEqual(buildProposedSwissGrid(source));
  });
});