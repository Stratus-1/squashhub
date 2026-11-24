import { describe, it, expect } from "vitest";
import {
  allClubIds,
  associationTickState,
  buildScopeTree,
  scopeSelectionSummary,
  toggleAssociation,
  toggleClub,
} from "@/lib/tournaments/invite-scope-tree";
import {
  audienceLabel,
  audienceModesForScope,
  eligibilityScopeLabel,
  resolveInviteAudience,
} from "@/lib/tournaments/invite-audience";

const rows = [
  {
    association_id: "a1",
    association_name: "Northern Squash",
    club_id: "c1",
    club_name: "Riverside",
    is_own_club: true,
    member_count: 40,
    registered_count: 5,
  },
  {
    association_id: "a1",
    association_name: "Northern Squash",
    club_id: "c2",
    club_name: "CSIR",
    is_own_club: false,
    member_count: 12,
    registered_count: 0,
  },
  {
    association_id: "a2",
    association_name: "Lowveld Squash",
    club_id: "c3",
    club_name: "White River",
    is_own_club: false,
    member_count: 7,
    registered_count: 1,
  },
];

describe("scope tree", () => {
  it("groups clubs under their association with the organiser's association first", () => {
    const tree = buildScopeTree(rows as any);
    expect(tree.map((g) => g.associationName)).toEqual(["Northern Squash", "Lowveld Squash"]);
    expect(tree[0].clubs.map((c) => c.clubName)).toEqual(["Riverside", "CSIR"]);
    expect(tree[0].memberCount).toBe(52);
  });

  it("puts clubs with no association into an 'Unaffiliated clubs' branch", () => {
    const tree = buildScopeTree([{ club_id: "x", club_name: "Loner", member_count: 3 }] as any);
    expect(tree[0].associationName).toBe("Unaffiliated clubs");
    expect(tree[0].associationId).toBeNull();
  });

  it("reports tri-state ticks for a partially selected association", () => {
    const tree = buildScopeTree(rows as any);
    expect(associationTickState(tree[0], new Set())).toBe("none");
    expect(associationTickState(tree[0], new Set(["c1"]))).toBe("some");
    expect(associationTickState(tree[0], new Set(["c1", "c2"]))).toBe("all");
  });

  it("ticking an association selects all its clubs, ticking again clears them", () => {
    const tree = buildScopeTree(rows as any);
    const on = toggleAssociation(tree[0], []);
    expect(on.sort()).toEqual(["c1", "c2"]);
    expect(toggleAssociation(tree[0], on)).toEqual([]);
  });

  it("never touches other associations when one is toggled", () => {
    const tree = buildScopeTree(rows as any);
    const next = toggleAssociation(tree[0], ["c3"]);
    expect(next).toContain("c3");
  });

  it("toggles a single club and lists every club id", () => {
    const tree = buildScopeTree(rows as any);
    expect(toggleClub("c3", ["c1"]).sort()).toEqual(["c1", "c3"]);
    expect(toggleClub("c1", ["c1"])).toEqual([]);
    expect(allClubIds(tree).sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("summarises the selection with counts only", () => {
    const tree = buildScopeTree(rows as any);
    expect(scopeSelectionSummary(tree, new Set())).toMatch(/no clubs or members selected/i);
    const s = scopeSelectionSummary(tree, new Set(["c1", "c3"]));
    expect(s).toContain("2 clubs");
    expect(s).toContain("47 members");
    expect(s).toContain("6 already registered");
  });
});

describe("scope-aware audience options", () => {
  it("uses participation wording for each scope", () => {
    expect(eligibilityScopeLabel("club")).toBe("Club members");
    expect(eligibilityScopeLabel("association")).toBe("Regional league");
    expect(eligibilityScopeLabel("open")).toBe("National & international");
  });

  it("offers a club tree only when the scope reaches beyond the host club", () => {
    expect(audienceModesForScope("club")).not.toContain("clubs");
    expect(audienceModesForScope("association")).toContain("clubs");
    expect(audienceModesForScope("open")).toContain("clubs");
  });

  it("labels 'everyone' according to the scope", () => {
    expect(audienceLabel("all_club", "club")).toMatch(/all members of the club/i);
    expect(audienceLabel("all_club", "association")).toMatch(/regional league/i);
    expect(audienceLabel("all_club", "open")).toMatch(/federation/i);
    expect(audienceLabel("clubs", "open")).toMatch(/associations \/ clubs/i);
  });
});

describe("clubs audience resolution", () => {
  const byClub = new Map<string, string[]>([
    ["c1", ["m1", "m2"]],
    ["c2", ["m3"]],
    ["c3", ["m4"]],
  ]);

  it("invites every server-vetted member of the ticked clubs", () => {
    const res = resolveInviteAudience({
      mode: "clubs",
      members: [],
      clubIds: ["c1", "c2"],
      memberIdsByClub: byClub,
    });
    expect(res.memberIds.sort()).toEqual(["m1", "m2", "m3"]);
    expect(res.summary).toContain("2 selected clubs");
  });

  it("honours organiser exclusions and de-duplicates across clubs", () => {
    const res = resolveInviteAudience({
      mode: "clubs",
      members: [],
      clubIds: ["c1", "c1", "c2"],
      memberIdsByClub: byClub,
      excludedIds: ["m2"],
    });
    expect(res.memberIds.sort()).toEqual(["m1", "m3"]);
  });

  it("still drops a host-club member the local roster marks as a visitor", () => {
    const res = resolveInviteAudience({
      mode: "clubs",
      members: [
        { id: "m1", status: "active", role: "member" },
        { id: "m2", status: "active", role: "visitor" },
      ],
      clubIds: ["c1"],
      memberIdsByClub: byClub,
    });
    expect(res.memberIds).toEqual(["m1"]);
  });

  it("resolves nothing when no club is ticked", () => {
    const res = resolveInviteAudience({ mode: "clubs", members: [], clubIds: [], memberIdsByClub: byClub });
    expect(res.memberIds).toEqual([]);
  });

  it("includes individually picked members even when their club is not fully selected", () => {
    const res = resolveInviteAudience({
      mode: "clubs",
      members: [],
      clubIds: ["c1"],
      memberIdsByClub: byClub,
      individualIds: ["m4"],
    });
    expect(res.memberIds.sort()).toEqual(["m1", "m2", "m4"]);
    expect(res.summary).toContain("plus 1 individually picked");
  });
});

// A junior body's invite tree is grouped by district (the zone/provincial it is grouped
// under), so the organiser picks districts instead of hunting through every club.
describe("district audience selection for junior bodies", () => {
  const districtRows = [
    { association_id: "mp", association_name: "Mpumalanga Junior Squash", club_id: "sec", club_name: "Secunda", is_own_club: false, member_count: 4, registered_count: 0, email_count: 4, has_members: true },
    { association_id: "mp", association_name: "Mpumalanga Junior Squash", club_id: "nel", club_name: "Nelspruit", is_own_club: false, member_count: 6, registered_count: 1, email_count: 6, has_members: true },
    { association_id: "nw", association_name: "North West Junior Squash", club_id: "pot", club_name: "Potchefstroom Boys High", is_own_club: false, member_count: 3, registered_count: 0, email_count: 3, has_members: true },
    { association_id: "lp", association_name: "Limpopo Junior Squash", club_id: "pol", club_name: "Polokwane Squash Club", is_own_club: false, member_count: 2, registered_count: 0, email_count: 2, has_members: true },
  ];
  const tree = buildScopeTree(districtRows as any);

  it("offers every district as its own pickable group", () => {
    expect(tree.map((g) => g.associationName).sort()).toEqual(
      ["Limpopo Junior Squash", "Mpumalanga Junior Squash", "North West Junior Squash"],
    );
    expect(tree.flatMap((g) => g.clubs.map((c) => c.clubId)).sort()).toEqual(["nel", "pol", "pot", "sec"]);
  });

  it("ticking one district invites exactly its clubs and leaves the others out", () => {
    const mp = tree.find((g) => g.associationName === "Mpumalanga Junior Squash")!;
    const picked = toggleAssociation(mp, []);
    expect(picked.sort()).toEqual(["nel", "sec"]);
    const res = resolveInviteAudience({
      mode: "clubs",
      members: [],
      clubIds: picked,
      memberIdsByClub: new Map([["nel", ["n1", "n2"]], ["sec", ["s1"]], ["pot", ["p1"]], ["pol", ["l1"]]]),
    });
    expect(res.memberIds.sort()).toEqual(["n1", "n2", "s1"]);
    expect(res.summary).toContain("2 selected clubs");
  });

  it("keeps two districts selected at once and clears only the one toggled off", () => {
    const mp = tree.find((g) => g.associationName === "Mpumalanga Junior Squash")!;
    const nw = tree.find((g) => g.associationName === "North West Junior Squash")!;
    const both = toggleAssociation(nw, toggleAssociation(mp, []));
    expect(both.sort()).toEqual(["nel", "pot", "sec"]);
    expect(toggleAssociation(mp, both).sort()).toEqual(["pot"]);
  });
});
