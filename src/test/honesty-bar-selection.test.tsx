import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import HonestyBar from "@/pages/HonestyBar";

const mocks = vi.hoisted(() => ({ handoff: vi.fn(), rpc: vi.fn(), added: vi.fn() }));
vi.mock("@/contexts/ClubContext", () => ({ useClubContext: () => ({ club: { id: "club1", name: "Test club", honesty_bar_enabled: true } }) }));
vi.mock("@/contexts/MemberContext", () => ({ useMemberContext: () => ({ activeMember: { id: "member1", name: "Member" }, isAdmin: true }) }));
vi.mock("@/hooks/use-club", () => ({ useIsSuperAdmin: () => true }));
vi.mock("@/hooks/use-currency", () => ({ useClubCurrency: () => ({ format: (n: number) => `R${n.toFixed(2)}` }) }));
vi.mock("@/hooks/use-account-charge-preview", () => ({ useAccountChargePreview: () => ({ blocked: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/bar/member-tab-handoff", () => ({ placeMemberCounterOrder: mocks.handoff }));
vi.mock("sonner", () => ({ toast: { success: mocks.added, error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase-ext", () => ({ fromExt: (table: string) => {
  const rows = table === "bar_items" ? [{ id: "beer", name: "Test beer", category: "beer", division: "bar", price: 20, stock_qty: 10, stock_units: 10, item_kind: "stock", active: true }] : [];
  const query: any = { select: () => query, eq: () => query, order: () => query, is: () => query, limit: () => query, maybeSingle: async () => ({ data: { code: "menu" } }), then: (resolve: any) => Promise.resolve({ data: rows }).then(resolve) };
  return query;
} }));
vi.mock("@/lib/bar-categories", () => ({ BAR_CATEGORY_EMOJI: {}, barProductEmoji: () => "", categoriesForDivision: () => [{ value: "beer", label: "Beer" }], useBarDivisions: () => ({ divisions: [{ key: "bar", label: "Bar" }] }), useBarCategories: () => ({ data: [] }) }));
vi.mock("@/components/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/BackToDashboard", () => ({ BackToDashboard: () => null }));
vi.mock("@/components/QuickVisitorSaleDialog", () => ({ QuickVisitorSaleDialog: () => null }));
vi.mock("@/components/bar/CounterSaleDialog", () => ({ CounterSaleDialog: () => null }));
vi.mock("@/components/BarMenuQrDialog", () => ({ BarMenuQrDialog: () => null }));
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks();
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "bar_order_process_status" ? false : [], error: null }));
  mocks.handoff.mockResolvedValue("/s/menu");
});
afterEach(cleanup);
it("opening My Tab does not save selections; explicit confirmation saves once", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Routes><Route path="/" element={<HonestyBar />} /><Route path="/s/menu" element={<div>Payment checkout</div>} /></Routes></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByText("Test beer"));
  expect(mocks.handoff).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "My Tab, 1 item open" }), { button: 0, ctrlKey: false });
  expect(mocks.handoff).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: /Add to my tab/ }));
  await screen.findByText("Payment checkout");
  await waitFor(() => expect(mocks.handoff).toHaveBeenCalledWith("club1", "member1", { beer: 1 }, expect.any(String)));
});
it("lets a member subtract an accidental duplicate before confirming", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Routes><Route path="/" element={<HonestyBar />} /><Route path="/s/menu" element={<div>Payment checkout</div>} /></Routes></MemoryRouter></QueryClientProvider>);
  const tile = await screen.findByText("Test beer");
  fireEvent.click(tile);
  fireEvent.click(tile);
  fireEvent.click(screen.getByRole("button", { name: "One less Test beer" }));
  expect(mocks.handoff).not.toHaveBeenCalled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "My Tab, 1 item open" }), { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole("button", { name: /Add to my tab/ }));
  await screen.findByText("Payment checkout");
  await waitFor(() => expect(mocks.handoff).toHaveBeenCalledWith("club1", "member1", { beer: 1 }, expect.any(String)));
});
