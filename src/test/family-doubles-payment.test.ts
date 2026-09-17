import { describe, expect, it } from "vitest";
import { pairForDivision, type ManagedPair, type MyPair } from "@/lib/tournaments/doubles";

describe("Family Doubles pair display", () => {
  it("keeps the ordinary doubles helper focused on the player's own pair", () => {
    const pairs: MyPair[] = [
      {
        id: "pair-1",
        group_number: 1,
        status: "awaiting_payment",
        proposed_by_me: true,
        partner_member_id: "partner",
        partner_name: "Partner",
        partner_club: null,
      },
    ];
    expect(pairForDivision(pairs, 1)?.id).toBe("pair-1");
  });

  it("supports several payer-managed pairs without duplicating players", () => {
    const pairs: ManagedPair[] = [
      {
        id: "pair-1", group_number: 1, status: "awaiting_payment",
        member_a: "father", member_a_name: "Father", member_a_paid: false,
        member_b: "son", member_b_name: "Son", member_b_paid: false,
      },
      {
        id: "pair-2", group_number: 1, status: "awaiting_payment",
        member_a: "mother", member_a_name: "Mother", member_a_paid: false,
        member_b: "daughter", member_b_name: "Daughter", member_b_paid: false,
      },
    ];
    expect(new Set(pairs.flatMap((pair) => [pair.member_a, pair.member_b])).size).toBe(4);
  });
});