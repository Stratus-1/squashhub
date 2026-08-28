import { describe, it, expect } from "vitest";
import { describeRebuildImpact } from "@/lib/tournaments/rebuild-guard";

describe("rebuild guard", () => {
  it("allows a silent rebuild when nothing has been played", () => {
    const i = describeRebuildImpact([
      { status: "scheduled" },
      { status: "scheduled" },
      { status: "completed", is_bye: true },
    ]);
    expect(i.requiresConfirmation).toBe(false);
    expect(i.played).toBe(0);
  });

  it("requires confirmation once a result exists", () => {
    const i = describeRebuildImpact([
      { status: "completed", winner_member_id: "A", score: "11-5" },
      { status: "scheduled" },
    ]);
    expect(i.requiresConfirmation).toBe(true);
    expect(i.played).toBe(1);
    expect(i.pending).toBe(1);
  });

  it("flags matches being marked right now", () => {
    const i = describeRebuildImpact([{ status: "in_progress" }]);
    expect(i.inProgress).toBe(1);
    expect(i.requiresConfirmation).toBe(true);
  });

  it("counts player bookings as at risk", () => {
    const i = describeRebuildImpact([{ status: "scheduled", booking_id: "bk1" }]);
    expect(i.booked).toBe(1);
    expect(i.requiresConfirmation).toBe(true);
  });
});
