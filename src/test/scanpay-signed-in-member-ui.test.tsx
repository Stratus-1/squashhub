import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScanPay from "@/pages/ScanPay";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getUser: async () => ({ data: { user: { id: "u1" } } }),
  },
  from: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: { id: "m1", name: "Rachel Gates" }, error: null });
    return chain;
  },
} }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, info: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/bar/GuestOrderDialog", () => ({ GuestOrderDialog: () => null, GuestOrderProgress: () => null }));
vi.mock("@/components/bar/BarOtpDialog", () => ({ BarOtpDialog: () => null }));
vi.mock("@/components/bar/ProductScanDialog", () => ({ ProductScanDialog: () => null }));
vi.mock("@/contexts/MemberContext", () => ({ useMemberContext: () => ({
  activeMember: { id: "m1", name: "Rachel Gates", email: null, club_member_number: "NSC1", gender: null, user_id: "u1" },
  isAdmin: false, linkedMembers: [], allMembers: [], effectiveUserId: "u1", isViewingAs: false,
}) }));
vi.mock("@/lib/bar-categories", () => ({ BAR_CATEGORY_EMOJI: {}, barProductEmoji: () => "", categoryLabel: () => "",
  useBarCategories: () => ({ data: [] }), useBarDivisions: () => ({ divisions: [{ key: "bar", label: "Bar" }] }),
}));

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "resolve_qr_short_code"
    ? { found: true, kind: "venue", club: { id: "test-club", name: "Test club", currency_code: "ZAR" }, menu: [] }
    : name === "open_bar_guest_tab" ? { tab_id: "tab-1", token: "tok-1", guest_name: "Rachel Gates" }
    : false, error: null }));
});
afterEach(() => { cleanup(); });

async function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/s/test-menu"]}><Routes><Route path="/s/:code" element={<ScanPay />} /></Routes></MemoryRouter>
  </QueryClientProvider>);
  await screen.findByText("Staying for a while? Open a tab");
  // Wait for the signed-in membership check to resolve.
  await screen.findByText(/Tap drinks all evening/);
  await act(async () => {});
}

describe("signed-in member bar page", () => {
  it("hides the guest login prompt and the membership-number strip", async () => {
    await mount();
    expect(screen.queryByText(/Got it — start ordering/)).toBeNull();
    expect(screen.queryByText(/one-time code sent to your phone/)).toBeNull();
  });

  it("opens a tab in the member's own name without asking for a name", async () => {
    await mount();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    await act(async () => { screen.getByRole("button", { name: /Open my tab/ }).click(); });
    expect(mocks.rpc).toHaveBeenCalledWith("open_bar_guest_tab", {
      _code: "test-menu", _guest_name: "Rachel Gates", _guest_phone: null,
    });
  });

  it("labels the open tab as My tab for the signed-in member", async () => {
    localStorage.setItem("sh.scanpay.tab.test-menu", JSON.stringify({ tab_id: "tab-1", token: "tok-1" }));
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "resolve_qr_short_code"
      ? { found: true, kind: "venue", club: { id: "test-club", name: "Test club", currency_code: "ZAR" }, menu: [] }
      : name === "get_bar_guest_tab" ? { found: true, tab_id: "tab-1", guest_name: "Rachel Gates", status: "open", total: 33, lines: [] }
      : false, error: null }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/s/test-menu"]}><Routes><Route path="/s/:code" element={<ScanPay />} /></Routes></MemoryRouter>
    </QueryClientProvider>);
    await screen.findByText("My tab · Rachel Gates");
  });
});
