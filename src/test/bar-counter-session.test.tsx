import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BarCounter from "@/pages/BarCounter";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { ...mocks, rpc: (name: string, args: unknown) => name === "bar_counter_shift_status" ? Promise.resolve({ data: { club_id: "riverside", opening: "16:00:00", attendance: { id: "logged-shift", paid_start: "2026-10-23T14:00Z" }, shift: { kind: "normal", split_tips: false } }, error: null }) : mocks.rpc(name, args) } }));
vi.mock("@/contexts/ClubContext", () => ({ useClubContext: () => ({ club: { id: "riverside" } }) }));
vi.mock("@/hooks/use-club", () => ({ useMyClub: () => ({ data: null }) }));
vi.mock("@/components/SEO", () => ({ SEO: () => null }));
vi.mock("@/components/bar/BarCounterOrders", () => ({ BarCounterOrders: () => null }));
vi.mock("@/components/bar/BarOpenAndAlerts", () => ({ BarOpenAndAlerts: () => null, playPing: vi.fn() }));
vi.mock("@/components/bar/BarOtpDialog", () => ({ BarOtpDialog: () => null }));
vi.mock("@/components/bar/ProductScanDialog", () => ({ ProductScanDialog: () => null }));
vi.mock("@/lib/bar-categories", () => ({
  BAR_CATEGORY_EMOJI: {}, barProductEmoji: () => "", categoryLabel: (_: unknown, key: string) => key,
  useBarCategories: () => ({ data: [] }), useBarDivisions: () => ({ divisions: [] }),
}));

const board = { club_id: "riverside", club_name: "Test club", items: [], tabs: [], cash_enabled: true, card_enabled: true };
function mount(path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/bar/counter" element={<BarCounter />} /><Route path="/s/:code/counter" element={<BarCounter />} /><Route path="/s/:code" element={<div>Customer menu</div>} /></Routes>
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
  it("opens visitor tabs with the explicit six-argument member-aware function", async () => {
    localStorage.setItem("sh.barcounter.token.river-menu", "verified-session");
    localStorage.setItem("sh.barcounter.operator.river-menu", "Test server");
    let current = board;
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "bar_counter_open_tab") {
        if (!("_club_member_id" in args)) return { data: null, error: { message: "Could not choose the best candidate function" } };
        current = { ...board, tabs: [{ tab_id: "visitor-tab", token: "customer-token", guest_name: "Test visitor", status: "open", opened_at: "2026-10-19T16:00:00Z", total: 0, lines: [] }] } as typeof board;
        return { data: { tab_id: "visitor-tab" }, error: null };
      }
      return { data: name === "bar_counter_board" ? current : false, error: null };
    });
    mount("/s/river-menu/counter");
    await screen.findByText("Test server");
    fireEvent.click(screen.getByRole("button", { name: /^Visitor$/ }));
    fireEvent.change(screen.getByPlaceholderText("Visitor's name"), { target: { value: "Test visitor" } });
    fireEvent.change(screen.getByPlaceholderText("Cell number (required)"), { target: { value: "0000000000" } });
    fireEvent.click(screen.getByRole("button", { name: /^Tab$/ }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_open_tab", {
      _guest_name: "Test visitor", _token: "verified-session", _club_id: null,
      _guest_phone: "0000000000", _operator: "Test server", _club_member_id: null,
    }));
    await screen.findByRole("button", { name: "All tabs" });
    expect(screen.getByText("Test visitor")).toBeInTheDocument();
  });

  it("exits QR counter mode and clears serving identity without changing tabs or bar opening", async () => {
    localStorage.setItem("sh.barcounter.token.river-menu", "verified-session");
    localStorage.setItem("sh.barcounter.operator.river-menu", "Test server");
    mount("/s/river-menu/counter");
    await screen.findByText("Test server");
    fireEvent.click(screen.getByRole("button", { name: "Exit counter mode" }));
    await screen.findByText("Customer menu");
    expect(localStorage.getItem("sh.barcounter.token.river-menu")).toBeNull();
    expect(localStorage.getItem("sh.barcounter.operator.river-menu")).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_end_shift", { _token: "verified-session" });
    expect(mocks.rpc.mock.calls.every(([name]) => ["bar_counter_board", "bar_order_process_status", "bar_tip_config", "bar_shift_overview", "bar_counter_end_shift"].includes(name))).toBe(true);
  });

  it("can leave the PIN screen without entering a PIN", async () => {
    mount("/s/river-menu/counter");
    fireEvent.click(screen.getByRole("button", { name: "Exit counter mode" }));
    await screen.findByText("Customer menu");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("automatically discovers customer-created tabs using only its verified PIN session", async () => {
    localStorage.setItem("sh.barcounter.token.river-menu", "verified-session");
    localStorage.setItem("sh.barcounter.operator.river-menu", "Test server");
    let current = board;
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "bar_counter_board" ? current : false, error: null }));
    mount("/s/river-menu/counter");
    await screen.findByText("Test server");
    await act(async () => {});
    current = { ...board, tabs: [{ tab_id: "new-tab", token: "customer-token", guest_name: "New customer", status: "open", opened_at: "2026-10-18T11:00:00Z", total: 100, lines: [] }] } as typeof board;
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await screen.findByText("New customer");
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "bar_counter_board").every(([, args]) => args._token === "verified-session" && args._club_id === null)).toBe(true);
  });

  async function openPendingTab(method: "online" | "cash" | "terminal") {
    const pendingBoard = { ...board, tabs: [{ tab_id: "pending-tab", token: "customer-token", guest_name: "Test customer", status: "closing", settled_method: method, opened_at: "2026-10-18T10:00:00Z", total: 214, lines: [] }] };
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "bar_counter_unlock" ? { token: "verified-session", label: "Test server" } : name === "bar_counter_board" ? pendingBoard : {}, error: null }));
    mount("/s/river-menu/counter");
    fireEvent.change(screen.getByLabelText("Staff counter PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock counter" }));
    fireEvent.click(await screen.findByText("Test customer"));
  }

  it.each(["cash", "terminal"] as const)("confirms a pending %s tab using its returned payment method and verified session", async (method) => {
    await openPendingTab(method);
    expect(mocks.rpc.mock.calls.some(([name]) => name === "bar_counter_settle_tab")).toBe(false);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: method === "cash" ? "Confirm cash received" : "Confirm card payment received" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_settle_tab", { _tab_id: "pending-tab", _method: method, _token: "verified-session", _club_id: null }));
    confirm.mockRestore();
  });

  it.each(["cash", "terminal"] as const)("replaces a pending online attempt with counter %s payment", async (method) => {
    await openPendingTab("online");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: method === "cash" ? "Paid cash" : "Swipe at bar" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("bar_counter_settle_tab", { _tab_id: "pending-tab", _method: method, _token: "verified-session", _club_id: null }));
    confirm.mockRestore();
  });

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
    await waitFor(() => expect(screen.getByLabelText("Staff counter PIN")).toHaveValue(""));
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