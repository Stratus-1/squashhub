import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScanPay from "@/pages/ScanPay";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), error: vi.fn(), mode: false, enabled: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc,
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: "member", name: "Fictional member" }, error: null }) }; return q; },
  auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }), getUser: async () => ({ data: { user: { id: "user" } } }) },
} }));
vi.mock("@/contexts/MemberContext", () => ({ useMemberContext: () => ({ activeMember: { id: "member", name: "Fictional member" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: mocks.error } }));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/bar/GuestOrderDialog", () => ({ GuestOrderDialog: () => null, GuestOrderProgress: () => null }));
vi.mock("@/components/bar/BarOtpDialog", () => ({ BarOtpDialog: () => { throw new Error("Signed-in member must not get OTP"); } }));
vi.mock("@/components/bar/ProductScanDialog", () => ({ ProductScanDialog: () => null }));
vi.mock("@/lib/bar-categories", () => ({ BAR_CATEGORY_EMOJI: {}, barProductEmoji: () => "", categoryLabel: () => "",
  useBarCategories: () => ({ data: [] }), useBarDivisions: () => ({ divisions: [{ key: "bar", label: "Bar" }] }),
}));

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.enabled = true;
  localStorage.setItem("sh.scanpay.guest", "1");
  localStorage.setItem("sh.scanpay.tab.test-menu", JSON.stringify({ tab_id: "test-tab", token: "synthetic-token" }));
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "resolve_qr_short_code"
    ? { found: true, kind: "venue", club: { id: "riverside-synthetic", name: "Fictional Riverside", currency_code: "ZAR" }, menu: [] }
    : name === "get_bar_guest_tab" ? { found: true, tab_id: "test-tab", guest_name: "Fictional member", status: "open", subtotal: 900, total: 900, lines: [] }
    : name === "bar_tip_config" ? { enabled: mocks.enabled, staff: [] }
    : name === "bar_member_tip_staff" ? [{ id: "grant", name: "Fictional Grant" }]
    : name === "bar_order_process_status" ? mocks.mode
    : name === "bar_accepting_orders" ? true : { ok: true }, error: null }));
});
afterEach(cleanup);

async function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/s/test-menu"]}><Routes><Route path="/s/:code" element={<ScanPay />} /></Routes></MemoryRouter>
  </QueryClientProvider>);
  await screen.findByText("Your open tab · Fictional member");
  await act(async () => {});
}

describe("signed-in account settlement", () => {
  it.each([false, true])("only prompts on account settlement with order process %s; adds R90 without OTP", async mode => {
    mocks.mode = mode;
    await mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Charge tab to my member account" }));
    await screen.findByRole("dialog");
    expect(mocks.rpc.mock.calls.some(([name]) => name === "bar_member_tab_account_with_tip")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "10%" }));
    fireEvent.click(screen.getByRole("button", { name: "Add tip & charge account" }));
    await screen.findByText("Thank you!");
    expect(mocks.rpc).toHaveBeenCalledWith("bar_member_tab_account_with_tip", { _tab_id: "test-tab", _token: "synthetic-token", _club_member_id: "member", _tip: 90, _staff_id: "grant" });
    expect(screen.getByText(/990[.,]00/)).toBeInTheDocument();
  });
  it("No tip settles once for R900 without OTP", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Charge tab to my member account" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "No tip — add to account" }));
    await screen.findByText("Thank you!");
    expect(mocks.rpc).toHaveBeenCalledWith("bar_member_tab_account_with_tip", expect.objectContaining({ _tip: 0, _staff_id: null }));
  });
  it("tips OFF keeps the existing direct account charge", async () => {
    mocks.enabled = false;
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Charge tab to my member account" }));
    await screen.findByText("Thank you!");
    expect(mocks.rpc).toHaveBeenCalledWith("bar_qr_charge_guest_tab_member_session", expect.objectContaining({ _club_member_id: "member" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("failed settlement retains the prompt and never falls back to OTP", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Charge tab to my member account" }));
    await screen.findByRole("dialog");
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Declined" } });
    fireEvent.click(screen.getByRole("button", { name: "No tip — add to account" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Declined"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Thank you!")).toBeNull();
  });
});