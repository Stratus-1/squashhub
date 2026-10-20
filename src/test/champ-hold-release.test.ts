import { describe, expect, it } from "vitest";
import { expiredChampHold } from "../../supabase/functions/_shared/champ-hold-release";
const club = "d8397b8a-60d3-4c4b-afee-25dab218bf19";
describe("Existing championship release schedule", () => {
  it("releases at exactly noon Johannesburg, not before", () => {
    expect(expiredChampHold(club, "2026-10-20", "Club Championships", new Date("2026-10-20T09:59:59Z"))).toBe(false);
    expect(expiredChampHold(club, "2026-10-20", " Club Championships ", new Date("2026-10-20T10:00:00Z"))).toBe(true);
  });
  it("preserves the Saturday Friday-17:00 exception", () => {
    expect(expiredChampHold(club, "2026-10-24", "Club Championships", new Date("2026-10-23T14:59:59Z"))).toBe(false);
    expect(expiredChampHold(club, "2026-10-24", "Club Championships", new Date("2026-10-23T15:00:00Z"))).toBe(true);
  });
  it("preserves other clubs, named players and future holds", () => {
    const now = new Date("2026-10-20T10:34:00Z");
    expect(expiredChampHold("riverside-synthetic", "2026-10-20", "Club Championships", now)).toBe(false);
    expect(expiredChampHold(club, "2026-10-20", "Synthetic Player", now)).toBe(false);
    expect(expiredChampHold(club, "2026-10-21", "Club Championships", now)).toBe(false);
  });
});
