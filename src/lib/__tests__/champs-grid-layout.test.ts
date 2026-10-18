import { describe, it, expect } from "vitest";
import { champsGridLayout } from "../booking-grid";

const normal = ["17:15", "18:00", "18:45", "19:30", "20:15", "21:00"];
const spans = [{ court_id: 27, start_time: "18:00", end_time: "19:30" }, { court_id: 27, start_time: "20:15", end_time: "21:00" }];

describe("champsGridLayout", () => {
  const g = champsGridLayout(normal, 45, spans, 35);
  it("reserved court uses 35-minute slots inside the evening", () => {
    expect(["18:00", "18:35", "19:10", "19:45", "20:20"].map((t) => g.cell(27, t))).toEqual([35, 35, 35, 35, 35]);
    expect(g.cell(27, "18:45")).toBeNull();
    expect(g.cell(27, "21:00")).toBe(45);
    expect(g.cell(27, "17:15")).toBe(45);
  });
  it("other courts keep 45-minute slots", () => {
    expect(g.cell(28, "18:45")).toBe(45);
    expect(g.cell(28, "18:35")).toBeNull();
  });
  it("rows are the union in time order", () => {
    expect(g.rows).toEqual(["17:15", "18:00", "18:35", "18:45", "19:10", "19:30", "19:45", "20:15", "20:20", "21:00"]);
  });
});
