import { describe, it, expect } from "vitest";
import { assertDivisionCountLocked } from "@/lib/smart-builder/step-handover";

describe("category count lock after draw", () => {
  it("blocks 8 → 7 categories once games exist", () => expect(assertDivisionCountLocked(8, 7, 69)).toBe(true));
  it("allows same count with games", () => expect(assertDivisionCountLocked(8, 8, 69)).toBe(false));
  it("allows changes before any games", () => expect(assertDivisionCountLocked(8, 7, 0)).toBe(false));
});
