import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CounterClubUseDialog } from "@/components/bar/CounterClubUseDialog";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), close: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null, data: {} }); });
function open() {
 render(<QueryClientProvider client={new QueryClient()}><CounterClubUseDialog token="verified-pin" operator="Test server" items={[{ id: "ball", name: "Squash ball", item_kind: "stock", division: "shop", cost_price: 30, unit_yield: 1, avg_unit_cost: null }, { id: "special", name: "Special", item_kind: "special", club_use_unit_cost: 14 }]} onClose={mocks.close} /></QueryClientProvider>);
}
describe("PIN club-sponsored basket", () => {
 it("submits a special as sponsored stock, not as a sale or customer charge", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Add Special" }));
  fireEvent.change(screen.getByLabelText("Used for"), { target: { value: "Club event" } });
  fireEvent.click(screen.getByRole("button", { name: "Record club use" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalled());
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("bar_counter_club_use", { _token: "verified-pin", _lines: [{ item_id: "special", quantity: 1 }], _reason: "Club event", _request_id: expect.any(String) });
 });
 it("records balls with verified PIN and reason, without customer-tab or sale requests", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Add Squash ball" }));
  expect(screen.getByText(/cost R30\.00/)).toBeInTheDocument();
  expect(screen.getByText(/Cost to club \(income statement\)/)).toHaveTextContent("R30.00");
  expect(screen.getByRole("button", { name: "Record club use" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Used for"), { target: { value: "Tournament" } });
  fireEvent.click(screen.getByRole("button", { name: "Record club use" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalled());
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("bar_counter_club_use", { _token: "verified-pin", _lines: [{ item_id: "ball", quantity: 1 }], _reason: "Tournament", _request_id: expect.any(String) });
 });
 it("retries the identical request after a failed response", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: new Error("Connection interrupted") });
  open();
  fireEvent.click(screen.getByRole("button", { name: "Add Squash ball" }));
  fireEvent.change(screen.getByLabelText("Used for"), { target: { value: "Tournament" } });
  fireEvent.click(screen.getByRole("button", { name: "Record club use" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Record club use" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Record club use" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalled());
  expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
 });
});