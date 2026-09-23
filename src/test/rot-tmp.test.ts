import { describe, it, expect } from "vitest";
import { generateRotatingDoublesSchedule } from "@/lib/tournaments/rotating-doubles";
describe("rotation variety", () => {
  it("spreads partners", () => {
    const ps = Array.from({length:12},(_,i)=>`p${i}`);
    const s = generateRotatingDoublesSchedule(ps,{maxMatchesPerPlayer:9});
    const counts = new Map<string,number>();
    for (const g of s.games) for (const side of [g.sideA,g.sideB]) {
      const k = [...side].sort().join("|");
      counts.set(k,(counts.get(k)||0)+1);
    }
    const max = Math.max(...counts.values());
    console.log("games",s.games.length,"distinct pairs",counts.size,"max repeat",max);
    expect(max).toBeLessThanOrEqual(2);
  });
});
