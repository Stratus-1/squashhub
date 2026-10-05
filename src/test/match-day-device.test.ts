import { describe, it, expect, vi } from "vitest";

const calls: any[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rest: { fetch: (input: any, init: any) => { calls.push({ input, init }); return Promise.resolve(new Response("[]")); } } },
}));

import { supabase } from "@/integrations/supabase/client";
import { enableMatchDayDevice, disableMatchDayDevice } from "@/lib/match-day/device";

describe("match day device mode", () => {
  it("sends the token as the anonymous role and restores the member client on exit", async () => {
    const rest: any = (supabase as any).rest;
    const original = rest.fetch;
    enableMatchDayDevice("tok_abcdefghijklmnop", 9);
    await rest.fetch("https://x/rest/v1/courts", { headers: { Authorization: "Bearer member-jwt" } });
    const h = new Headers(calls[0].init.headers);
    expect(h.get("x-match-day-token")).toBe("tok_abcdefghijklmnop");
    expect(h.get("x-match-day-court")).toBe("9");
    expect(h.get("Authorization")).not.toContain("member-jwt");
    disableMatchDayDevice();
    expect(rest.fetch).toBe(original);
  });

  it("all-courts links send no court header", async () => {
    calls.length = 0;
    enableMatchDayDevice("tok_abcdefghijklmnop", null);
    await (supabase as any).rest.fetch("https://x/rest/v1/courts", {});
    expect(new Headers(calls[0].init.headers).has("x-match-day-court")).toBe(false);
    disableMatchDayDevice();
  });
});
