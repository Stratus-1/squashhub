import { describe, it, expect } from "vitest";
import { autoSettleFeesFromTopup } from "../../supabase/functions/_shared/wallet-auto-settle";

// Minimal fake of the admin client: records fee updates/inserts and returns
// canned rows per table.
function fakeAdmin(tables: Record<string, any[]>) {
  const writes: { table: string; op: string; payload: any }[] = [];
  const from = (table: string) => {
    const q: any = {
      select: () => q, eq: () => q, in: () => q, gte: () => q, is: () => q, order: () => q,
      maybeSingle: async () => ({ data: (tables[table] || [])[0] ?? null, error: null }),
      then: (res: any) => res({ data: tables[table] || [], error: null }),
      update: (payload: any) => { writes.push({ table, op: "update", payload }); return { eq: async () => ({ error: null }) }; },
      insert: async (payload: any) => { writes.push({ table, op: "insert", payload }); return { error: null }; },
    };
    return q;
  };
  return { admin: { from }, writes };
}

const base = {
  clubs: [{ min_booking_balance: 0 }],
  stitch_mandates: [],
  club_member_fee_payments: [{ id: "fee-1", fee_label: "Subscription", amount: 300, fee_type: "renewal" }],
};

describe("wallet auto-settle vs GoBook Lights top-ups", () => {
  it("does not mark fees paid with money paid for a Lights top-up", async () => {
    const { admin, writes } = fakeAdmin({
      ...base,
      gobook_lights_topups: [{ amount: 300, status: "ready", updated_at: new Date().toISOString() }],
    });
    await autoSettleFeesFromTopup(admin, { clubId: "c", clubMemberId: "m", amount: 300, sourceTag: "Stitch" });
    expect(writes.filter((w) => w.table === "club_member_fee_payments")).toHaveLength(0);
  });

  it("only settles fees with the part of the payment above the Lights amount", async () => {
    const { admin, writes } = fakeAdmin({
      ...base,
      gobook_lights_topups: [{ amount: 100, status: "awaiting_payment", updated_at: new Date().toISOString() }],
    });
    await autoSettleFeesFromTopup(admin, { clubId: "c", clubMemberId: "m", amount: 250, sourceTag: "Stitch" });
    const feeWrite = writes.find((w) => w.table === "club_member_fee_payments");
    expect(feeWrite?.payload).toEqual({ amount: 150 });
  });

  it("still settles fees from an ordinary top-up when no Lights top-up is pending", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { admin, writes } = fakeAdmin({
      ...base,
      gobook_lights_topups: [{ amount: 500, status: "posted", updated_at: old }],
    });
    await autoSettleFeesFromTopup(admin, { clubId: "c", clubMemberId: "m", amount: 300, sourceTag: "Stitch" });
    const feeWrite = writes.find((w) => w.table === "club_member_fee_payments");
    expect(feeWrite?.payload.paid).toBe(true);
  });
});
