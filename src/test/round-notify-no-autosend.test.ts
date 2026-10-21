import { describe, expect, it, vi } from "vitest";

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock("@/lib/messaging", () => ({ sendMemberMessage: vi.fn() }));

import { notifyRoundDraw, roundNotifySummary } from "@/lib/tournaments/round-notify";

describe("draw generation never auto-sends", () => {
  it("returns skipped and calls no backend when not an explicit send", async () => {
    const confirmSpy = vi.fn(() => true);
    (globalThis as any).window = { confirm: confirmSpy };
    const r = await notifyRoundDraw({ champId: "c1", roundNumber: 1 });
    expect(r.skipped).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(roundNotifySummary(r)).toMatch(/NOT notified/);
  });

  it("explicit organiser send still reaches the backend", async () => {
    rpc.mockResolvedValueOnce({ data: { sent: 2, channels: ["app"], whatsapp: [] }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const r = await notifyRoundDraw({ champId: "c1", roundNumber: 2, skipPrompt: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, "mark_champ_draw_scope_notified", expect.objectContaining({ p_champ_id: "c1", p_round_number: 2 }));
    expect(r.sent).toBe(2);
  });
});
