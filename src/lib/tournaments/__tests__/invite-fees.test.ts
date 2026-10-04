import { describe, expect, it } from "vitest";
import { inviteFeeCents, inviteTotalFeeCents, type InvitePayload } from "../invite-link";

const base: InvitePayload = {
  found: true,
  payment_required: true,
  entry_fee_cents: 10000,
  divisions: [
    { group_number: 1, label: "Men 6th" },
    { group_number: 2, label: "Mens 7th" },
  ],
};

describe("inviteTotalFeeCents", () => {
  it("is free when payment is not required", () => {
    expect(inviteTotalFeeCents({ ...base, payment_required: false }, [1, 2])).toBe(0);
  });

  it("flat fee × ticked events when no per-event prices exist", () => {
    expect(inviteTotalFeeCents(base, [1])).toBe(10000);
    expect(inviteTotalFeeCents(base, [1, 2])).toBe(20000);
  });

  it("sums per-event prices when events are priced differently", () => {
    const p: InvitePayload = {
      ...base,
      divisions: [
        { group_number: 1, label: "Men 6th", fee_cents: 10000 },
        { group_number: 2, label: "Mens 7th", fee_cents: 15000 },
      ],
    };
    expect(inviteTotalFeeCents(p, [1])).toBe(10000);
    expect(inviteTotalFeeCents(p, [2])).toBe(15000);
    expect(inviteTotalFeeCents(p, [1, 2])).toBe(25000);
  });

  it("falls back to the flat fee for an event without its own price", () => {
    const p: InvitePayload = {
      ...base,
      divisions: [
        { group_number: 1, label: "Men 6th", fee_cents: 8000 },
        { group_number: 2, label: "Mens 7th" },
      ],
    };
    expect(inviteTotalFeeCents(p, [1, 2])).toBe(18000);
  });

  it("no ticked events means every offered event (legacy single fee)", () => {
    expect(inviteTotalFeeCents(base, [])).toBe(20000);
    expect(inviteTotalFeeCents({ ...base, divisions: [] }, [])).toBe(10000);
  });

  it("inviteFeeCents stays the flat fallback", () => {
    expect(inviteFeeCents(base)).toBe(10000);
    expect(inviteFeeCents({ ...base, payment_required: false })).toBe(0);
  });
});
