import { describe, it, expect } from "vitest";
import { kitFormFrom, kitOptionsFrom } from "./kit-editor";

const nsc = { back_name: true, note: "Logo front", fits: [{ key: "mens", label: "Men's", sizes: ["S", "M"], chart: [["S", 1, 2, 3, 4], ["M", 5, 6, 7, 8]] }] };

describe("Club Kit editor", () => {
  it("keeps the fit key and size chart when an existing item is re-saved", () => {
    const out = kitOptionsFrom(kitFormFrom(nsc))!;
    expect(out.fits[0].key).toBe("mens");
    expect(out.fits[0].chart).toEqual(nsc.fits[0].chart);
  });
  it("turns comma-separated sizes into a size list", () => {
    const out = kitOptionsFrom({ kit_on: true, kit_note: "", kit_back_name: true, kit_raw: null, kit_fits: [{ key: "", label: "Kids", sizes: "6, 8 ,10" }] })!;
    expect(out.fits[0]).toMatchObject({ key: "kids", sizes: ["6", "8", "10"] });
  });
});
