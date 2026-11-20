import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/supabase-ext", () => ({ fromExt: () => ({}) }));
vi.mock("@/lib/comms/send", () => ({ sendComms: vi.fn(), dispatchCampaign: vi.fn() }));
import { entryPartners, entryCategoryName } from "../step-handover";

const names = new Map([["riaan", "Riaan"], ["aj", "AJ Barnard"], ["lisa", "Lisa"], ["zelda", "Zelda"]]);
const labels: Record<string, string> = { "1": "Mens · Doubles", "2": "Ladies 2 · Doubles", "3": "Mixed 2 · Doubles" };
const renames = { "Mixed 2": "Mixed", "Ladies 2": "Ladies" };
const cat = (g: number | null) => (g == null ? null : entryCategoryName(labels[String(g)], renames));

describe("entries list partners", () => {
  it("shows a player's partner in every category from the pairing board", () => {
    const pairs = [
      { member_a: "riaan", member_b: "aj", group_number: 1, status: "confirmed" },
      { member_a: "riaan", member_b: "lisa", group_number: 3, status: "confirmed" },
    ];
    expect(entryPartners("riaan", pairs, null, names, cat)).toEqual([
      { name: "AJ Barnard", category: "Mens", confirmed: true },
      { name: "Lisa", category: "Mixed", confirmed: true },
    ]);
  });
  it("marks a pair still waiting on payment and skips cancelled pairs", () => {
    const pairs = [
      { member_a: "lisa", member_b: "zelda", group_number: 2, status: "awaiting_payment" },
      { member_a: "lisa", member_b: "aj", group_number: 1, status: "cancelled" },
    ];
    expect(entryPartners("lisa", pairs, null, names, cat)).toEqual([{ name: "Zelda", category: "Ladies", confirmed: false }]);
  });
  it("falls back to the registration partner when no pair row names them", () => {
    expect(entryPartners("riaan", [], "aj", names, cat)).toEqual([{ name: "AJ Barnard", category: null, confirmed: true }]);
  });
});
