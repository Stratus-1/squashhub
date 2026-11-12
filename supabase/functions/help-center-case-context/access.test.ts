import { beforeEach, describe, expect, mock, test } from "bun:test";

const eventId = "11111111-1111-4111-8111-111111111111";
const ticketId = "22222222-2222-4222-8222-222222222222";
const created = "2026-10-29T10:00:00Z";
let operator = "approved@example.org";
let workloadEmail = "reader@example.iam.gserviceaccount.com";
let held: string | null = null;
let status = "open";
let latestRevision = 3;
let latestId = eventId;
let reads: string[] = [];
let threadMissing = false;
let threadExists = true;
let eventMissing = false;
let eventType = "case.created";
let messagesFail = false;
let logs: string[] = [];
console.warn = (line: string) => { logs.push(String(line)); };
console.log = (line: string) => { logs.push(String(line)); };
const env: Record<string, string> = {
  HELP_CENTER_READ_AUDIENCE: "https://context.example.org",
  HELP_CENTER_CALLER_SERVICE_ACCOUNT: workloadEmail,
  HELP_CENTER_IAP_AUDIENCE: "/projects/example/apps/context",
  HELP_CENTER_TENANT_SCOPE: "squashhub-exact-tenant",
  HELP_CENTER_OPERATOR_EMAILS: '["approved@example.org"]',
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "fictional-test-key",
};
let handler: (req: Request) => Promise<Response>;
Object.assign(globalThis, { Deno: {
  env: { get: (key: string) => env[key] },
  serve: (fn: typeof handler) => { handler = fn; },
} });
mock.module("npm:jose@6.2.3", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string, _keys: unknown, options: { issuer: string | string[]; audience: string; algorithms: string[] }) => {
    if (token.startsWith("workload")) {
      expect(options.audience).toBe(env.HELP_CENTER_READ_AUDIENCE);
      expect(options.algorithms).toEqual(["RS256"]);
      return { payload: { sub: "workload-subject", email: workloadEmail, email_verified: true } };
    }
    expect(options.audience).toBe(env.HELP_CENTER_IAP_AUDIENCE);
    expect(options.issuer).toBe("https://cloud.google.com/iap");
    expect(options.algorithms).toEqual(["ES256"]);
    const now = Math.floor(Date.now() / 1000);
    return { payload: { sub: "operator-subject", email: operator, iat: now, exp: now + 600 } };
  },
}));
mock.module("npm:@supabase/supabase-js@2", () => ({ createClient: () => ({
  from: (table: string) => {
    reads.push(table);
    // There is no pilot membership: querying the pilot list fails this test.
    if (table === "support_threads") {
      // Diagnostic existence check must be head-only (no columns or content).
      return { select: (_cols: string, opts: { head?: boolean; count?: string }) => {
        expect(opts).toEqual({ count: "exact", head: true });
        return { eq: async () => ({ count: threadExists ? 1 : 0, data: null, error: null }) };
      } };
    }
    expect(table).toBe("help_center_ticket_outbox");
    let latest = false;
    const query = {
      select: () => query, eq: () => query,
      order: () => { latest = true; return query; }, limit: () => query,
      maybeSingle: async () => ({ data: latest
        ? { event_id: latestId, revision: latestRevision }
        : eventMissing ? null : { event_id: eventId, ticket_id: ticketId, status, revision: 3, ticket_created_at: created, ticket_updated_at: created, event_type: eventType, held_at: held }, error: null }),
    };
    return query;
  },
  rpc: (name: string) => {
    reads.push(name);
    if (name === "help_center_case_context_thread") return { maybeSingle: async () => ({ data: threadMissing ? null : { ticket_id: ticketId, subject: "Synthetic support question", status, created_at: created, updated_at: created }, error: null }) };
    expect(name).toBe("help_center_case_context_messages");
    if (messagesFail) return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Synthetic excerpt " + ticketId } });
    return Promise.resolve({ data: [{ author_role: "reporter", body: "Synthetic excerpt", created_at: created, sender_id: "private", attachments: ["private"] }], error: null });
  },
}) }));
await import("./index.ts");

function request(tenant = env.HELP_CENTER_TENANT_SCOPE) {
  return new Request(`https://context.example.org/${eventId}`, { headers: {
    authorization: "Bearer workload-token-long-enough",
    "x-help-center-operator-assertion": "operator-token",
    "x-help-center-tenant-scope": tenant,
  } });
}
beforeEach(() => {
  operator = "approved@example.org";
  workloadEmail = env.HELP_CENTER_CALLER_SERVICE_ACCOUNT;
  held = null; status = "open"; latestRevision = 3; latestId = eventId; reads = [];
  threadMissing = false; threadExists = true; eventMissing = false; eventType = "case.created"; messagesFail = false; logs = [];
  env.HELP_CENTER_OPERATOR_EMAILS = '["approved@example.org"]';
  env.HELP_CENTER_TENANT_SCOPE = "squashhub-exact-tenant";
});

const SENSITIVE = [eventId, ticketId, "approved@example.org", "unapproved@example.org", "reader@example", "squashhub-exact-tenant", "other-tenant", "Synthetic", "fictional-test-key"];
async function expectDiag(req: Request, status: number, code: string) {
  const response = await handler(req);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: "case_context_unavailable" });
  expect(logs.length).toBe(1);
  const entry = JSON.parse(logs[0]);
  expect(entry.fn).toBe("help-center-case-context");
  expect(entry.diag_code).toBe(code);
  for (const value of SENSITIVE) expect(logs[0]).not.toContain(value);
  return entry;
}
describe("Live read-only case context", () => {
  test("authorized non-allowlisted active ticket succeeds without identities or attachments", async () => {
    const response = await handler(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.event_id).toBe(eventId);
    expect(body.messages[0].body).toBe("Synthetic excerpt");
    expect(JSON.stringify(body)).not.toContain("private");
    expect(reads).not.toContain("help_center_pilot_allowlist");
  });
  test("wrong operator fails before reading support data", async () => {
    operator = "unapproved@example.org";
    expect((await handler(request())).status).toBe(404);
    expect(reads).toEqual([]);
  });
  test("wrong service account fails before reading support data", async () => {
    workloadEmail = "other@example.iam.gserviceaccount.com";
    expect((await handler(request())).status).toBe(404);
    expect(reads).toEqual([]);
  });
  test("wrong tenant fails before reading support data", async () => {
    expect((await handler(request("other-tenant"))).status).toBe(404);
    expect(reads).toEqual([]);
  });
  test("held event fails", async () => {
    held = created;
    expect((await handler(request())).status).toBe(404);
    expect(reads).not.toContain("help_center_case_context_messages");
  });
  test("stale revision fails", async () => {
    latestRevision = 4;
    expect((await handler(request())).status).toBe(404);
  });
  test("superseded source event fails", async () => {
    latestId = "33333333-3333-4333-8333-333333333333";
    expect((await handler(request())).status).toBe(404);
  });
  test("closed ticket fails", async () => {
    status = "closed";
    expect((await handler(request())).status).toBe(404);
    expect(reads).not.toContain("help_center_case_context_messages");
  });
});

describe("Sanitized diagnostic codes", () => {
  test("success logs only a served code and message count", async () => {
    expect((await handler(request())).status).toBe(200);
    expect(logs.map((l) => JSON.parse(l))).toEqual([{ fn: "help-center-case-context", diag_code: "served", messages: 1 }]);
  });
  test("missing config names only", async () => {
    env.HELP_CENTER_TENANT_SCOPE = "";
    const entry = await expectDiag(request(""), 404, "missing_config");
    expect(entry.missing).toEqual(["HELP_CENTER_TENANT_SCOPE"]);
    expect(reads).toEqual([]);
  });
  test("missing or malformed allowlist", async () => {
    env.HELP_CENTER_OPERATOR_EMAILS = "not json";
    await expectDiag(request(), 404, "missing_allowlist");
    expect(reads).toEqual([]);
  });
  test("missing workload token", async () => {
    await expectDiag(new Request(`https://context.example.org/${eventId}`), 404, "missing_workload_token");
  });
  test("workload identity mismatch", async () => {
    workloadEmail = "other@example.iam.gserviceaccount.com";
    await expectDiag(request(), 404, "workload_identity_mismatch");
  });
  test("operator not allowlisted", async () => {
    operator = "unapproved@example.org";
    await expectDiag(request(), 404, "operator_not_allowlisted");
  });
  test("tenant mismatch", async () => {
    await expectDiag(request("other-tenant"), 404, "tenant_mismatch");
    expect(reads).toEqual([]);
  });
  test("missing, held and wrong-type events", async () => {
    eventMissing = true;
    await expectDiag(request(), 404, "event_not_found");
    eventMissing = false; logs = []; held = created;
    await expectDiag(request(), 404, "event_held");
    held = null; logs = []; eventType = "case.deleted";
    await expectDiag(request(), 404, "event_wrong_type");
  });
  test("missing vs inactive ticket via head-only check", async () => {
    threadMissing = true; threadExists = false;
    await expectDiag(request(), 404, "thread_not_found");
    logs = []; threadExists = true;
    await expectDiag(request(), 404, "ticket_inactive");
    expect(reads).not.toContain("help_center_case_context_messages");
  });
  test("stale event and stale revision", async () => {
    latestId = "33333333-3333-4333-8333-333333333333";
    await expectDiag(request(), 404, "stale_event");
    latestId = eventId; logs = []; latestRevision = 4;
    await expectDiag(request(), 404, "stale_revision");
  });
  test("message RPC failure keeps 503 and logs only the error code", async () => {
    messagesFail = true;
    const entry = await expectDiag(request(), 503, "messages_rpc_failed");
    expect(entry.db_code).toBe("PGRST202");
  });
});
