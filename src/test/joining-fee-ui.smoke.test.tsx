import { describe, expect, it } from "vitest";
// Smoke: the edited admin screens must at least import/transform cleanly.
describe("joining fee UI modules", () => {
  it("PendingApplicationsPanel imports", async () => {
    const m = await import("@/components/club-admin/PendingApplicationsPanel");
    expect(typeof m.PendingApplicationsPanel).toBe("function");
  });
  it("MembersTab imports", async () => {
    const m = await import("@/components/club-admin/MembersTab");
    expect(m).toBeTruthy();
  });
});
