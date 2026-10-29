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
    expect(table).toBe("help_center_ticket_outbox");
    let latest = false;
    const query = {
      select: () => query, eq: () => query,
      order: () => { latest = true; return query; }, limit: () => query,
      maybeSingle: async () => ({ data: latest
        ? { event_id: latestId, revision: latestRevision }
        : { event_id: eventId, ticket_id: ticketId, status, revision: 3, ticket_created_at: created, ticket_updated_at: created, event_type: "case.created", held_at: held }, error: null }),
    };
    return query;
  },
  rpc: (name: string) => {
    reads.push(name);
    if (name === "help_center_case_context_thread") return { maybeSingle: async () => ({ data: { ticket_id: ticketId, subject: "Synthetic support question", status, created_at: created, updated_at: created }, error: null }) };
    expect(name).toBe("help_center_case_context_messages");
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
});
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