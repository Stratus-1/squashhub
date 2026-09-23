import { describe, expect, it } from "vitest";
import { restoreDraftPlayerIds, sortTournamentPlayers } from "@/lib/tournaments/draft-payload";

describe("tournament draft player roster", () => {
  it("restores checked players before divisions are allocated", () => {
    expect(restoreDraftPlayerIds([], ["altu", "theo", "willem"], [])).toEqual([
      "altu",
      "theo",
      "willem",
    ]);
  });

  it("always merges accepted registrations into a saved roster", () => {
    expect(restoreDraftPlayerIds([], [], ["late-signup"])).toEqual(["late-signup"]);
    expect(restoreDraftPlayerIds([], ["altu"], ["altu", "late-signup"])).toEqual([
      "altu",
      "late-signup",
    ]);
  });

  it("keeps final allocated entries authoritative", () => {
    expect(restoreDraftPlayerIds(["allocated"], ["draft"], ["registered"])).toEqual(["allocated"]);
  });

  it("falls back to participating registrations for older tournaments", () => {
    expect(restoreDraftPlayerIds([], null, ["registered", "registered"])).toEqual(["registered"]);
  });

  it("lists selected participants first, then unselected members alphabetically", () => {
    const players = [
      { id: "zoe", name: "Zoe" }, { id: "dave", name: "Dave" },
      { id: "ana", name: "Ana" }, { id: "ben", name: "Ben" },
    ];
    const { participants, otherMembers } = sortTournamentPlayers(players, new Set(["zoe", "ana"]));
    expect(participants.map((p) => p.id)).toEqual(["ana", "zoe"]);
    expect(otherMembers.map((p) => p.id)).toEqual(["ben", "dave"]);
  });
});