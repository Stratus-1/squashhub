import { describe, expect, it } from "vitest";
import { memberOutstandingRequest } from "@/lib/finance/member-outstanding";

const input = { clubId: "club", memberId: "member", amount: "125.50", description: " Brought-forward debt ", date: "2026-10-20", requestId: "request" };

describe("member outstanding balance adjustment", () => {
  it("adds the selected amount to the selected member without any payment or income arguments", () => {
    expect(memberOutstandingRequest(input)).toEqual({ _club_id: "club", _club_member_id: "member", _amount: 125.5, _description: "Brought-forward debt", _date: "2026-10-19T22:00:00.000Z", _request_id: "request" });
  });
  it.each(["0", "-1", "1.001", "NaN", "Infinity", "1abc"])("rejects invalid debt amount %s", amount => {
    expect(() => memberOutstandingRequest({ ...input, amount })).toThrow();
  });
  it("requires a member", () => expect(() => memberOutstandingRequest({ ...input, memberId: "" })).toThrow());
  it("requires an audit description", () => expect(() => memberOutstandingRequest({ ...input, description: " " })).toThrow());
  it("rejects impossible dates", () => expect(() => memberOutstandingRequest({ ...input, date: "2026-02-30" })).toThrow());
  it("preserves the request identity on retry", () => expect(memberOutstandingRequest(input)._request_id).toBe(memberOutstandingRequest(input)._request_id));
});
import { memberCorrectionRequest } from "@/lib/finance/member-outstanding";
describe("member account corrections", () => {
  it("sends correction up as direction up", () => expect(memberCorrectionRequest({ ...input, direction: "up" })._direction).toBe("up"));
  it("sends correction down as direction down with a positive amount", () => {
    const r = memberCorrectionRequest({ ...input, direction: "down" });
    expect(r._direction).toBe("down"); expect(r._amount).toBe(125.5);
  });
  it("rejects an unknown direction", () => expect(() => memberCorrectionRequest({ ...input, direction: "sideways" as any })).toThrow());
});
