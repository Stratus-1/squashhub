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
import { readDrawNoticeSettings, resolveDrawNoticeSettings, saveDrawNoticeSettings, classifyActivation, DEFAULT_ACTIVATION_INTRO, DEFAULT_DRAW_NOTICE } from "@/lib/smart-builder/draw-notice";

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
  it("inherits saved tournament-wide wording for category-scoped notices", () => {
    const bl = { draw_notice_texts: { "all:r1": { message: "Wide round-1 wording", saved_at: "2026-10-12T20:59:39Z" } } };
    const s = resolveDrawNoticeSettings(bl, "6:r1", DEFAULT_DRAW_NOTICE);
    expect(s.message).toBe("Wide round-1 wording");
    expect(s.savedAt).toBe("2026-10-12T20:59:39Z");
    // Saved per-category wording still wins over the tournament-wide text.
    const scoped = { draw_notice_texts: { ...bl.draw_notice_texts, "6:r1": { message: "Ladies A wording", saved_at: "2026-10-13T09:00:00Z" } } };
    expect(resolveDrawNoticeSettings(scoped, "6:r1", DEFAULT_DRAW_NOTICE).message).toBe("Ladies A wording");
    // No saved text anywhere -> built-in default.
    expect(resolveDrawNoticeSettings({}, "6:r1", "Default only").message).toBe("Default only");
    // "all:"-scoped keys never inherit from themselves.
    expect(resolveDrawNoticeSettings(bl, "all:r2", "Round 2 default").message).toBe("Round 2 default");
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
  it("includes saved free court / GoBook paragraphs in stage-scoped round previews", () => {
    const message = `${DEFAULT_DRAW_NOTICE}\n\nReserved Club Champs court slots are free. Choose a slot through SquashHub. For other slots, book through GoBook.`;
    const bl = { draw_notice_texts: { "all:r1": { message, saved_at: "2026-10-12T20:59:39Z" } } };
    expect(resolveDrawNoticeSettings(bl, "6:r1:sladies-a", "Your Round 1 match has been drawn.")).toMatchObject({ message, savedAt: "2026-10-12T20:59:39Z" });
    expect(resolveDrawNoticeSettings(bl, "all:r1:sladies-a", "Fallback").message).toBe(message);
    expect(resolveDrawNoticeSettings(bl, "6:r2:sladies-a", "Round 2").message).toBe("Round 2");
    const custom = { draw_notice_texts: { ...bl.draw_notice_texts, "6:r1:sladies-a": { message: "Specific stage wording" } } };
    expect(resolveDrawNoticeSettings(custom, "6:r1:sladies-a", "Fallback").message).toBe("Specific stage wording");
  });
});

describe("activation recipients", () => {
  const P = (id: string, extra: any) => ({ id, person_id: "p-" + id, role: "member", club_id: "A", ...extra });
  it("covers login, cross-club, other-club login, shared email, no email and guests", () => {
    const r = classifyActivation([
      P("reg", { user_id: "u1", email: "dad@x.co" }),
      P("kid", { user_id: null, email: "DAD@x.co" }),
      P("new", { user_id: null, email: "new@x.co" }),
      P("clubB", { user_id: null, email: "b@x.co", club_id: "B" }),
      { ...P("multi", { user_id: null, email: "m@x.co" }), person_id: "p-has-login" },
      P("none", { user_id: null, email: "" }),
      { id: "guest", user_id: null, email: "g@x.co", person_id: null, role: "member", club_id: "A" },
      P("visitor", { user_id: null, email: "v@x.co", role: "visitor" }),
      P("sameEmailOtherClub", { user_id: null, email: "dad@x.co", club_id: "B" }),
    ], new Set(["A|dad@x.co"]), new Set(["p-has-login"]));
    expect(r).toEqual({ reg: "registered", kid: "family_login", new: "needs_activation", clubB: "needs_activation", multi: "registered",
      none: "no_email", guest: "guest", visitor: "guest", sameEmailOtherClub: "needs_activation" });
  });
});
