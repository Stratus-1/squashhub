import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { goBookBalance, goBookBalances } from "../../supabase/functions/_shared/gobook-balance";

describe("GoBook balance snapshots", () => {
  it("keeps separate accounts and excludes other providers", () => {
    expect(goBookBalances([{ clientId: 158, providerId: 1, balance: 10, accountName: "Lights" }, { clientId: 158, providerId: 1, balance: 20, accountName: "Bookings" }, { clientId: 158, providerId: 2, balance: 900 }], 158, 1).map(a => a.balance)).toEqual([10, 20]);
  });
  it("returns only the requested client and provider refresh date", () => {
    expect(goBookBalance([{ clientId: 158, balance: 125.5, asAt: "2026-10-27T10:00:00Z" }, { clientId: 159, balance: 900 }], 158))
      .toEqual({ balance: 125.5, asAt: "2026-10-27T10:00:00Z" });
  });
  it("preserves zero and negative balances", () => {
    expect(goBookBalance([{ clientId: 158, balance: 0 }], 158)?.balance).toBe(0);
    expect(goBookBalance([{ clientId: 158, balance: -40 }], 158)?.balance).toBe(-40);
  });
  it("does not invent zero for missing or ambiguous balances", () => {
    expect(goBookBalance([{ clientId: 159, balance: 900 }], 158)).toBeNull();
    expect(goBookBalance([{ clientId: 158, balance: null }], 158)).toBeNull();
    expect(goBookBalance([{ clientId: 158, balance: 5 }, { clientId: 158, balance: 6 }], 158)).toBeNull();
  });
});

const source = readFileSync("supabase/functions/gobook-api/index.ts", "utf8").replace(/^import .*;$/gm, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function harness({ owner = true, enabled = true, linked = true, adminRole = false } = {}) {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const calls: string[] = [];
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/Authentication/Token") return Response.json({ success: true, token: "fake" });
    calls.push(url.pathname + url.search);
    return Response.json([{ clientId: 158, providerId: 1, balance: 125.5, asAt: "2026-10-27T10:00:00Z" }, { clientId: 159, providerId: 1, balance: 900 }]);
  });
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    rpc: async (name: string) => ({ data: name === "is_club_member" || adminRole }),
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q: any = {
        select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q; },
        maybeSingle: async () => ({ data: table === "club_secrets" ? { gobook_api_username: "fake", gobook_api_password: "fake" } :
          table === "clubs" ? { uses_gobook: enabled, gobook_api_enabled: enabled, gobook_provider_id: 1 } :
          filters.club_id === "club" && filters.id === "member" && (owner || !filters.user_id) ? { id: "member", gobook_client_id: linked ? 158 : null } : null }),
      };
      return q;
    },
  };
  vm.runInNewContext(compiled, { createClient: () => admin, goBookBalances, fetch, Request, Response, URL, AbortSignal: { timeout: () => undefined }, console,
    Deno: { env: { get: () => "fake" }, serve: (fn: typeof handler) => { handler = fn; } } });
  return { calls, run: (overrides = {}) => handler(new Request("http://localhost/balance", { method: "POST", headers: { Authorization: "Bearer fake" }, body: JSON.stringify({ action: "my_balance", club_id: "club", club_member_id: "member", client_id: 159, ...overrides }) })) };
}
describe("GoBook authenticated balance action", () => {
  it("uses the saved member link, ignores supplied client IDs, returns only that balance", async () => {
    const h = harness();
    expect(await (await h.run()).json()).toMatchObject({ state: "available", accounts: [{ balance: 125.5 }] });
    expect(h.calls).toEqual(["/Financials/Balances?clientId=158"]);
  });
  it("rejects another user's member profile", async () => {
    const h = harness({ owner: false });
    expect((await h.run()).status).toBe(403);
    expect(h.calls).toEqual([]);
  });
  it("rejects disabled club access", async () => {
    const h = harness({ enabled: false });
    expect((await h.run()).status).toBe(403);
    expect(h.calls).toEqual([]);
  });
  it("does not fetch or auto-link unlinked members", async () => {
    const h = harness({ linked: false });
    expect(await (await h.run()).json()).toMatchObject({ state: "not_linked", balance: null });
    expect(h.calls).toEqual([]);
  });
  it("retains existing admin access within the selected club", async () => {
    const h = harness({ owner: false, adminRole: true });
    expect((await h.run()).status).toBe(200);
    expect((await h.run({ club_id: "other-club" })).status).toBe(403);
  });
});