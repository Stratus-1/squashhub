import { describe, it, expect } from "vitest";
import { deriveVenueRows, hostFeeCents, venueClubForCourt } from "@/lib/tournaments/venues";
import { resolveEligibleClubs, orgDescendants } from "@/lib/tournaments/eligibility";

const NSA_PCC = "pcc";
const UITSIG = "uitsig";

const courts = [
  { id: 1, club_id: NSA_PCC },
  { id: 2, club_id: NSA_PCC },
  { id: 3, club_id: UITSIG },
  { id: 4, club_id: UITSIG },
  { id: 5, club_id: UITSIG },
  { id: 6, club_id: UITSIG },
];

describe("tournament venues", () => {
  it("limits NSA regional clubs to the Federation tree, excluding a legacy Durbanville affiliation", () => {
    const orgs = [
      { id: "nsa", kind: "association", name: "NSA", club_id: null },
      { id: "csir-org", kind: "club", name: "CSIR", club_id: "csir" },
      { id: "durbanville-org", kind: "club", name: "Durbanville", club_id: "durbanville" },
    ];
    const rels = [{ parent_org_id: "nsa", child_org_id: "csir-org" }];
    const descendants = orgDescendants("nsa", rels);
    expect(orgs.filter((org) => org.kind === "club" && descendants.has(org.id)).map((org) => org.club_id)).toEqual(["csir"]);
    expect(resolveEligibleClubs({ scope: "association", clubId: "nsa-tenant", ownerOrgId: "nsa", orgs, rels }).clubIds).toEqual(["csir"]);
  });

  it("single host club keeps one primary venue with its own courts", () => {
    const rows = deriveVenueRows({
      primaryClubId: NSA_PCC,
      venueClubIds: [NSA_PCC],
      selectedCourtIds: [1, 2],
      courts,
    });
    expect(rows).toEqual([{ club_id: NSA_PCC, court_ids: [1, 2], is_primary: true }]);
  });

  it("splits courts per host club for a two-venue regional event", () => {
    const rows = deriveVenueRows({
      primaryClubId: NSA_PCC,
      venueClubIds: [NSA_PCC, UITSIG],
      selectedCourtIds: [1, 2, 3, 4, 5, 6],
      courts,
    });
    const pcc = rows.find((r) => r.club_id === NSA_PCC)!;
    const uitsig = rows.find((r) => r.club_id === UITSIG)!;
    expect(pcc.court_ids).toEqual([1, 2]);
    expect(pcc.is_primary).toBe(true);
    expect(uitsig.court_ids).toEqual([3, 4, 5, 6]);
    expect(uitsig.is_primary).toBe(false);
  });

  it("keeps the primary row even when it provides no courts", () => {
    const rows = deriveVenueRows({
      primaryClubId: "nsa",
      venueClubIds: ["nsa", UITSIG],
      selectedCourtIds: [3, 4],
      courts,
    });
    expect(rows.find((r) => r.club_id === "nsa")).toEqual({ club_id: "nsa", court_ids: [], is_primary: true });
  });

  it("never puts another club's court under the wrong venue", () => {
    const rows = deriveVenueRows({
      primaryClubId: NSA_PCC,
      venueClubIds: [NSA_PCC, UITSIG],
      selectedCourtIds: [1, 5],
      courts,
    });
    expect(rows.find((r) => r.club_id === NSA_PCC)!.court_ids).toEqual([1]);
    expect(rows.find((r) => r.club_id === UITSIG)!.court_ids).toEqual([5]);
  });

  it("computes hosting cost by basis", () => {
    expect(hostFeeCents({ host_fee_cents: 50000, host_fee_basis: "fixed", host_fee_qty: 9 })).toBe(50000);
    expect(hostFeeCents({ host_fee_cents: 5000, host_fee_basis: "per_court_hour", host_fee_qty: 12 })).toBe(60000);
    expect(hostFeeCents({ host_fee_cents: 25000, host_fee_basis: "per_day", host_fee_qty: 2 })).toBe(50000);
    expect(hostFeeCents({ host_fee_cents: null as any })).toBe(0);
  });

  it("resolves the venue club a fixture's court belongs to", () => {
    expect(venueClubForCourt(4, courts, NSA_PCC)).toBe(UITSIG);
    expect(venueClubForCourt(null, courts, NSA_PCC)).toBe(NSA_PCC);
  });
});
