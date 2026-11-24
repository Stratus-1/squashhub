import { describe, it, expect } from "vitest";
import { parentZoneOf } from "@/lib/tournaments/eligibility";

const orgs = [
  { id: "ssa", name: "Squash South Africa", kind: "national", club_id: null },
  { id: "zone-n", name: "Northern Country Districts Juniors", kind: "zone", club_id: null },
  { id: "prov-m", name: "Mpumalanga Junior Squash", kind: "provincial", club_id: null },
  { id: "prov-w", name: "Mpumalanga West Junior Squash", kind: "provincial", club_id: null },
  { id: "o-sec", name: "Secunda", kind: "club", club_id: "sec" },
];
const groupings = [
  { parent_org_id: "ssa", child_org_id: "zone-n", mode: "include" },
  { parent_org_id: "zone-n", child_org_id: "prov-m", mode: "include" },
  { parent_org_id: "zone-n", child_org_id: "prov-w", mode: "include" },
  { parent_org_id: "prov-m", child_org_id: "o-sec", mode: "include" },
];

describe("junior body master zone", () => {
  it("shows a provincial body's master zone", () => {
    expect(parentZoneOf("prov-m", orgs, groupings)?.name).toBe("Northern Country Districts Juniors");
  });
  it("walks up from a club grouped under a provincial to the zone above it", () => {
    expect(parentZoneOf("o-sec", orgs, groupings)?.name).toBe("Northern Country Districts Juniors");
  });
  it("fails closed when nothing links the body to a zone", () => {
    expect(parentZoneOf("ssa", orgs, groupings)).toBeNull();
    expect(parentZoneOf("prov-m", orgs, [])).toBeNull();
    expect(parentZoneOf(null, orgs, groupings)).toBeNull();
  });
  it("never resolves a zone through an exclude link", () => {
    const excl = [...groupings, { parent_org_id: "zone-n", child_org_id: "prov-w", mode: "exclude" }];
    expect(parentZoneOf("prov-w", orgs, excl)?.name).toBe("Northern Country Districts Juniors");
    expect(parentZoneOf("prov-w", orgs, [{ parent_org_id: "zone-n", child_org_id: "prov-w", mode: "exclude" }])).toBeNull();
  });
});
