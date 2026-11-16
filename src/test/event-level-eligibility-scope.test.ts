import { describe, expect, it } from "vitest";
import { eligibilityScopeForLevel } from "@/lib/smart-builder/step-handover";
import { audienceModesForScope } from "@/lib/tournaments/invite-audience";

describe("event level → invitation club picker", () => {
  it("regional events allow choosing clubs to invite", () => {
    expect(eligibilityScopeForLevel("regional")).toBe("association");
    expect(audienceModesForScope(eligibilityScopeForLevel("regional"))).toContain("clubs");
  });
  it("national events allow choosing clubs to invite", () => {
    expect(eligibilityScopeForLevel("national")).toBe("open");
  });
  it("club events keep club-only invitations", () => {
    expect(eligibilityScopeForLevel("club")).toBe("club");
    expect(audienceModesForScope(eligibilityScopeForLevel("club"))).not.toContain("clubs");
  });
  it("an unanswered level leaves the saved scope alone", () => {
    expect(eligibilityScopeForLevel(null)).toBeNull();
  });
});
