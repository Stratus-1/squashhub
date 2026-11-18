import { describe, it, expect } from "vitest";
import { directBarStatementLines } from "@/lib/finance/direct-bar-lines";

const p = (id: string, total: number, method: string, group: string | null, at = "2026-11-17T18:00:00Z") =>
  ({ id, created_at: at, item_name: "Beer", quantity: 1, total, method, payment_group: group });

describe("card/cash bar purchases on statements", () => {
  it("shows each card item as a debit and one card payment credit per tab, netting to zero", () => {
    const lines = directBarStatementLines([
      p("a", 28, "card", "tab1"),
      p("b", 22, "card", "tab1", "2026-11-17T18:05:00Z"),
    ]);
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBe(50);
    expect(credit).toBe(50);
    expect(lines.filter((l) => l.credit > 0)).toHaveLength(1);
    expect(lines.find((l) => l.credit > 0)?.description).toBe("Card payment (2 items)");
  });

  it("leaves out member-account and unpaid open-tab items", () => {
    const lines = directBarStatementLines([p("a", 311, "account", "t"), p("b", 48, "unpaid", "t2")]);
    expect(lines).toHaveLength(0);
  });
});
