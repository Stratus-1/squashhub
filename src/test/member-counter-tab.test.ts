import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMemberCounterTab, placeMemberCounterOrder, takeMemberTabDraft } from "@/lib/bar/member-tab-handoff";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
describe("member self-opened shared tab", () => {
  it("sends items as an unpaid order before member account settlement", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: { tab_id: "tab1", token: "private-token", code: "menu" }, error: null }).mockResolvedValueOnce({ data: { id: "order1" }, error: null });
    expect(await placeMemberCounterOrder("club1", "member1", { beer: 2 }, "retry-key")).toBe("/s/menu?member_tab=tab1");
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "bar_order_process_status", { _club_id: "club1" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "open_my_bar_tab", { _club_id: "club1", _club_member_id: "member1" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "bar_submit_guest_order", { _tab_id: "tab1", _token: "private-token", _lines: [{ bar_item_id: "beer", quantity: 2 }], _fulfilment: "collect", _location: "", _note: "", _idempotency_key: "retry-key" });
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });
  it("preserves selected items and does not navigate on rejected ordering", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: { tab_id: "tab1", token: "private-token", code: "menu" }, error: null }).mockResolvedValueOnce({ data: null, error: new Error("Bar closed") });
    const cart = { beer: 2 };
    await expect(placeMemberCounterOrder("club1", "member1", cart, "same-retry-key")).rejects.toThrow("Bar closed");
    expect(cart).toEqual({ beer: 2 });
    expect(localStorage.length).toBe(0);
  });
  it("opens an empty shared tab immediately for the selected club and member without charging", async () => {
    mocks.rpc.mockResolvedValue({ data: { tab_id: "tab1", token: "private-token", code: "menu" }, error: null });
    expect(await openMemberCounterTab("club1", "member1", {})).toBe("/s/menu?member_tab=tab1");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("open_my_bar_tab", { _club_id: "club1", _club_member_id: "member1" });
    expect(JSON.parse(localStorage.getItem("sh.scanpay.tab.menu") || "null")).toEqual({ tab_id: "tab1", token: "private-token" });
  });
  it("keeps ordering OFF and carries the basket to self-service checkout without posting an order or sale", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: { tab_id: "tab1", token: "private-token", code: "menu" }, error: null });
    expect(await placeMemberCounterOrder("club1", "member1", { beer: 2 }, "retry-key")).toBe("/s/menu?member_tab=tab1");
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(["bar_order_process_status", "open_my_bar_tab"]);
    expect(takeMemberTabDraft("menu", "tab1")).toEqual({ beer: 2 });
  });
  it.each([null, undefined])("does not treat unknown order settings as self-service (%s)", async data => {
    mocks.rpc.mockResolvedValueOnce({ data, error: null });
    await expect(placeMemberCounterOrder("club1", "member1", { beer: 2 }, "retry-key")).rejects.toThrow("Could not check");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("preserves the basket and performs no writes when the mode read fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("Unavailable") });
    const cart = { beer: 2 };
    await expect(placeMemberCounterOrder("club1", "member1", cart, "retry-key")).rejects.toThrow("Unavailable");
    expect(cart).toEqual({ beer: 2 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("carries draft quantities once without submitting sales or leaking them to another tab or club", async () => {
    mocks.rpc.mockResolvedValue({ data: { tab_id: "tab1", token: "private-token", code: "menu" }, error: null });
    await openMemberCounterTab("club1", "member1", { beer: 2 });
    expect(takeMemberTabDraft("other-menu", "tab1")).toEqual({});
    expect(takeMemberTabDraft("menu", "tab2")).toEqual({});
    expect(takeMemberTabDraft("menu", "tab1")).toEqual({ beer: 2 });
    expect(takeMemberTabDraft("menu", "tab1")).toEqual({});
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("preserves local state and does not hand off after an authorization failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Not yours") });
    await expect(openMemberCounterTab("club1", "other-member", { beer: 2 })).rejects.toThrow("Not yours");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("drops invalid draft quantities", () => {
    sessionStorage.setItem("sh.bar.member-draft.menu.tab1", JSON.stringify({ beer: 2, negative: -1, fraction: 0.5, huge: 51, text: "2" }));
    expect(takeMemberTabDraft("menu", "tab1")).toEqual({ beer: 2 });
  });
});