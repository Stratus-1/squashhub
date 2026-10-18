import { beforeEach, describe, expect, it, vi } from "vitest";
import { openMemberCounterTab, takeMemberTabDraft } from "@/lib/bar/member-tab-handoff";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
describe("member self-opened shared tab", () => {
  it("opens an empty shared tab immediately for the selected club and member without charging", async () => {
    mocks.rpc.mockResolvedValue({ data: { tab_id: "tab1", token: "private-token", code: "menu" }, error: null });
    expect(await openMemberCounterTab("club1", "member1", {})).toBe("/s/menu?member_tab=tab1");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("open_my_bar_tab", { _club_id: "club1", _club_member_id: "member1" });
    expect(JSON.parse(localStorage.getItem("sh.scanpay.tab.menu") || "null")).toEqual({ tab_id: "tab1", token: "private-token" });
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