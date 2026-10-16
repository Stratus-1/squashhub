// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CategorySeedingButtons, PoolPlacementButtons } from "@/components/club-admin/CategorySeedingButtons";

describe("CategorySeedingButtons", () => {
  it("renders all seeding choices as one row of buttons", () => {
    const html = renderToStaticMarkup(<CategorySeedingButtons label="Category 1 seeding" value="ladder" onChange={() => {}} />);
    for (const label of ["Rankings", "Club ladder", "Manual seeds", "Random", "No seeding", "Decide later"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("Previous stage rankings");
  });

  it("adds the previous-stage option for follow-up stages", () => {
    const html = renderToStaticMarkup(<CategorySeedingButtons label="Category 1 follow-up seeding" value="previous_stage" onChange={() => {}} previousStage />);
    expect(html).toContain("Previous stage rankings");
  });
});

describe("PoolPlacementButtons", () => {
  it("explains snake as 1, 2 then 3 back, 4", () => {
    const html = renderToStaticMarkup(<PoolPlacementButtons label="Placement" value="snake" onChange={() => {}} />);
    expect(html).toContain("Snake");
    expect(html).toContain("3 back, 4");
    expect(html).toContain("equally strong");
  });

  it("explains strength band as 1-4 in Pool A, 5-8 in Pool B", () => {
    const html = renderToStaticMarkup(<PoolPlacementButtons label="Placement" value="banded" onChange={() => {}} />);
    expect(html).toContain("Strength band");
    expect(html).toContain("1, 2, 3, 4");
    expect(html).toContain("5, 6, 7, 8");
  });
});
