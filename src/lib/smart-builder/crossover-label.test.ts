import { describe, it, expect } from "vitest";
import { crossoverLabel } from "./playoff-chain";
describe("stage-specific crossover wording", () => {
  it("quarterfinal uses 8-qualifier crossover", () => expect(crossoverLabel("Quarterfinal")).toBe("Pool crossover: A1 vs B4, B2 vs A3, B1 vs A4, A2 vs B3"));
  it("semifinal uses 4-qualifier crossover", () => expect(crossoverLabel("Semifinal")).toBe("Pool crossover: A1 vs B2, B1 vs A2"));
});
