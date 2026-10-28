import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
  await screen.findByText("Tap items to add");
  await waitFor(() => expect(screen.queryByPlaceholderText("Your name")).toBeNull());
  await act(async () => {});
}

describe("signed-in member bar page", () => {
  it("hides the guest login prompt and the membership-number strip", async () => {
    await mount();
    expect(screen.queryByText(/Got it — start ordering/)).toBeNull();
    expect(screen.queryByText(/one-time code sent to your phone/)).toBeNull();
  });

  it("does not open an empty tab just by loading the member menu", async () => {
    await mount();
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(mocks.rpc.mock.calls.some(([name]) => name === "open_bar_guest_tab")).toBe(false);
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
