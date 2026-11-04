import { beforeEach, describe, expect, mock, test } from "bun:test";

// Synthetic values only; no secrets or real ticket text.
const eventId = "11111111-1111-4111-8111-111111111111";
const ticketId = "22222222-2222-4222-8222-222222222222";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let operator = "approved@example.org";
let workloadEmail = "reader@example.iam.gserviceaccount.com";
let actor: string | null = actorId;
let applyResult: Record<string, unknown> = {};
let rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let emails: Record<string, unknown>[] = [];
const env: Record<string, string> = {
  HELP_CENTER_READ_AUDIENCE: "https://context.example.org",
  HELP_CENTER_CALLER_SERVICE_ACCOUNT: workloadEmail,
  HELP_CENTER_IAP_AUDIENCE: "/projects/example/apps/context",
  HELP_CENTER_TENANT_SCOPE: "squashhub-exact-tenant",
  HELP_CENTER_OPERATOR_EMAILS: '["approved@example.org","plain@example.org"]',
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "fictional-test-key",
};
let handler: (req: Request) => Promise<Response>;
Object.assign(globalThis, { Deno: { env: { get: (k: string) => env[k] }, serve: (fn: typeof handler) => { handler = fn; } } });

mock.module("npm:jose@6.2.3", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (token.startsWith("bad")) throw new Error("invalid signature");
    if (token.startsWith("workload")) return { payload: { sub: "w", email: workloadEmail, email_verified: true } };
    const now = Math.floor(Date.now() / 1000);
    return { payload: { sub: "o", email: operator, iat: now, exp: now + 600 } };
  },
}));
mock.module("../_shared/send-app-email.ts", () => ({
  sendAppEmail: async (args: Record<string, unknown>) => { emails.push(args); return { ok: true, sent: true }; },
}));
mock.module("npm:@supabase/supabase-js@2", () => ({ createClient: () => ({
  rpc: async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    if (name === "help_center_resolve_platform_operator") return { data: actor, error: null };
    return { data: applyResult, error: null };
  },
  from: (table: string) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({
      data: table === "support_threads" ? { id: ticketId, user_id: "owner-id", subject: "Synthetic" } : { email: "owner@example.org", name: "Owner" },
      error: null }) };
    return q;
  },
}) }));

await import("./index.ts");

const body = (extra: Record<string, unknown>) => JSON.stringify({
  contract_version: "1.0", event_id: eventId, expected_revision: 3,
  tenant_scope_ref: "squashhub-exact-tenant", idempotency_key: "idem-key-00000001", ...extra,
});
const call = (payload: string, headers: Record<string, string> = {}) => handler(new Request("https://fn.invalid/help-center-case-action", {
  method: "POST", body: payload,
  headers: {
    authorization: "Bearer workload-token-abcdefghijk",
    "x-help-center-operator-assertion": "iap-assertion",
    "x-help-center-tenant-scope": "squashhub-exact-tenant",
    ...headers,
  },
}));

describe("help-center-case-action", () => {
  beforeEach(() => {
    operator = "approved@example.org"; workloadEmail = env.HELP_CENTER_CALLER_SERVICE_ACCOUNT; actor = actorId;
    rpcCalls = []; emails = [];
    applyResult = { ok: true, replayed: false, action: "reply", source_revision: 4, resulting_status: "open", message_id: "m-1", ticket_id: ticketId };
  });

  test("rejects bad workload token, wrong workload account and non-allowlisted IAP operator before any database access", async () => {
    expect((await call(body({ action: "reply", message: "x" }), { authorization: "Bearer bad-token-abcdefghijklmnop" })).status).toBe(404);
    workloadEmail = "other@example.iam.gserviceaccount.com";
    expect((await call(body({ action: "reply", message: "x" }))).status).toBe(404);
    workloadEmail = env.HELP_CENTER_CALLER_SERVICE_ACCOUNT;
    operator = "stranger@example.org";
    expect((await call(body({ action: "reply", message: "x" }))).status).toBe(404);
    expect((await call(body({ action: "reply", message: "x" }), { "x-help-center-operator-assertion": "bad-iap" })).status).toBe(404);
    expect(rpcCalls.length).toBe(0);
  });

  test("rejects allowlisted operator who is not a SquashHub platform admin", async () => {
    operator = "plain@example.org"; actor = null;
    const res = await call(body({ action: "reply", message: "x" }));
    expect(res.status).toBe(403);
    expect(rpcCalls.map((c) => c.name)).toEqual(["help_center_resolve_platform_operator"]);
  });

  test("rejects wrong tenant in header or body", async () => {
    expect((await call(body({ action: "reply", message: "x" }), { "x-help-center-tenant-scope": "other" })).status).toBe(404);
    expect((await call(body({ action: "reply", message: "x", tenant_scope_ref: "other" }))).status).toBe(404);
    expect(rpcCalls.length).toBe(0);
  });

  test("rejects caller-supplied recipient and malformed shapes", async () => {
    expect((await call(body({ action: "reply", message: "x", recipient: "a@example.org" }))).status).toBe(400);
    expect((await call(body({ action: "set_status", target_status: "deleted" }))).status).toBe(400);
    expect((await call(body({ action: "reply", message: "x".repeat(4001) }))).status).toBe(400);
    expect((await call(body({ action: "reply", message: "x", contract_version: "2.0" }))).status).toBe(400);
  });

  test("held and stale events map to 409", async () => {
    applyResult = { ok: false, error: "event_held" };
    expect((await call(body({ action: "reply", message: "x" }))).status).toBe(409);
    applyResult = { ok: false, error: "stale_revision" };
    expect((await call(body({ action: "reply", message: "x" }))).status).toBe(409);
    expect(emails.length).toBe(0);
  });

  test("duplicate idempotency key replays the receipt without a second email; conflicting reuse is 409", async () => {
    applyResult = { ok: true, replayed: true, action: "reply", source_revision: 4, resulting_status: "open" };
    const res = await call(body({ action: "reply", message: "x" }));
    expect(res.status).toBe(200);
    expect((await res.json()).replayed).toBe(true);
    expect(emails.length).toBe(0);
    applyResult = { ok: false, error: "idempotency_conflict" };
    expect((await call(body({ action: "reply", message: "y" }))).status).toBe(409);
  });

  test("valid reply returns a compact receipt and emails only the ticket owner", async () => {
    const res = await call(body({ action: "reply", message: "Synthetic approved reply" }));
    expect(res.status).toBe(200);
    const receipt = await res.json();
    expect(receipt).toEqual({ contract_version: "1.0", action: "reply", source_revision: 4, resulting_status: "open", replayed: false, notification: "sent" });
    const apply = rpcCalls.find((c) => c.name === "help_center_apply_case_action")!;
    expect(apply.args.p_actor_user_id).toBe(actorId);
    expect(String(apply.args.p_request_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(emails.length).toBe(1);
    expect(emails[0].recipientEmail).toBe("owner@example.org");
    expect(emails[0].templateName).toBe("support-admin-reply");
  });

  test("valid status transition returns the resulting status and sends no email", async () => {
    applyResult = { ok: true, replayed: false, action: "set_status", source_revision: 5, resulting_status: "resolved" };
    const res = await call(body({ action: "set_status", target_status: "resolved" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contract_version: "1.0", action: "set_status", source_revision: 5, resulting_status: "resolved", replayed: false, notification: "not_applicable" });
    expect(rpcCalls.find((c) => c.name === "help_center_apply_case_action")!.args.p_target_status).toBe("resolved");
    expect(emails.length).toBe(0);
  });
});
