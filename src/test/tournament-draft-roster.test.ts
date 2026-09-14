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

  it("treats an intentionally empty saved roster as authoritative", () => {
    expect(restoreDraftPlayerIds([], [], ["old-registration"])).toEqual([]);
  });

  it("keeps final allocated entries authoritative", () => {
    expect(restoreDraftPlayerIds(["allocated"], ["draft"], ["registered"])).toEqual(["allocated"]);
  });

  it("falls back to participating registrations for older tournaments", () => {
    expect(restoreDraftPlayerIds([], null, ["registered", "registered"])).toEqual(["registered"]);
  });
});