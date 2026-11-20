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

import { entryMoney, eventsWithoutPartner } from "../step-handover";

describe("entries list money comes from real fee rows", () => {
  const nm = new Map([["ebert", "Ebert Goosen"], ["reinhardt", "Reinhardt Falk"], ["linden", "Linden"]]);
  const ebert = { id: "r-e", club_member_id: "ebert", fee_payment_id: "f-e", division_choices: [1], covered_events: {} };
  const reinhardt = { id: "r-r", club_member_id: "reinhardt", fee_payment_id: "f-r", division_choices: [1, 3], covered_events: { "1": { by: "ebert", paid: true } } };
  const linden = { id: "r-l", club_member_id: "linden", fee_payment_id: "f-l", division_choices: [1, 3], covered_events: {} };
  const fees = [
    { id: "f-e", amount: "210.00", paid: true },
    { id: "f-r", amount: "210.00", paid: false },
    { id: "f-rc", amount: "210.00", paid: true, champ_registration_id: "r-r", champ_charge_key: "cover:r-r:1" },
    { id: "f-l", amount: "310.00", paid: false },
  ];
  const all = [ebert, reinhardt, linden];
  it("a partner-paid Mens event is shown as paid by the partner; only Mixed R210 is owed", () => {
    expect(entryMoney(reinhardt, all, fees, nm, cat, 21000, true)).toEqual({
      owesCents: 21000, coveredBy: [{ category: "Mens", name: "Ebert Goosen" }], coversFor: [], unpaidEvents: ["Mixed"],
    });
  });
  it("the payer shows who they paid for", () => {
    expect(entryMoney(ebert, all, fees, nm, cat, 21000, false).coversFor).toEqual([{ category: "Mens", name: "Reinhardt Falk" }]);
  });
  it("a two-event tiered entry owes R310, not the flat R210", () => {
    expect(entryMoney(linden, all, fees, nm, cat, 21000, true).owesCents).toBe(31000);
  });
  it("falls back to the flat fee only when fee rows can't be read", () => {
    expect(entryMoney(linden, all, null, nm, cat, 21000, true).owesCents).toBe(21000);
  });
  it("lists entered events with no partner", () => {
    const pairs = [{ member_a: "ebert", member_b: "reinhardt", group_number: 1, status: "confirmed" }];
    expect(eventsWithoutPartner("reinhardt", [1, 3], pairs, cat)).toEqual(["Mixed"]);
  });
});

import { groupDoublesEntries, type RegRow } from "../step-handover";

describe("doubles entries are listed once per pair", () => {
  const nm = new Map([["ebert", "Ebert Goosen"], ["reinhardt", "Reinhardt Falk"], ["riaan", "Riaan"], ["lisa", "Lisa"], ["jason", "Jason Maher"], ["duane", "Duane"]]);
  const live = [
    { id: "r-e", club_member_id: "ebert", division_choices: [1], covered_events: {} },
    { id: "r-r", club_member_id: "reinhardt", division_choices: [1, 3], covered_events: { "1": { by: "ebert", paid: true } } },
    { id: "r-ri", club_member_id: "riaan", division_choices: [1, 3], covered_events: {} },
    { id: "r-l", club_member_id: "lisa", division_choices: [3], covered_events: {} },
    { id: "r-d", club_member_id: "duane", division_choices: [1], covered_events: {} },
  ];
  const open = [...live, { id: "r-j", club_member_id: "jason", division_choices: [1], covered_events: {} }];
  const pairs = [
    { member_a: "reinhardt", member_b: "ebert", group_number: 1, status: "confirmed" },
    { member_a: "riaan", member_b: "lisa", group_number: 3, status: "confirmed" },
    { member_a: "duane", member_b: "jason", group_number: 1, status: "awaiting_payment" },
  ];
  const row = (memberId: string, status: string, owesCents = 0, unpaidEvents: string[] = []): RegRow =>
    ({ memberId, name: nm.get(memberId)!, partnerName: null, status, owesCents, unpaidEvents });
  const rows = [row("ebert", "paid"), row("reinhardt", "pending_payment", 10000, ["Mixed"]), row("riaan", "paid"), row("lisa", "paid"), row("duane", "paid")];
  const groups = groupDoublesEntries({ live, open, pairs, rows, names: nm, categoryOf: cat, isDoublesGroup: () => true, feeDue: true })!;
  const mens = groups.find((g) => g.category === "Mens")!;
  const mixed = groups.find((g) => g.category === "Mixed")!;

  it("shows the Ebert + Reinhardt Mens pair on one line, not once per player", () => {
    expect(mens.lines.filter((l) => l.people.some((p) => p.memberId === "ebert"))).toHaveLength(1);
    expect(mens.pairCount).toBe(2);
  });
  it("gives each player their own payment status next to their name", () => {
    const line = mens.lines.find((l) => l.people.some((p) => p.memberId === "ebert"))!;
    expect(line.people.find((p) => p.memberId === "ebert")!.text).toBe("Paid");
    expect(line.people.find((p) => p.memberId === "reinhardt")!.text).toBe("Paid by Ebert Goosen");
  });
  it("lists Reinhardt alone in Mixed with no partner and R100 outstanding", () => {
    const line = mixed.lines.find((l) => l.people[0].memberId === "reinhardt")!;
    expect(line.people).toHaveLength(1);
    expect(line.needsPartner).toBe(true);
    expect(line.people[0].text).toBe("Payment outstanding · R100");
  });
  it("shows an invited partner who has not entered or paid", () => {
    const line = mens.lines.find((l) => l.people.some((p) => p.memberId === "duane"))!;
    expect(line.people.find((p) => p.memberId === "jason")!.text).toBe("Not entered yet · not paid");
    expect(line.pair).toBe("awaiting");
  });
  it("keeps the per-player list for tournaments without doubles", () => {
    expect(groupDoublesEntries({ live: [live[0]], open: [live[0]], pairs: [], rows, names: nm, categoryOf: cat, isDoublesGroup: () => false, feeDue: true })).toBeNull();
  });
});

import { entryPaidByOthers } from "../step-handover";

describe("paid by another person", () => {
  const nm = new Map([["ebert", "Ebert Goosen"], ["jan", "Jan Goosen"], ["reinhardt", "Reinhardt Falk"]]);
  // The R420 was Jan's money on the shared Goosen login: covered_events still says Ebert, the cover fee row says Jan.
  const reinhardt = { id: "r-r", club_member_id: "reinhardt", fee_payment_id: "f-r", division_choices: [1, 3], covered_events: { "1": { by: "ebert", paid: true } } };
  const jan = { id: "r-j", club_member_id: "jan", fee_payment_id: "f-j", division_choices: [1, 3], covered_events: { "1": { by: "ebert", paid: true } } };
  const fees = [
    { id: "f-rc", amount: "210", paid: true, champ_registration_id: "r-r", champ_charge_key: "cover:r-r:1", paid_by_member_id: "jan" },
    { id: "f-jc", amount: "210", paid: true, champ_registration_id: "r-j", champ_charge_key: "cover:r-j:1", paid_by_member_id: "jan" },
  ];
  it("names the corrected payer from the fee row, not the old shared-login profile", () => {
    expect(entryPaidByOthers(reinhardt, fees)).toEqual([{ group: 1, payerId: "jan" }]);
    expect(entryMoney(reinhardt, [reinhardt, jan], fees, nm, cat, 21000, false).coveredBy).toEqual([{ category: "Mens", name: "Jan Goosen" }]);
  });
  it("never says 'paid by' when the player paid their own entry", () => {
    expect(entryPaidByOthers(jan, fees)).toEqual([]);
  });
  it("the payer lists who they paid for", () => {
    expect(entryMoney(jan, [reinhardt, jan], fees, nm, cat, 21000, false).coversFor).toEqual([{ category: "Mens", name: "Reinhardt Falk" }]);
  });
  it("falls back to the registration's payer when no cover fee row exists", () => {
    expect(entryPaidByOthers(reinhardt, [])).toEqual([{ group: 1, payerId: "ebert" }]);
  });
});
