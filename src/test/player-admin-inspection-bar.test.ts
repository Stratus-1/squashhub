import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { gatewayEnabled, resolveGatewayCreds } from "../../supabase/functions/_shared/gateway-creds";

const compiled = ts.transpile(readFileSync("supabase/functions/player-admin-inspection/index.ts", "utf8").replace(/^import .*;\s*$/gm, ""), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
const clubId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
function bridge(club: Record<string, unknown> = {}, credentials: Record<string, unknown> = {}, options: { order?: boolean; error?: boolean; previewError?: boolean; email?: string; status?: string; secret?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "mobile_internal_secret_ok") return { data: options.secret !== false };
    if (name === "resolve_qr_short_code") return { data: { found: true, bar_enabled: true, club: {}, menu: [] } };
    if (name === "bar_order_process_status") return { data: options.order ?? false, error: options.error ? {} : null };
    if (name === "bar_account_charge_preview") return { data: [{ bar_gated: true, shop_gated: false, current_owing: 750, allowance: 1050, private_field: "excluded" }], error: options.previewError ? {} : null };
    return { data: null };
  });
  const from = vi.fn((table: string) => {
    const query: any = { select: () => query, eq: () => query, is: () => query, in: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: table === "club_members" ? { id: memberId, user_id: "login", status: options.status ?? "active" }
        : table === "clubs" ? { honesty_bar_enabled: true, bar_order_process_enabled: true, ...club }
        : table === "qr_short_codes" ? { code: "menu" }
        : table === "club_secrets" ? { payment_gateway_credentials: credentials } : null }) };
    return query;
  });
  let handler: ((r: Request) => Promise<Response>) | undefined;
  new Function("Deno", "createClient", "gatewayEnabled", "resolveGatewayCreds", compiled)(
    { env: { get: () => "runtime" }, serve: (h: typeof handler) => { handler = h; } },
    () => ({ rpc, from, auth: { admin: { getUserById: async () => ({ data: { user: { email: options.email ?? "member@example.test" } } }) } } }), gatewayEnabled, resolveGatewayCreds);
  const send = async (action = "player_bar_data") => {
    if (!handler) throw new Error("No handler");
    return handler(new Request("https://bridge.example.test", { method: "POST", headers: { "x-squashhub-internal-secret": "s".repeat(32) }, body: JSON.stringify({ action, clubId, memberId, email: "member@example.test" }) }));
  };
  return { send, rpc, from };
}
describe("Player Bar settings parity", () => {
  it.each([false, true])("uses authoritative order status %s rather than the raw switch", async (order) => {
    const b = bridge({}, {}, { order });
    expect((await (await b.send()).json()).orderProcessEnabled).toBe(order);
    expect(b.rpc).toHaveBeenCalledWith("bar_order_process_status", { _club_id: clubId });
  });
  it("fails closed on unreadable order status", async () => expect((await bridge({}, {}, { error: true }).send()).status).toBe(503));
  it.each([
    ["stitch", [], { client_id: "id", client_secret: "secret" }, true],
    ["yoco", [], { secret_key: "key" }, true],
    ["payfast", [], { merchant_id: "id", merchant_key: "key" }, true],
    ["paynow", ["payfast"], { __gateways: { payfast: { merchant_id: "id", merchant_key: "key" } } }, true],
    ["paynow", ["yoco"], { __gateways: { yoco: { secret_key: "key" } } }, false],
    ["stitch", ["payfast"], { __gateways: { payfast: { merchant_id: "id", merchant_key: "key" } } }, false],
    ["yoco", [], {}, false], ["stitch", [], { client_id: "id" }, false], ["payfast", [], { merchant_id: "id" }, false],
  ])("matches downstream selection/setup for %s %j", async (primary, additional, creds, enabled) => {
    const b = bridge({ payment_gateway: primary, payment_gateways: additional }, creds as Record<string, unknown>);
    const data = await (await b.send()).json();
    expect(data.onlinePaymentEnabled).toBe(enabled);
    expect(data.club.pay_online_enabled).toBe(enabled);
    if (!enabled) expect((await b.send("player_bar_online_checkout")).status).toBe(403);
  });
  it("preserves the online-payment switch", async () => {
    const b = bridge({ payment_gateway: "yoco", bar_pay_online_enabled: false }, { secret_key: "key" });
    expect((await (await b.send()).json()).onlinePaymentEnabled).toBe(false);
    expect((await b.send("player_bar_online_checkout")).status).toBe(403);
  });
  it("returns only this verified member's four preview fields", async () => {
    const b = bridge();
    expect((await (await b.send()).json()).accountChargePreview).toEqual({ bar_gated: true, shop_gated: false, current_owing: 750, allowance: 1050 });
    expect(b.rpc).toHaveBeenCalledWith("bar_account_charge_preview", { _club_member_id: memberId, _sync_secret: "s".repeat(32) });
  });
  it("keeps preview errors advisory", async () => expect((await (await bridge({}, {}, { previewError: true }).send()).json()).accountChargePreview).toBeNull());
  it.each([{ email: "other@example.test" }, { status: "suspended" }, { secret: false }])("rejects unverified identity %j before preview", async (options) => {
    const b = bridge({}, {}, options);
    expect((await b.send()).status).toBe(options.secret === false ? 401 : 403);
    expect(b.rpc.mock.calls.some(([name]) => name === "bar_account_charge_preview")).toBe(false);
  });
});