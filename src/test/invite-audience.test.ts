import { describe, it, expect } from "vitest";
import {
  audienceLabel,
  partitionAcceptedEntrants,
  resolveInviteAudience,
  type AudienceMemberRow,
} from "@/lib/tournaments/invite-audience";

const members: AudienceMemberRow[] = [
  { id: "m1", status: "active", role: "member" }, // league player
  { id: "m2", status: "active", role: "member" }, // league player
  { id: "m3", status: "active", role: "member" }, // NOT a league player
  { id: "m4", status: "resigned", role: "member" },
  { id: "m5", status: "active", role: "visitor" },
];

const registrationsByLeague = new Map<string, string[]>([
  ["L1", ["m1"]],
  ["L2", ["m2"]],
]);

describe("invitation audience is independent of Structure", () => {
  it("all club members with NO leagues selected invites every active member", () => {
    const res = resolveInviteAudience({ mode: "all_club", members, leagueIds: [] });
    expect(res.memberIds.sort()).toEqual(["m1", "m2", "m3"]);
  });

  it("selected-league audience invites only that league's members", () => {
    const res = resolveInviteAudience({ mode: "leagues", members, leagueIds: ["L1"], registrationsByLeague });
    expect(res.memberIds).toEqual(["m1"]);
  });

  it("selected individual non-league member is invited", () => {
    const res = resolveInviteAudience({ mode: "individuals", members, individualIds: ["m3"] });
    expect(res.memberIds).toEqual(["m3"]);
  });

  it("can combine selected leagues with explicit individuals", () => {
    const res = resolveInviteAudience({
      mode: "leagues",
      members,
      leagueIds: ["L1"],
      registrationsByLeague,
      individualIds: ["m3"],
      includeIndividuals: true,
    });
    expect(res.memberIds.sort()).toEqual(["m1", "m3"]);
    expect(res.summary).toMatch(/1 individually added/);
  });

  it("never invites inactive members or visitors", () => {
    const res = resolveInviteAudience({ mode: "individuals", members, individualIds: ["m4", "m5"] });
    expect(res.memberIds).toEqual([]);
  });

  it("honours organiser exclusions and de-duplicates", () => {
    const res = resolveInviteAudience({
      mode: "individuals",
      members,
      individualIds: ["m1", "m1", "m2"],
      excludedIds: ["m2"],
    });
    expect(res.memberIds).toEqual(["m1"]);
  });

  it("labels each audience mode", () => {
    expect(audienceLabel("all_club")).toMatch(/all members of the club/i);
    expect(audienceLabel("leagues")).toMatch(/leagues/);
    expect(audienceLabel("individuals")).toMatch(/individual/);
  });
});

describe("acceptance never rejects non-league members", () => {
  it("places unmapped accepted entrants into needs-assignment", () => {
    const { assigned, unassigned } = partitionAcceptedEntrants({
      acceptedMemberIds: ["m1", "m3"],
      divisionByMember: new Map([["m1", 1]]),
    });
    expect(assigned).toEqual(["m1"]);
    expect(unassigned).toEqual(["m3"]);
  });

  it("treats a missing map as all-unassigned rather than excluding anyone", () => {
    const res = partitionAcceptedEntrants({ acceptedMemberIds: ["a", "b"] });
    expect(res.unassigned).toEqual(["a", "b"]);
    expect(res.assigned).toEqual([]);
  });
});

describe("invite audience excludes non-members", () => {
  const base = [
    { id: "a", status: "active", role: "member" },
    { id: "b", status: "active", role: "captain" },
    { id: "v", status: "active", role: "visitor" },
    { id: "r", status: "resigned", role: "member" },
    { id: "p", status: "active", role: "member", billing_exempt: true },
  ];

  it("all_club invites only real active members", () => {
    const res = resolveInviteAudience({ mode: "all_club", members: base as any });
    expect(res.memberIds.sort()).toEqual(["a", "b"]);
    expect(res.excluded).toEqual({ visitors: 1, inactive: 1, placeholders: 1 });
    expect(res.summary).toContain("1 visitor");
  });

  it("league mode never pulls a visitor in through registrations", () => {
    const res = resolveInviteAudience({
      mode: "leagues",
      members: base as any,
      leagueIds: ["L1"],
      registrationsByLeague: new Map([["L1", ["a", "v", "p"]]]),
    });
    expect(res.memberIds).toEqual(["a"]);
  });
});
