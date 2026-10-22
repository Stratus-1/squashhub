import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CashUpsReport } from "@/components/club-admin/bar/CashUpsReport";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), amount: 40, fail: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
beforeEach(() => {
  mocks.amount = 40; mocks.fail = false;
  mocks.rpc.mockReset().mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "bar_cash_up_admin_correct") {
      if (mocks.fail) return { error: new Error("Test correction failed") };
      const changes = args._payouts as { amount: number }[];
      if (changes.length) mocks.amount = changes[0].amount;
      return { error: null, data: {} };
    }
    return { error: null, data: name === "bar_cash_up_edit_payouts" ? [{ id: "payout", staff_name: "Test staff", amount: mocks.amount, maximum: 100 }] : [
      { id: "latest", period_start: "2026-10-21T00:00:00Z", period_end: "2026-10-22T04:46:00Z", counted_cash: 230, card_counted: 575, written_off: true, write_off_amount: 40,
        totals: { cash_opening: 142, tip_payouts: mocks.amount, methods: { cash: { sales: 88, tips: 0 }, card_bar: { sales: 519, tips: 56 } } } },
    ] };
  });
});
async function open() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CashUpsReport clubId="riverside" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "View / edit" }));
  return screen.findByLabelText("Tips paid to Test staff");
}
describe("cash-up paid-tip correction", () => {
  it("accepts positive R56, requires a reason and preserves locked R230 cash", async () => {
    const input = await open();
    expect(input).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Cash counted" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "56" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason for change (required)"), { target: { value: "Correct tips" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_cash_up_admin_correct", expect.objectContaining({ _counted_cash: 230, _payouts: [{ id: "payout", expected_amount: 40, amount: 56 }] })));
    await waitFor(() => expect(input).toHaveValue("56.00"));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "bar_cash_up_undo")).toBe(false);
  });
  it("rejects negative R56 and zero for an existing paid-tip entry", async () => {
    const input = await open();
    fireEvent.change(input, { target: { value: "-56" } });
    expect(input).toHaveValue("40.00");
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Reason for change (required)"), { target: { value: "Test" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
  it("retains unsaved input when the server refuses a correction", async () => {
    mocks.fail = true;
    const input = await open();
    fireEvent.change(input, { target: { value: "56" } });
    fireEvent.change(screen.getByLabelText("Reason for change (required)"), { target: { value: "Test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_cash_up_admin_correct", expect.anything()));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled());
    expect(input).toHaveValue("56");
    expect(mocks.amount).toBe(40);
  });
});