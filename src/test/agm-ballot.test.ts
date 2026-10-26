import { describe, expect, it } from "vitest";
import { buildVoteLink, parseBallotText, positionWinners, recountFromReceipts } from "@/lib/agm/ballot";

describe("AGM ballot helpers", () => {
  it("parses one line per position and drops duplicate nominees", () => {
    const p = parseBallotText("Chairperson: Bradley Hunt, Reinhardt Falke, bradley hunt\n\nTreasurer: Hanno Kamfer");
    expect(p).toEqual([
      { title: "Chairperson", nominees: ["Bradley Hunt", "Reinhardt Falke"] },
      { title: "Treasurer", nominees: ["Hanno Kamfer"] },
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
    expect(positionWinners([{ candidate_id: "a", name: "A", votes: 3 }, { candidate_id: "b", name: "B", votes: 3 }])).toEqual(["A", "B"]);
    expect(positionWinners([{ candidate_id: "a", name: "A", votes: 0 }])).toEqual([]);
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
