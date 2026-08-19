import { describe, it, expect } from "vitest";
import { clubHasCapability } from "../../supabase/functions/_shared/capabilities";

function fakeAdmin(rows: Array<{ capability: string; enabled: boolean }> | null, error = false) {
  return {
    from() {
      return {
        select() {
          return {
            eq: async () => ({ data: rows, error: error ? { message: "boom" } : null }),
          };
        },
      };
    },
  };
}

describe("edge clubHasCapability", () => {
  it("fails open when the club has no capability rows (legacy tenant)", async () => {
    expect(await clubHasCapability(fakeAdmin([]), "club-1", "wifi")).toBe(true);
  });

  it("fails open on read errors", async () => {
    expect(await clubHasCapability(fakeAdmin(null, true), "club-1", "whatsapp")).toBe(true);
  });

  it("returns the stored value when rows exist", async () => {
    const rows = [
      { capability: "wifi", enabled: false },
      { capability: "bookings", enabled: true },
    ];
    expect(await clubHasCapability(fakeAdmin(rows), "club-1", "wifi")).toBe(false);
    expect(await clubHasCapability(fakeAdmin(rows), "club-1", "bookings")).toBe(true);
  });

  it("treats a missing capability row as disabled once the club is migrated", async () => {
    const rows = [{ capability: "bookings", enabled: true }];
    expect(await clubHasCapability(fakeAdmin(rows), "club-1", "whatsapp")).toBe(false);
  });

  it("returns false without a club id", async () => {
    expect(await clubHasCapability(fakeAdmin([]), "", "wifi")).toBe(false);
  });
});
