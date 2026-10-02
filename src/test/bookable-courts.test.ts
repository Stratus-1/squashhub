import { describe, it, expect } from "vitest";
import { bookableCourtIds, hostClubIds, venueBlocker } from "@/lib/tournaments/bookable-courts";
const RIV = "riv", CSIR = "csir", NSA = "nsa-tenant";
const courts = [
  { id: 20, club_id: RIV }, { id: 21, club_id: RIV }, { id: 24, club_id: RIV }, { id: 26, club_id: RIV },
  { id: 99, club_id: RIV, is_external: true }, { id: 98, club_id: RIV, active: false }, { id: 5, club_id: CSIR },
];
describe("tournament bookable courts", () => {
  it("Riverside club event with no selected courts offers all normal Riverside courts", () => {
    expect(bookableCourtIds({ kind: "club", ownerClubId: RIV, venues: [{ club_id: RIV, court_ids: [] }], courts })).toEqual([20, 21, 24, 26]);
  });
  it("never uses the admin's own club", () => {
    expect(bookableCourtIds({ kind: "club", ownerClubId: RIV, venues: [], courts })).not.toContain(5);
  });
  it("explicit venue courts restrict", () => {
    expect(bookableCourtIds({ kind: "club", ownerClubId: RIV, venues: [{ club_id: RIV, court_ids: [21] }], courts })).toEqual([21]);
  });
  it("regional event: owner tenant is not a venue; blocked until a host is chosen", () => {
    const i = { kind: "regional" as const, ownerClubId: NSA, venues: [{ club_id: NSA, court_ids: [] }], courts };
    expect(hostClubIds(i)).toEqual([]);
    expect(bookableCourtIds(i)).toEqual([]);
    expect(venueBlocker("regional", [])).toMatch(/host club/);
    const hosted = { ...i, venues: [...i.venues, { club_id: RIV, court_ids: [] }] };
    expect(bookableCourtIds(hosted)).toEqual([20, 21, 24, 26]);
    expect(venueBlocker("regional", [RIV])).toBeNull();
  });
  it("stage overrides win: explicit playoff courts are preserved, or another venue", () => {
    const base = { kind: "club" as const, ownerClubId: RIV, venues: [{ club_id: RIV, court_ids: [] }], courts };
    expect(bookableCourtIds({ ...base, override: { court_ids: [24] } })).toEqual([24]);
    expect(bookableCourtIds({ ...base, override: { venue_club_id: CSIR } })).toEqual([5]);
  });
});
