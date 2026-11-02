import { describe, it, expect } from "vitest";
import { matchFeeRows } from "@/lib/finance/leagueFeeImport";
const members = [
  { id: "a", name: "Gerhard Fourie", leagueNumber: "NSF123" },
  { id: "b", name: "John Smith" }, { id: "c", name: "John Smith" },
];
describe("league fee import matching", () => {
  it("matches by NSF number first", () => {
    expect(matchFeeRows([{ "NSF No": "nsf 123", Amount: "R750" }], members)[0]).toMatchObject({ memberId: "a", amount: 750 });
  });
  it("never matches an ambiguous name", () => {
    expect(matchFeeRows([{ Name: "John Smith", Amount: 600 }], members)[0].memberId).toBeNull();
  });
});
