import { describe, it, expect } from "vitest";
import { drawNoticeMode, drawNotifyOn } from "@/lib/smart-builder/draw-notice";
import { isOpenNoticeState, splitOpenNotices } from "@/lib/tournaments/fixture-draw-notice";

describe("draw notice mode", () => {
  it("maps saved values; default stays Prompt (existing behaviour)", () => {
    expect(drawNoticeMode({})).toBe("prompt");
    expect(drawNoticeMode({ draw_notify: true })).toBe("prompt");
    expect(drawNoticeMode({ draw_notify: "auto" })).toBe("auto");
    expect(drawNoticeMode({ draw_notify: false })).toBe("off");
  });
  it("legacy round prompt only runs in Prompt mode", () => {
    expect(drawNotifyOn({ draw_notify: "auto" })).toBe(false);
    expect(drawNotifyOn({ draw_notify: false })).toBe(false);
    expect(drawNotifyOn(undefined)).toBe(true);
  });
});
describe("open fixture notices", () => {
  it("sent/off/auto/unconfirmed are never offered again", () => {
    for (const s of ["sent", "off", "auto", null]) expect(isOpenNoticeState(s as any)).toBe(false);
    for (const s of ["pending", "dismissed", "correction"]) expect(isOpenNoticeState(s)).toBe(true);
  });
  it("Later keeps fixtures sendable but out of the fresh prompt; corrections are prompted", () => {
    const n = (id: string, state: any) => ({ id, state, round: 2, group: 1, label: "Round 2", a: "A", b: "B", when: "" });
    const r = splitOpenNotices([n("1", "pending"), n("2", "dismissed"), n("3", "correction")]);
    expect(r.fresh.map((x) => x.id)).toEqual(["1", "3"]);
    expect(r.later.map((x) => x.id)).toEqual(["2"]);
  });
});
