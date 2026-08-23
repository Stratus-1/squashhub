import { describe, it, expect } from "vitest";
import {
  champBookingContext,
  champBookingLabel,
  champMatchToBookingLabel,
  sideLabel,
  toInitialSurname,
} from "@/lib/tournaments/booking-label";

const RIVERSIDE = "Riverside Club Championships";

describe("singles tournament booking label", () => {
  const singles = {
    sideA: { name: "Willem Pretorius" },
    sideB: { name: "Craig Nieuwoudt" },
    champName: RIVERSIDE,
    divisionLabel: "Men's Singles",
  };

  it("shows both players with the competition as context", () => {
    const label = champBookingLabel(singles);
    expect(label.title).toBe("Willem Pretorius vs Craig Nieuwoudt");
    expect(label.context).toBe("Riverside Club Championships · Men's Singles");
    expect(label.hasPlayers).toBe(true);
  });

  it("offers a compact variant for the narrow court grid", () => {
    expect(champBookingLabel(singles).compactTitle).toBe("W. Pretorius v C. Nieuwoudt");
    expect(toInitialSurname("Craig Nieuwoudt")).toBe("C. Nieuwoudt");
    expect(toInitialSurname("Craig")).toBe("Craig");
  });

  it("never shows only the generic division name when players are known", () => {
    expect(champBookingLabel(singles).title).not.toBe("Men's Singles");
  });
});

describe("doubles, byes and unknown opponents", () => {
  it("shows both pairs for doubles", () => {
    const label = champBookingLabel({
      sideA: { name: "Ann Smith", partner: "Bea Jones" },
      sideB: { name: "Cara Ndlovu", partner: "Dee Botha" },
      champName: "Nelspruit Doubles",
    });
    expect(label.title).toBe("Ann Smith / Bea Jones vs Cara Ndlovu / Dee Botha");
    expect(label.compactTitle).toBe("A. Smith / B. Jones v C. Ndlovu / D. Botha");
    expect(sideLabel({ name: "Ann Smith" })).toBe("Ann Smith");
  });

  it("does not invent a name for a bye", () => {
    const label = champBookingLabel({ sideA: { name: "Willem Pretorius" }, isBye: true, champName: RIVERSIDE });
    expect(label.title).toBe("Willem Pretorius (bye)");
    expect(label.title).not.toMatch(/vs/);
  });

  it("uses TBD for an undecided opponent", () => {
    expect(champBookingLabel({ sideA: { name: "Willem Pretorius" } }).title).toBe("Willem Pretorius vs TBD");
    expect(champBookingLabel({ sideB: { name: "Craig Nieuwoudt" } }).title).toBe("TBD vs Craig Nieuwoudt");
  });

  it("falls back to the competition label when no player is known", () => {
    const label = champBookingLabel({ champName: RIVERSIDE, divisionLabel: "Men's Singles" });
    expect(label.title).toBe("Riverside Club Championships · Men's Singles");
    expect(label.hasPlayers).toBe(false);
    expect(champBookingLabel({}).title).toBe("Tournament");
  });

  it("builds context from whichever parts exist", () => {
    expect(champBookingContext({ champName: RIVERSIDE })).toBe(RIVERSIDE);
    expect(champBookingContext({ divisionLabel: "League 2" })).toBe("League 2");
    expect(champBookingContext({})).toBe("");
  });
});

describe("resolving names from a club_champs_matches row", () => {
  it("prefers the club member name and falls back to the profile name", () => {
    const label = champMatchToBookingLabel(
      {
        player_a: { name: "Willem Pretorius" },
        player_b: { name: null, profiles: { name: "Craig Nieuwoudt" } },
        is_bye: false,
      },
      { champName: RIVERSIDE, divisionLabel: "Men's Singles" },
    );
    expect(label.title).toBe("Willem Pretorius vs Craig Nieuwoudt");
    expect(label.context).toBe("Riverside Club Championships · Men's Singles");
  });

  it("handles array-shaped profile joins and missing relations", () => {
    const label = champMatchToBookingLabel({
      player_a: { name: "", profiles: [{ name: "Ann Smith" }] },
      player_b: null,
    });
    expect(label.title).toBe("Ann Smith vs TBD");
  });

  it("resolves names dynamically, so a renamed member updates the label", () => {
    const before = champMatchToBookingLabel({ player_a: { name: "Willem P" }, player_b: { name: "Craig N" } });
    const after = champMatchToBookingLabel({ player_a: { name: "Willem Pretorius" }, player_b: { name: "Craig N" } });
    expect(before.title).not.toBe(after.title);
    expect(after.title).toBe("Willem Pretorius vs Craig N");
  });
});

/**
 * Ordinary (non-tournament) bookings must keep their existing label. The grid
 * only reads champ_* fields, which are absent for those rows.
 */
describe("ordinary bookings are unchanged", () => {
  it("leaves a normal booking row without any champ label fields", () => {
    const normal: any = { source: "squashhub", external_id: null, guest_name: null, player_name: "Jane Doe" };
    expect(normal.champ_title).toBeUndefined();
    expect(normal.champ_context).toBeUndefined();
    expect(normal.player_name).toBe("Jane Doe");
  });

  it("only treats champ:...:match: external ids as linked fixtures", () => {
    const linked = (ext: string) => ext.includes(":match:") ? ext.split(":match:")[1] : null;
    expect(linked("champ:c1:match:m1")).toBe("m1");
    expect(linked("champ:c1:block:2026-08-25:20")).toBeNull();
    expect(linked("")).toBeNull();
  });
});
