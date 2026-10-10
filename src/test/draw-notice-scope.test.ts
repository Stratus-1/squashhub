import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/comms/send", () => ({ sendComms: vi.fn() }));
vi.mock("@/lib/smart-builder/step-handover", () => ({ entryPayLinks: vi.fn(), emailPayButton: vi.fn(), payRoute: vi.fn() }));
import { drawNotifyOn, drawNoticeKey, drawNoticeSent, drawNoticeRecipients } from "@/lib/smart-builder/draw-notice";
describe("draw notice setting and scope", () => {
  it("Ask me after each draw is default; only explicit Off skips the prompt", () => {
    expect(drawNotifyOn(null)).toBe(true);
    expect(drawNotifyOn({ draw_notify: true })).toBe(true);
    expect(drawNotifyOn({ draw_notify: false })).toBe(false);
  });
  it("keys are per category and round, so Men's A R2 never collides with R1 or other categories", () => {
    expect(drawNoticeKey({ round: 2, groupNumber: 1 })).toBe("1:r2");
    expect(drawNoticeKey({ round: 1 })).toBe("all:r1");
    expect(drawNoticeSent({ draw_notices: { "1:r2": { at: "x", sent: 16 } } }, "1:r2")).toEqual({ at: "x", sent: 16 });
    expect(drawNoticeSent({}, "2:r2")).toBeNull();
  });
  it("recipients exclude finished games' players and byes without an opponent count only the bye player", () => {
    expect(drawNoticeRecipients([{ status: "scheduled", player_a_member_id: "a", player_b_member_id: "b" }, { status: "completed", player_a_member_id: "c", player_b_member_id: "d" }])).toEqual(["a", "b"]);
  });
});
