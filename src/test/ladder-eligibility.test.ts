import { describe, it, expect } from "vitest";
import {
  DEFAULT_LADDER_CONFIG,
  buildPyramidRows,
  evaluateChallenge,
  pyramidRowFor,
  pyramidRowRange,
  type LadderConfig,
} from "@/lib/ladder/eligibility";

const std = (over: Partial<LadderConfig> = {}): LadderConfig => ({ ...DEFAULT_LADDER_CONFIG, ...over });
const pyr = (over: Partial<LadderConfig> = {}): LadderConfig =>
  ({ ...DEFAULT_LADDER_CONFIG, format: "pyramid", ...over });

describe("pyramid geometry", () => {
  it("maps positions to triangular rows", () => {
    expect(pyramidRowFor(1)).toBe(1);
    expect(pyramidRowFor(3)).toBe(2);
    expect(pyramidRowFor(5)).toBe(3);
    expect(pyramidRowFor(29)).toBe(8);
    expect(pyramidRowFor(22)).toBe(7);
  });

  it("returns row ranges", () => {
    expect(pyramidRowRange(2)).toEqual({ first: 2, last: 3 });
    expect(pyramidRowRange(7)).toEqual({ first: 22, last: 28 });
    expect(pyramidRowRange(8)).toEqual({ first: 29, last: 36 });
  });

  it("honours custom row sizes", () => {
    expect(pyramidRowFor(4, [1, 2, 4])).toBe(3);
    expect(pyramidRowRange(3, [1, 2, 4])).toEqual({ first: 4, last: 7 });
  });

  it("splits entries into rows", () => {
    const rows = buildPyramidRows([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.map((r) => r.length)).toEqual([1, 2, 3, 1]);
  });
});

describe("standard ladder eligibility", () => {
  const base = { config: std(), sameGenderGroup: true };

  it("allows challenging within the configured gap", () => {
    expect(evaluateChallenge({ ...base, myPosition: 5, opponentPosition: 3 }).allowed).toBe(true);
  });

  it("blocks challenging too far up", () => {
    const r = evaluateChallenge({ ...base, myPosition: 8, opponentPosition: 3 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/2 positions above/);
  });

  it("blocks challenging downwards", () => {
    expect(evaluateChallenge({ ...base, myPosition: 3, opponentPosition: 5 }).allowed).toBe(false);
  });

  it("hides across ladder groups", () => {
    const r = evaluateChallenge({ ...base, sameGenderGroup: false, myPosition: 5, opponentPosition: 4 });
    expect(r.hidden).toBe(true);
  });
});

describe("pyramid ladder eligibility", () => {
  const base = { config: pyr(), sameGenderGroup: true };

  it("allows anyone in the row directly above (5 -> 3)", () => {
    expect(evaluateChallenge({ ...base, myPosition: 5, opponentPosition: 3 }).allowed).toBe(true);
  });

  it("allows the full row above (29 -> 22)", () => {
    expect(evaluateChallenge({ ...base, myPosition: 29, opponentPosition: 22 }).allowed).toBe(true);
  });

  it("blocks skipping a row (29 -> 21)", () => {
    expect(evaluateChallenge({ ...base, myPosition: 29, opponentPosition: 21 }).allowed).toBe(false);
  });

  it("blocks challenging inside your own row", () => {
    expect(evaluateChallenge({ ...base, myPosition: 6, opponentPosition: 4 }).allowed).toBe(false);
  });
});

describe("limits and cooldown", () => {
  it("blocks when the challenger is at the open limit", () => {
    const r = evaluateChallenge({
      config: std({ max_active_outgoing: 1 }),
      sameGenderGroup: true,
      myPosition: 5,
      opponentPosition: 4,
      myOpenOutgoing: 1,
    });
    expect(r.allowed).toBe(false);
  });

  it("allows unlimited open challenges when set to 0", () => {
    const r = evaluateChallenge({
      config: std({ max_active_outgoing: 0, max_active_incoming: 0 }),
      sameGenderGroup: true,
      myPosition: 5,
      opponentPosition: 4,
      myOpenOutgoing: 5,
      opponentOpenIncoming: 5,
    });
    expect(r.allowed).toBe(true);
  });

  it("enforces the rematch cooldown", () => {
    const r = evaluateChallenge({
      config: std({ rematch_cooldown_days: 14 }),
      sameGenderGroup: true,
      myPosition: 5,
      opponentPosition: 4,
      daysSinceLastMeeting: 3,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/11 days/);
  });
});
