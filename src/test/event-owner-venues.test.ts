import { describe, it, expect } from "vitest";
import { emptyDefinition } from "@/lib/smart-builder/definition";
import { ownerChoices, ownerValid, subordinateClubIds, venuesOutsideSet, venuesValid } from "@/lib/smart-builder/venues";
import { specFromDefinition } from "@/lib/tournaments/structured-persist";

const orgs = [
  { id: "ssa", name: "Squash South Africa", kind: "national", club_id: null },
  { id: "nsa", name: "NSA", kind: "association", club_id: null },
  { id: "o-riv", name: "Riverside", kind: "club", club_id: "riv" },
  { id: "o-nel", name: "Nelspruit", kind: "club", club_id: "nel" },
  { id: "o-far", name: "Far club", kind: "club", club_id: "far" },
];
const rels = [{ parent_org_id: "ssa", child_org_id: "nsa" }, { parent_org_id: "nsa", child_org_id: "o-riv" }, { parent_org_id: "nsa", child_org_id: "o-nel" }];

describe("event owner", () => {
  it("offers only organisations of the chosen level", () => {
    expect(ownerChoices("club", orgs).map((o) => o.id)).toEqual(["o-riv", "o-nel", "o-far"]);
    expect(ownerChoices("regional", orgs).map((o) => o.id)).toEqual(["nsa"]);
    expect(ownerChoices("national", orgs).map((o) => o.id)).toEqual(["ssa"]);
  });
  it("rejects an owner of the wrong kind", () => {
    const d = emptyDefinition(); d.event = { scope: "regional", ownerId: "o-riv" } as any;
    expect(ownerValid(d, orgs)).toBe(false);
    d.event.ownerId = "nsa";
    expect(ownerValid(d, orgs)).toBe(true);
  });
  it("walks the hierarchy for venue candidates", () => {
    expect(subordinateClubIds("nsa", orgs, rels).sort()).toEqual(["nel", "riv"]);
    expect(subordinateClubIds("ssa", orgs, rels).sort()).toEqual(["nel", "riv"]);
  });
});

describe("event venues", () => {
  const withVenues = () => {
    const d = emptyDefinition();
    d.event = { scope: "regional", ownerId: "nsa", venues: { mode: "multiple", clubIds: ["riv", "nel"], names: ["Riverside", "Nelspruit"] } } as any;
    return d;
  };
  it("needs at least one venue, exactly one in single mode", () => {
    const d = emptyDefinition();
    expect(venuesValid(d)).toBe(false);
    d.event = { noVenue: true } as any;
    expect(venuesValid(d)).toBe(true);
    const m = withVenues(); expect(venuesValid(m)).toBe(true);
    m.event.venues!.mode = "single"; expect(venuesValid(m)).toBe(false);
  });
  it("scheduled venues must come from the event venue set", () => {
    const d = withVenues();
    d.scheduleDefaults = { ...d.scheduleDefaults, venueClubIds: ["riv"], venueNames: ["Riverside"] };
    expect(venuesOutsideSet(d)).toEqual([]);
    d.scheduleDefaults = { ...d.scheduleDefaults, venueClubIds: ["far"], venueNames: ["Far club"] };
    expect(venuesOutsideSet(d)[0]).toMatchObject({ venue: "Far club" });
    expect(() => specFromDefinition(d)).toThrow(/not one of the tournament's venues/);
  });
  it("owner, audience and venues travel with the saved tournament setup", () => {
    const d = withVenues(); d.event.audience = "selected_clubs";
    expect(specFromDefinition(d).scope).toMatchObject({ scope: "regional", ownerId: "nsa", audience: "selected_clubs", venues: { clubIds: ["riv", "nel"] } });
  });
});
