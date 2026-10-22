import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CashUp } from "@/components/bar/CashUp";

const mocks = vi.hoisted(() => ({ superAdmin: true, rpc: vi.fn() }));
vi.mock("@/hooks/use-club", () => ({ useIsSuperAdmin: () => mocks.superAdmin }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
const methods = { cash: { sales: 0, tips: 0, count: 0 } };
beforeEach(() => {
  mocks.superAdmin = true;
  mocks.rpc.mockReset().mockImplementation(async (name: string) => ({ error: null, data:
    name === "bar_cash_up_preview" ? { period_start: "2026-10-22T04:46:14Z", methods, cash_opening: 230, tip_payouts: 0 } :
    name === "bar_staff_tip_balances" ? [{ staff_id: "staff", name: "Test staff", remaining: 56 }] :
    name === "bar_cash_up_report" ? [{ id: "latest", period_start: "2026-10-21T12:00:00Z", period_end: "2026-10-22T04:46:14Z", counted_cash: 230, expected_cash: 174, totals: { methods, cash_opening: 230 } }] : [] }));
});
function open() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CashUp clubId="riverside" tipsEnabled /></QueryClientProvider>);
}
describe("cash-up payout and edit controls", () => {
  it("rejects negative R56 input and submits positive R56", async () => {
    open();
    const tips = await screen.findByRole("textbox", { name: "Tips paid to Test staff" });
    fireEvent.change(tips, { target: { value: "-56" } });
    expect(tips).toHaveValue("56.00");
    fireEvent.change(tips, { target: { value: "56" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Cash counted" }), { target: { value: "230" } });
    fireEvent.click(screen.getByRole("button", { name: "Complete cash-up" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_cash_up_close_v2", expect.objectContaining({ _tip_payouts: [{ staff_id: "staff", amount: 56 }] })));
  });
  it("Super Admin saves an edit with a reason without deleting or reopening the cash-up", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "View / edit cash-ups" }));
    fireEvent.click(await screen.findByRole("button", { name: "View / edit" }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason for change (required)"), { target: { value: "Correct note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_cash_up_admin_correct", expect.objectContaining({ _id: "latest", _reason: "Correct note" })));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "bar_cash_up_undo")).toBe(false);
  });
  it("anonymous counter staff do not gain admin edit controls", () => {
    mocks.superAdmin = false;
    open();
    expect(screen.queryByRole("button", { name: "View / edit cash-ups" })).not.toBeInTheDocument();
  });
});