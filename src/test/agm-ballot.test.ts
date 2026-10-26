import { describe, expect, it } from "vitest";
import { buildVoteLink, parseBallotText, positionWinners, recountFromReceipts } from "@/lib/agm/ballot";

describe("AGM ballot helpers", () => {
  it("parses one line per position and drops duplicate nominees", () => {
    const p = parseBallotText("Chairperson: Bradley Hunt, Reinhardt Falke, bradley hunt\n\nTreasurer: Hanno Kamfer");
    expect(p).toEqual([
      { title: "Chairperson", nominees: ["Bradley Hunt", "Reinhardt Falke"], maxChoices: 1 },
      { title: "Treasurer", nominees: ["Hanno Kamfer"], maxChoices: 1 },
    ]);
  });

  it("rejects a position without nominees or listed twice", () => {
    expect(() => parseBallotText("Chairperson:")).toThrow();
    expect(() => parseBallotText("Chair: A\nchair: B")).toThrow();
  });

  it("uses the main domain for live links", () => {
    expect(buildVoteLink("abc", "https://uit.squashhub.co.za")).toBe("https://squashhub.co.za/vote/abc");
    expect(buildVoteLink("abc", "http://localhost:8080")).toBe("http://localhost:8080/vote/abc");
  });

  it("reports ties and no-vote positions", () => {
    expect(positionWinners([{ candidate_id: "a", name: "A", votes: 3 }, { candidate_id: "b", name: "B", votes: 3 }])).toEqual({ elected: [], tie: ["A", "B"] });
    expect(positionWinners([{ candidate_id: "a", name: "A", votes: 0 }])).toEqual({ elected: [], tie: [] });
  });

  it("recounts a position from anonymous receipts", () => {
    const r = recountFromReceipts(
      [{ code: "1", choices: { p: "a" } }, { code: "2", choices: { p: "a" } }, { code: "3", choices: { p: null } }],
      "p",
    );
    expect(r).toEqual({ a: 2, abstain: 1 });
  });
});

import { buildInviteLink, meetingLine } from "@/lib/agm/ballot";
describe("AGM invitation helpers", () => {
  it("builds invitation links on the main domain", () => {
    expect(buildInviteLink("abc", "https://uit.squashhub.co.za")).toBe("https://squashhub.co.za/agm/abc");
  });
  it("shows the meeting in Johannesburg time with venue", () => {
    expect(meetingLine("2026-11-05T16:00:00Z", "Clubhouse")).toMatch(/18:00 at Clubhouse$/);
  });
});

describe("multi-choice positions", () => {
  it("reads the number of choices from the position title", () => {
    const [p] = parseBallotText("General Member (3): A, B, C, D");
    expect(p.title).toBe("General Member");
    expect(p.maxChoices).toBe(3);
  });
  it("defaults to one choice", () => {
    expect(parseBallotText("Chairperson: A, B")[0].maxChoices).toBe(1);
  });
  it("rejects more choices than nominees", () => {
    expect(() => parseBallotText("General Member (3): A, B")).toThrow();
  });
  it("elects the top three for three places", () => {
    const t = [5, 4, 3, 1].map((v, i) => ({ candidate_id: String(i), name: "ABCD"[i], votes: v }));
    expect(positionWinners(t, 3)).toEqual({ elected: ["A", "B", "C"], tie: [] });
  });
  it("flags a tie at the last place", () => {
    const t = [5, 3, 3, 3].map((v, i) => ({ candidate_id: String(i), name: "ABCD"[i], votes: v }));
    expect(positionWinners(t, 3)).toEqual({ elected: ["A"], tie: ["B", "C", "D"] });
  });
  it("recounts every pick on a multi-choice receipt", () => {
    expect(recountFromReceipts([{ code: "X", choices: { p: ["a", "b"] } }, { code: "Y", choices: { p: null } }], "p"))
      .toEqual({ a: 1, b: 1, abstain: 1 });
  });
});
