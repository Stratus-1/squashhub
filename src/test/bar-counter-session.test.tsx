import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BarCounter from "@/pages/BarCounter";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
vi.mock("@/contexts/ClubContext", () => ({ useClubContext: () => ({ club: { id: "riverside" } }) }));
vi.mock("@/hooks/use-club", () => ({ useMyClub: () => ({ data: null }) }));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/bar/BarCounterOrders", () => ({ BarCounterOrders: () => null }));
vi.mock("@/components/bar/BarOpenAndAlerts", () => ({ BarOpenAndAlerts: () => null }));
vi.mock("@/components/bar/BarOtpDialog", () => ({ BarOtpDialog: () => null }));
vi.mock("@/components/bar/ProductScanDialog", () => ({ ProductScanDialog: () => null }));
vi.mock("@/lib/bar-categories", () => ({
  BAR_CATEGORY_EMOJI: {}, barProductEmoji: () => "", categoryLabel: (_: unknown, key: string) => key,
  useBarCategories: () => ({ data: [] }), useBarDivisions: () => ({ divisions: [] }),
}));

const board = { club_id: "riverside", club_name: "Test club", items: [], tabs: [], cash_enabled: true, card_enabled: true };
function mount(path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/bar/counter" element={<BarCounter />} /><Route path="/s/:code/counter" element={<BarCounter />} /></Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  cleanup(); localStorage.clear(); vi.clearAllMocks();
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "order", "limit"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: { code: "river-menu" }, error: null }));
  mocks.from.mockReturnValue(chain);
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "bar_counter_board" ? board : false, error: null }));
});

describe("counter personal PIN boundary", () => {
  it("signed-in entry resolves its club menu without using club-only board authority", async () => {
    mount("/bar/counter");
    await screen.findByRole("textbox", { name: "Staff counter PIN" }).catch(() => screen.findByLabelText("Staff counter PIN"));
    expect(mocks.from).toHaveBeenCalledWith("qr_short_codes");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not fetch tabs on a QR entry before a personal PIN is verified", async () => {
    mount("/s/river-menu/counter");
    expect(screen.getByLabelText("Staff counter PIN")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the PIN owner's returned identity and token, and End shift requires another PIN", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "bar_counter_unlock" ? { token: "verified-session", label: "Test server" } : name === "bar_counter_board" ? board : false, error: null }));
    mount("/s/river-menu/counter");
    fireEvent.change(screen.getByLabelText("Staff counter PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock counter" }));
    await screen.findByText("Test server");
    expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_unlock", { _code: "river-menu", _pin: "1234" });
    expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_board", { _token: "verified-session", _club_id: null });
    fireEvent.click(screen.getByRole("button", { name: "End shift" }));
    expect(screen.getByLabelText("Staff counter PIN")).toHaveValue("");
    expect(localStorage.getItem("sh.barcounter.token.river-menu")).toBeNull();
  });

  it("rejects an unlock response without a named operator", async () => {
    mocks.rpc.mockResolvedValue({ data: { token: "unnamed-session" }, error: null });
    mount("/s/river-menu/counter");
    fireEvent.change(screen.getByLabelText("Staff counter PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock counter" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem("sh.barcounter.token.river-menu")).toBeNull();
  });

  it("clears a revoked session, including its cached board, without falling back to club authority", async () => {
    localStorage.setItem("sh.barcounter.token.river-menu", "revoked-session");
    localStorage.setItem("sh.barcounter.operator.river-menu", "Test server");
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "This counter device needs to be unlocked again" } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["bar-counter-board", "revoked-session", null], board);
    mount("/s/river-menu/counter", client);
    await waitFor(() => expect(localStorage.getItem("sh.barcounter.token.river-menu")).toBeNull());
    expect(screen.getByLabelText("Staff counter PIN")).toBeInTheDocument();
    expect(client.getQueryData(["bar-counter-board", "revoked-session", null])).toBeUndefined();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "bar_counter_board").every(([, args]) => args._token === "revoked-session" && args._club_id === null)).toBe(true);
  });
});