import { describe, it, expect } from "vitest";
import { outcomeFromApprovers, approverOptions, isWaitingForMe, canEdit } from "./approvals";

describe("committee approval rules", () => {
  it("is approved only when every selected approver approved", () => {
    expect(outcomeFromApprovers(["approved", "pending"])).toBe("open");
    expect(outcomeFromApprovers(["approved", "approved"])).toBe("approved");
  });
  it("one decline ends the request as declined", () => {
    expect(outcomeFromApprovers(["approved", "declined", "pending"])).toBe("declined");
  });
  it("requester cannot pick themselves as approver", () => {
    const m = [{ member_id: "a", name: "A", office: "Treasurer", is_admin: false, has_email: true },
               { member_id: "b", name: "B", office: "Chairman", is_admin: false, has_email: true }];
    expect(approverOptions(m, ["a"]).map((x) => x.member_id)).toEqual(["b"]);
  });
  it("decided requests can't change", () => {
    expect(canEdit("approved")).toBe(false);
    expect(canEdit("declined")).toBe(false);
    expect(canEdit("open")).toBe(true);
  });
  it("waiting-for-me only counts my pending answer on open requests", () => {
    const r: any = { status: "open", approvers: [{ member_id: "b", status: "pending" }] };
    expect(isWaitingForMe(r, ["b"])).toBe(true);
    expect(isWaitingForMe({ ...r, status: "withdrawn" }, ["b"])).toBe(false);
  });
});
