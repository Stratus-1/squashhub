import { describe, expect, it } from "vitest";
import { runoffForPosition } from "@/lib/agm/runoff";

const tally = (votes: number[]) => votes.map((votes, i) => ({ candidate_id: String(i), name: String(i), votes }));
describe("AGM run-off seats", () => {
  it("runs a second ballot only between candidates tied for one position", () => {
    expect(runoffForPosition(tally([4, 4, 1]))).toEqual({ elected: [], tied: tally([4, 4]), remainingSeats: 1 });
  });
  it("preserves elected candidates and votes for only the two remaining seats of three", () => {
    const result = runoffForPosition(tally([8, 4, 4, 4, 1]), 3);
    expect(result?.elected.map(c => c.candidate_id)).toEqual(["0"]);
    expect(result?.tied.map(c => c.candidate_id)).toEqual(["1", "2", "3"]);
    expect(result?.remainingSeats).toBe(2);
  });
  it("does not rerun ties below the last seat", () => {
    expect(runoffForPosition(tally([8, 7, 4, 4]), 2)).toBeNull();
  });
  it("does not elect or rerun a position without votes", () => {
    expect(runoffForPosition(tally([0, 0]))).toBeNull();
  });
  it("allows another run-off if the second ballot also ties", () => {
    expect(runoffForPosition(tally([2, 2]))?.remainingSeats).toBe(1);
  });
});