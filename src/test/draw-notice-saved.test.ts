import { describe, it, expect, vi, beforeEach } from "vitest";
const store = vi.hoisted(() => ({ bl: {} as any, updates: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => {
    const c: any = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: { beta_lifecycle: store.bl }, error: null }),
      update: (v: any) => { store.updates.push(v); store.bl = v.beta_lifecycle; return { eq: async () => ({ error: null }) }; } };
    return c;
  } },
}));
vi.mock("@/lib/comms/send", () => ({ sendComms: vi.fn() }));
vi.mock("@/lib/smart-builder/step-handover", () => ({ entryPayLinks: vi.fn(), emailPayButton: vi.fn(), payRoute: vi.fn() }));
import { readDrawNoticeSettings, saveDrawNoticeSettings, classifyActivation, DEFAULT_ACTIVATION_INTRO, DEFAULT_DRAW_NOTICE } from "@/lib/smart-builder/draw-notice";

beforeEach(() => { store.bl = { draw_notify: true, draw_notices: { "all:r1": { sent: 3 } }, answers: { picks: { a: [1] } } }; store.updates = []; });

describe("saved draw wording", () => {
  it("falls back to the default until saved", () => {
    const s = readDrawNoticeSettings({}, "all:r1", DEFAULT_DRAW_NOTICE);
    expect(s).toMatchObject({ message: DEFAULT_DRAW_NOTICE, includeActivation: false, activationIntro: DEFAULT_ACTIVATION_INTRO, savedAt: null });
  });
  it("persists per key, survives reload and keeps other lifecycle data", async () => {
    await saveDrawNoticeSettings("t1", "all:r1", { message: "Custom text", includeActivation: true, activationIntro: "Join us" });
    expect(store.bl.answers.picks).toEqual({ a: [1] });
    expect(store.bl.draw_notices["all:r1"].sent).toBe(3);
    const r = readDrawNoticeSettings(store.bl, "all:r1", DEFAULT_DRAW_NOTICE);
    expect(r).toMatchObject({ message: "Custom text", includeActivation: true, activationIntro: "Join us" });
    expect(readDrawNoticeSettings(store.bl, "2:r2", "Round 2 default").message).toBe("Round 2 default");
  });
  it("never stores links or tokens in the saved wording", async () => {
    await saveDrawNoticeSettings("t1", "all:r1", { message: "Hi", includeActivation: true, activationIntro: DEFAULT_ACTIVATION_INTRO });
    expect(JSON.stringify(store.bl.draw_notice_texts)).not.toMatch(/activate\?t=|token/i);
    expect(JSON.stringify(store.bl.draw_notice_activation)).not.toMatch(/activate\?t=|token/i);
  });
  it("rejects empty wording without saving", async () => {
    await expect(saveDrawNoticeSettings("t1", "all:r1", { message: "  ", includeActivation: false, activationIntro: "" })).rejects.toThrow();
    expect(store.updates).toHaveLength(0);
  });
});

describe("activation recipients", () => {
  it("separates registered, shared-family, unregistered and no-email players", () => {
    const r = classifyActivation([
      { id: "reg", user_id: "u1", email: "dad@x.co" },
      { id: "kid", user_id: null, email: "DAD@x.co" },
      { id: "new", user_id: null, email: "new@x.co" },
      { id: "none", user_id: null, email: "" },
    ], new Set(["dad@x.co"]));
    expect(r).toEqual({ reg: "registered", kid: "family_login", new: "needs_activation", none: "no_email" });
  });
});
