import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

const clubId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const email = "player@example.test";
const fee = "33333333-3333-4333-8333-333333333333";
const basePath = `/mobile-checkout?gateway=yoco&purpose=fee&amount=125.00&fee_ids=${fee}`;
type Handler = (req: Request) => Promise<Response>;
let compiled: string;

beforeAll(() => {
  const source = readFileSync("supabase/functions/player-admin-inspection/index.ts", "utf8");
  compiled = ts.transpile(source.replace(/^import .*;\s*$/gm, ""), {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  });
});

function bridge(options: { secretOk?: boolean; status?: string; subdomain?: string | null; linkedEmail?: string; wrongClub?: boolean; linked?: boolean } = {}) {
  const generateLink = vi.fn().mockResolvedValue({ data: { properties: { action_link: "https://auth.example.test/one-time" } }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: options.secretOk ?? true });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: table === "clubs"
        ? { subdomain: options.subdomain === undefined ? "riverside" : options.subdomain }
        : options.wrongClub || filters.id !== memberId || filters.club_id !== clubId ? null
        : { id: memberId, club_id: clubId, user_id: options.linked === false ? null : "login-id", status: options.status ?? "active" } }),
    };
    return query;
  });
  const db = { rpc, from, auth: { admin: {
    getUserById: vi.fn().mockResolvedValue({ data: { user: { email: options.linkedEmail ?? email } } }), generateLink,
  } } };
  let handler: Handler | undefined;
  new Function("Deno", "createClient", compiled)({ env: { get: () => "test-runtime-value" }, serve: (fn: Handler) => { handler = fn; } }, () => db);
  const send = async (overrides: Record<string, unknown> = {}, secret = "s".repeat(32)) => {
    if (!handler) throw new Error("Handler was not registered");
    return handler(new Request("https://bridge.example.test", {
      method: "POST", headers: { "x-squashhub-internal-secret": secret },
      body: JSON.stringify({ action: "player_billing_link", clubId, memberId, email, destination: "payment-checkout", redirectPath: basePath, ...overrides }),
    }));
  };
  return { send, generateLink, rpc, from };
}

describe("Player native checkout bridge", () => {
  it.each(["yoco", "stitch", "paynow", "payfast"])("passes the exact %s checkout path to magic-link generation", async (gateway) => {
    const b = bridge();
    const path = basePath.replace("gateway=yoco", `gateway=${gateway}`);
    const response = await b.send({ redirectPath: path });
    expect(response.status).toBe(200);
    expect((await response.json()).redirectTo).toBe(`https://riverside.squashhub.co.za${path}`);
    expect(b.generateLink).toHaveBeenCalledWith({ type: "magiclink", email, options: { redirectTo: `https://riverside.squashhub.co.za${path}` } });
  });
  it.each([",", "%2c"])("accepts %s-separated fee IDs and an optional description unchanged", async (separator) => {
    const b = bridge();
    const path = `${basePath}${separator}${fee}&description=Club%20fees`;
    expect((await b.send({ redirectPath: path })).status).toBe(200);
    expect(b.generateLink.mock.calls[0][0].options.redirectTo).toBe(`https://riverside.squashhub.co.za${path}`);
  });
  it.each(["yoco", "stitch", "paynow", "payfast"])("passes the exact %s wallet top-up path to magic-link generation", async (gateway) => {
    const b = bridge();
    const path = `/mobile-checkout?gateway=${gateway}&purpose=topup&amount=500.00`;
    const response = await b.send({ redirectPath: path });
    expect(response.status).toBe(200);
    expect((await response.json()).redirectTo).toBe(`https://riverside.squashhub.co.za${path}`);
    expect(b.generateLink).toHaveBeenCalledWith({ type: "magiclink", email, options: { redirectTo: `https://riverside.squashhub.co.za${path}` } });
  });
  it("accepts a top-up path with an optional description unchanged", async () => {
    const b = bridge();
    const path = "/mobile-checkout?gateway=stitch&purpose=topup&amount=250.50&description=Wallet%20top-up";
    expect((await b.send({ redirectPath: path })).status).toBe(200);
    expect(b.generateLink.mock.calls[0][0].options.redirectTo).toBe(`https://riverside.squashhub.co.za${path}`);
  });
  it.each([
    undefined, null, 42, "", "/my-account", `https://evil.example${basePath}`, `//evil.example${basePath}`,
    basePath.replace("yoco", "other"), basePath.replace("purpose=fee", "purpose=topup"),
    basePath.replace("125.00", "125"), basePath.replace("125.00", "125.0"), basePath.replace("125.00", "-125.00"),
    basePath.replace(fee, ""), basePath.replace(fee, "XYZ"), `${basePath}%2C${fee}`,
    `${basePath}&extra=1`, `${basePath}#fragment`, `${basePath}\n`, `${basePath}&description=text#fragment`,
    "/mobile-checkout?gateway=yoco&purpose=topup&amount=500.00&fee_ids=" + fee,
    "/mobile-checkout?gateway=yoco&purpose=topup&amount=500",
    "/mobile-checkout?gateway=yoco&purpose=topup&amount=-500.00",
    "/mobile-checkout?gateway=yoco&purpose=topup&amount=500.0",
    "/mobile-checkout?gateway=yoco&purpose=topup",
    "/mobile-checkout?gateway=yoco&purpose=topup&amount=500.00&fee_ids=",
    "/mobile-checkout?gateway=other&purpose=topup&amount=500.00",
    "/mobile-checkout?gateway=yoco&purpose=topup&amount=500.00&fee_ids=" + fee + "&description=x",
  ])("rejects invalid checkout redirect %j without creating a link", async (path) => {
    const b = bridge();
    expect((await b.send({ redirectPath: path })).status).toBe(400);
    expect(b.generateLink).not.toHaveBeenCalled();
  });
  it.each([undefined, "billing", "my-account", "other"])("preserves legacy redirect for destination %j", async (destination) => {
    const b = bridge();
    const response = await b.send({ destination, redirectPath: "https://ignored.example" });
    expect(response.status).toBe(200);
    expect((await response.json()).redirectTo).toBe("https://riverside.squashhub.co.za/mobile-billing?mobile_token=session");
  });
  it.each(["payment-checkout", "billing"])("uses the non-www root origin for %s", async (destination) => {
    const b = bridge({ subdomain: null });
    const response = await b.send({ destination });
    expect((await response.json()).redirectTo).toBe(`https://squashhub.co.za${destination === "payment-checkout" ? basePath : "/mobile-billing?mobile_token=session"}`);
  });
  it("denies invalid internal secrets before membership or link generation", async () => {
    const b = bridge({ secretOk: false });
    expect((await b.send()).status).toBe(401);
    expect(b.from).not.toHaveBeenCalled();
    expect(b.generateLink).not.toHaveBeenCalled();
  });
  it("denies missing internal secrets before RPCs", async () => {
    const b = bridge();
    expect((await b.send({}, "")).status).toBe(401);
    expect(b.rpc).not.toHaveBeenCalled();
  });
  it.each([{ status: "suspended" }, { wrongClub: true }, { linked: false }, { linkedEmail: "other@example.test" }])("preserves membership and email guard %j", async (options) => {
    const b = bridge(options);
    expect((await b.send()).status).toBe(403);
    expect(b.generateLink).not.toHaveBeenCalled();
  });
});