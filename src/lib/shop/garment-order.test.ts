import { describe, it, expect } from "vitest";
import { lineError, orderTotal, sizeCounts, type GarmentOptions } from "./garment-order";

const opts: GarmentOptions = { fits: [
  { key: "mens", label: "Men's", sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"] },
  { key: "ladies", label: "Ladies'", sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"] },
] };

describe("garment orders", () => {
  it("requires a typed back name", () => {
    expect(lineError({ fit: "mens", size: "M", back_name: "   " }, opts)).toBe("Type the name for the back");
    expect(lineError({ fit: "mens", size: "M", back_name: "J. SMITH" }, opts)).toBeNull();
  });
  it("limits the back name to 20 characters", () => {
    expect(lineError({ fit: "mens", size: "M", back_name: "A".repeat(21) }, opts)).not.toBeNull();
  });
  it("Ladies' has no XS or 5XL", () => {
    expect(lineError({ fit: "ladies", size: "XS", back_name: "Ann" }, opts)).toBe("Choose a size");
    expect(lineError({ fit: "ladies", size: "5XL", back_name: "Ann" }, opts)).toBe("Choose a size");
  });
  it("two shirts at R300 cost R600", () => {
    expect(orderTotal(2, 300)).toBe(600);
  });
  it("counts shirts per fit and size", () => {
    const rows = [{ fit: "mens", size: "L", back_name: "A", member: "a" }, { fit: "mens", size: "L", back_name: "B", member: "b" }, { fit: "ladies", size: "S", back_name: "C", member: "c" }];
    expect(sizeCounts(rows, opts)).toEqual([{ fit: "Men's", size: "L", count: 2 }, { fit: "Ladies'", size: "S", count: 1 }]);
  });
});
