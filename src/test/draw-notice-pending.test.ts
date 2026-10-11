import { describe, it, expect } from "vitest";
import { pendingDrawNotices, drawNoticeKey, drawNotifyOn } from "@/lib/smart-builder/draw-notice";

describe("pending draw notices", () => {
  it("lists saved pending decisions oldest first", () => {
    const bl = { draw_notice_pending: { "all:r1": { scope: { round: 1 }, at: "2026-10-11T13:37:00Z" }, "2:r2": { scope: { round: 2, groupNumber: 2 }, at: "2026-10-11T13:00:00Z" } } };
    expect(pendingDrawNotices(bl).map((p) => p.key)).toEqual(["2:r2", "all:r1"]);
  });
  it("never re-prompts a scope already sent", () => {
    const key = drawNoticeKey({ round: 1 });
    const bl = { draw_notice_pending: { [key]: { scope: { round: 1 }, at: "x" } }, draw_notices: { [key]: { at: "y", sent: 10 } } };
    expect(pendingDrawNotices(bl)).toEqual([]);
  });
  it("draws made before this change have no pending state (no retrospective prompt)", () => {
    expect(pendingDrawNotices({ draw_notify: true })).toEqual([]);
  });
  it("Off skips the prompt; default asks", () => {
    expect(drawNotifyOn({ draw_notify: false })).toBe(false);
    expect(drawNotifyOn({})).toBe(true);
  });
});
