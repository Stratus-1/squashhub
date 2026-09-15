import { describe, expect, it } from "vitest";
import { restoreDraftPlayerIds } from "@/lib/tournaments/draft-payload";

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
});