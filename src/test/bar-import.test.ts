import { describe, it, expect } from "vitest";
import { autoMap, parseCsv, planImport, TEMPLATE_CSV } from "@/lib/bar-import";
import { BAR_DIVISIONS } from "@/lib/bar-categories";

const ctx = (existing: any[] = []) => ({ existing, divisions: BAR_DIVISIONS, customCategories: [] });
const run = (csv: string, existing: any[] = []) => {
  const t = parseCsv(csv);
  return planImport(t.slice(1), autoMap(t[0]), ctx(existing));
};

describe("bar item import", () => {
  it("parses quoted CSV and semicolons", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("plans the template: units, spirits in tots, bulk mixer in ml", () => {
    const p = run(TEMPLATE_CSV);
    expect(p.every(r => r.errors.length === 0)).toBe(true);
    const klip = p.find(r => r.name === "Klipdrift")!;
    expect(klip.type).toBe("bottle"); expect(klip.stockUnits).toBe(75); expect(klip.singlePrice).toBe(20);
    const coke = p.find(r => r.name === "Coke (bulk)")!;
    expect(coke.type).toBe("litre"); expect(coke.stockUnits).toBe(5500); expect(coke.servingMl).toBe(250);
    expect(p.find(r => r.name === "Castle Lite")!.stockUnits).toBe(48);
  });

  it("28 tots per bottle: 2.5 bottles = 70 tots", () => {
    const p = run("Item name,Stock type,Tots per bottle,Opening stock,Single price\nJameson,bottle,28,2.5,25");
    expect(p[0].stockUnits).toBe(70);
  });

  it("rejects specials, bad numbers, missing names and in-file duplicates", () => {
    const p = run("Item name,Stock type,Selling price\nCombo,special,50\nCoke,unit,abc\n,unit,10\nFanta,unit,15\nfanta,unit,15");
    expect(p[0].errors.join()).toMatch(/Specials/);
    expect(p[1].errors.join()).toMatch(/not a number/);
    expect(p[2].errors.join()).toMatch(/missing/);
    expect(p[4].errors.join()).toMatch(/Duplicate/);
    expect(p.filter(r => r.errors.length).every(r => r.action === "skip")).toBe(true);
  });

  it("matches existing club items and never changes their stock", () => {
    const p = run("Item name,Selling price,Opening stock\ncastle  lite,32,10", [{ id: "x", name: "Castle Lite", item_kind: "stock", unit_yield: 1 }]);
    expect(p[0].action).toBe("update"); expect(p[0].matchId).toBe("x"); expect(p[0].stockUnits).toBeNull();
  });

  it("ignores archived items and refuses to overwrite specials", () => {
    expect(run("Item name,Selling price\nOld,5", [{ id: "a", name: "Old", archived_at: "2026-01-01" }])[0].action).toBe("create");
    expect(run("Item name,Selling price\nFriday,5", [{ id: "s", name: "Friday", item_kind: "special" }])[0].errors.length).toBe(1);
  });

  it("flags unknown divisions and proposes new categories", () => {
    const p = run("Item name,Division,Category,Selling price\nBall,Pro Shop,Balls,40\nBag,Shop,Bags,400");
    expect(p[0].errors.join()).toMatch(/Division/);
    expect(p[1].newCategory?.label).toBe("Bags");
  });
});
