import { describe, it, expect } from "vitest";
import { fieldReviewMode } from "@/lib/smart-builder/field-review-mode";
describe("field review panel mode", () => {
  it("pre-draw: prominent planning guidance", () => expect(fieldReviewMode(false, 2)).toBe("prominent"));
  it("post-draw: collapsed reference link", () => expect(fieldReviewMode(true, 2)).toBe("collapsed"));
  it("nothing to review: hidden either way", () => { expect(fieldReviewMode(false, 0)).toBe("none"); expect(fieldReviewMode(true, 0)).toBe("none"); });
});
