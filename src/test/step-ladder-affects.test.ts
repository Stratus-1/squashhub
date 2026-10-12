import { describe, it, expect } from "vitest";
import { clubAllowsTournamentLadder, ladderAffectsPatch } from "@/lib/smart-builder/step-handover";

describe("Step-by-Step 'Affect club ladder' switch", () => {
  it("new tournaments default OFF", () => {
    expect(ladderAffectsPatch(undefined, true)).toEqual({ ladder_affects: false });
  });
  it("organiser opt-in is saved explicitly", () => {
    expect(ladderAffectsPatch(true, true)).toEqual({ ladder_affects: true });
    expect(ladderAffectsPatch(false, false)).toEqual({ ladder_affects: false });
    expect(ladderAffectsPatch(true, false)).toEqual({ ladder_affects: true });
  });
  it("editing an existing tournament never rewrites the stored value when untouched", () => {
    expect(ladderAffectsPatch(undefined, false)).toEqual({});
  });
  it("club permission: allowed unless the club switched tournament moves off", () => {
    expect(clubAllowsTournamentLadder(null)).toBe(true);
    expect(clubAllowsTournamentLadder({ ladder_from_tournaments: true })).toBe(true);
    expect(clubAllowsTournamentLadder({ ladder_from_tournaments: null })).toBe(true);
    expect(clubAllowsTournamentLadder({ ladder_from_tournaments: false })).toBe(false);
  });
});

/** Mirror of the DB rule in award_points_for_champ_match (club OFF wins; NULL inherits). */
const dbMoves = (club: boolean | null, t: boolean | null) => club !== false && (t ?? club ?? false) === true;
describe("ladder trigger decision table", () => {
  it.each([
    [true, null, true], [true, true, true], [true, false, false],
    [false, null, false], [false, true, false], [false, false, false],
    [null, null, false], [null, true, true], [null, false, false],
  ])("club=%s tournament=%s → moves=%s", (c, t, out) => expect(dbMoves(c as any, t as any)).toBe(out));
});
