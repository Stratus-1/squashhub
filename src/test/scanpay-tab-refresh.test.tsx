import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScanPay from "@/pages/ScanPay";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
  getUser: async () => ({ data: { user: null } }),
} } }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, info: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/bar/GuestOrderDialog", () => ({ GuestOrderDialog: () => null, GuestOrderProgress: () => null }));
vi.mock("@/components/bar/BarOtpDialog", () => ({ BarOtpDialog: () => null }));
vi.mock("@/components/bar/ProductScanDialog", () => ({ ProductScanDialog: () => null }));
vi.mock("@/lib/bar-categories", () => ({ BAR_CATEGORY_EMOJI: {}, barProductEmoji: () => "", categoryLabel: () => "",
  useBarCategories: () => ({ data: [] }), useBarDivisions: () => ({ divisions: [{ key: "bar", label: "Bar" }] }),
}));

let payload: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  localStorage.setItem("sh.scanpay.guest", "1");
  localStorage.setItem("sh.scanpay.tab.test-menu", JSON.stringify({ tab_id: "test-tab", token: "test-token" }));
  payload = { found: true, tab_id: "test-tab", guest_name: "Test customer", status: "open", total: 214, lines: [] };
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "resolve_qr_short_code"
    ? { found: true, kind: "venue", club: { id: "test-club", name: "Test club", currency_code: "ZAR" }, menu: [] }
    : name === "get_bar_guest_tab" ? { ...payload } : false, error: null }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/s/test-menu"]}><Routes><Route path="/s/:code" element={<ScanPay />} /></Routes></MemoryRouter>
  </QueryClientProvider>);
  await screen.findByText("Your open tab · Test customer");
  await act(async () => {});
}

describe("customer tab cross-device updates", () => {
  it.each(["terminal", "cash", "online"])("reads confirmed %s settlement without refresh or a customer payment choice", async (method) => {
    await mount();
    expect(mocks.success).not.toHaveBeenCalled();
    payload = { ...payload, status: "settled", settled_method: method };
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(localStorage.getItem("sh.scanpay.tab.test-menu")).toBeNull());
    expect(screen.getByText("Thank you!")).toBeInTheDocument();
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_bar_guest_tab", { _tab_id: "test-tab", _token: "test-token" });
    expect(mocks.rpc.mock.calls.every(([name]) => ["resolve_qr_short_code", "bar_order_process_status", "get_bar_guest_tab"].includes(name))).toBe(true);
  });

  it("updates open-tab totals on the five-second timer without marking paid", async () => {
    await mount();
    vi.useFakeTimers();
    // Resume after timers are mocked so a freshly scheduled timer is controlled.
    payload = { ...payload, total: 300 };
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(screen.getByText(/R.?300[.,]00/)).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(localStorage.getItem("sh.scanpay.tab.test-menu")).not.toBeNull();
  });

  it("does not fabricate settlement when a status request fails", async () => {
    await mount();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Offline" } });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(screen.getByText("Your open tab · Test customer")).toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});