import { describe, expect, it } from "vitest";
import { groupingClubIds, resolveEligibleClubs, type GroupingRow, type OrgRow, type RelRow } from "@/lib/tournaments/eligibility";
import { provinceOf } from "@/lib/federation/provinces";

const org = (id: string, kind: string, club_id: string | null = null): OrgRow => ({ id, kind, name: id, club_id });
const orgs: OrgRow[] = [
  org("ssa", "national"), org("njs", "zone"), org("mjs", "provincial"), org("ljs", "provincial"),
  org("mhv", "association"), org("lim", "association"), org("nsa", "association"),
  org("highveld", "club", "c-highveld"), org("secunda", "club", "c-secunda"), org("polokwane", "club", "c-polokwane"),
  org("sasol", "club", "c-sasol"), org("uitsig", "club", "c-uitsig"),
];
const rels: RelRow[] = [
  { parent_org_id: "ssa", child_org_id: "mhv" }, { parent_org_id: "ssa", child_org_id: "lim" }, { parent_org_id: "ssa", child_org_id: "nsa" },
  { parent_org_id: "mhv", child_org_id: "highveld" }, { parent_org_id: "mhv", child_org_id: "secunda" },
  { parent_org_id: "lim", child_org_id: "polokwane" }, { parent_org_id: "nsa", child_org_id: "uitsig" },
];
const groupings: GroupingRow[] = [
  { parent_org_id: "ssa", child_org_id: "njs", mode: "include" },
  { parent_org_id: "njs", child_org_id: "mjs", mode: "include" },
  { parent_org_id: "njs", child_org_id: "ljs", mode: "include" },
  { parent_org_id: "mjs", child_org_id: "mhv", mode: "include" },
  { parent_org_id: "mjs", child_org_id: "sasol", mode: "include" },
  { parent_org_id: "ljs", child_org_id: "lim", mode: "include" },
];

describe("junior provincial groupings", () => {
  it("a provincial association includes its whole associations plus single clubs", () => {
    expect(groupingClubIds("mjs", orgs, rels, groupings).sort()).toEqual(["c-highveld", "c-sasol", "c-secunda"]);
  });

  it("the zone rolls up every provincial association, and never NSA clubs", () => {
    const ids = groupingClubIds("njs", orgs, rels, groupings);
    expect(ids.sort()).toEqual(["c-highveld", "c-polokwane", "c-sasol", "c-secunda"]);
    expect(ids).not.toContain("c-uitsig");
  });

  it("a left-out club drops out of the grouping only", () => {
    const g = [...groupings, { parent_org_id: "mjs", child_org_id: "secunda", mode: "exclude" }];
    expect(groupingClubIds("mjs", orgs, rels, g)).not.toContain("c-secunda");
    // senior association is unaffected
    expect(resolveEligibleClubs({ scope: "association", clubId: null, ownerOrgId: "mhv", orgs, rels, groupings: g }).clubIds.sort())
      .toEqual(["c-highveld", "c-secunda"]);
  });

  it("a club can be in a senior association and a junior province at the same time", () => {
    expect(resolveEligibleClubs({ scope: "association", clubId: null, ownerOrgId: "mhv", orgs, rels, groupings }).clubIds).toContain("c-highveld");
    expect(resolveEligibleClubs({ scope: "provincial", clubId: null, ownerOrgId: "mjs", orgs, rels, groupings }).clubIds).toContain("c-highveld");
  });

  it("zone scope from a provincial owner climbs to its zone", () => {
    const r = resolveEligibleClubs({ scope: "zone", clubId: null, ownerOrgId: "mjs", orgs, rels, groupings });
    expect(r.scopeOrgName).toBe("njs");
    expect(r.clubIds).toContain("c-polokwane");
  });

  it("provincial scope without a provincial owner fails closed to the host club", () => {
    expect(resolveEligibleClubs({ scope: "provincial", clubId: "c-uitsig", ownerOrgId: "uitsig", orgs, rels, groupings }).clubIds).toEqual(["c-uitsig"]);
  });

  it("reads the province from a location", () => {
    expect(provinceOf("Witbank, Mpumalanga")).toBe("Mpumalanga");
    expect(provinceOf("Rustenburg, North-West")).toBe("North West");
    expect(provinceOf("Kimberley, Northern Cape")).toBe("Northern Cape");
    expect(provinceOf("Somewhere")).toBeNull();
  });
});
