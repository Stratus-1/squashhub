import { describe, it, expect } from "vitest";
import { recipientPreset, recipientStatus, type DeliveryRowAt } from "@/lib/smart-builder/step-handover";

const row = (id: string, campaign: string, status: string, at: string, channel = "in_app"): DeliveryRowAt =>
  ({ club_member_id: id, channel, status, error_message: status === "sent" ? null : "no address", created_at: at, campaign_id: campaign });

describe("Step-by-Step recipient selection", () => {
  const ids = ["a", "b", "c", "d"];
  const first = [row("a", "c1", "sent", "2026-10-01"), row("b", "c1", "sent", "2026-10-01"), row("c", "c1", "failed", "2026-10-01")];

  it("presets: all, none, not informed (failed + never sent)", () => {
    const st = recipientStatus(ids, first);
    expect(recipientPreset("all", st)).toEqual(ids);
    expect(recipientPreset("none", st)).toEqual([]);
    expect(recipientPreset("not_informed", st)).toEqual(["c", "d"]);
  });

  it("subset resend changes only the resent players' status", () => {
    const before = recipientStatus(ids, first);
    const after = recipientStatus(ids, [...first, row("b", "c2", "sent", "2026-10-02", "email"), row("d", "c2", "sent", "2026-10-02")]);
    const by = (s: typeof after, id: string) => s.find((x) => x.memberId === id)!;
    expect(by(after, "a")).toEqual(by(before, "a"));
    expect(by(after, "c")).toEqual(by(before, "c"));
    expect(by(after, "b").sends).toBe(2);
    expect(by(after, "b").reached).toEqual(["in_app", "email"]);
    expect(by(after, "b").last).toBe("2026-10-02");
    expect(by(after, "d").state).toBe("sent");
    expect(recipientPreset("not_informed", after)).toEqual(["c"]);
  });
});
