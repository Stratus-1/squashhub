import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the real edge handler with fake provider/database boundaries; no live services.
const source = readFileSync("supabase/functions/gobook-api/index.ts", "utf8")
  .replace(/^import .*https:\/\/esm\.sh\/.*;$/m, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
type Mirror = { id: string; external_id: string; date: string; status: string };
function harness() {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const mirrors: Mirror[] = [];
  const reads: string[] = [];
  const cancellations: string[] = [];
  let providerRows: unknown = [];
  let providerStatus = 200;
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/Authentication/Token") return Response.json({ success: true, token: "test-token" });
    if (url.pathname === "/Booking/List") {
      reads.push(url.search);
      return Response.json(providerRows, { status: providerStatus });
    }
    throw new Error(`Unexpected provider endpoint: ${url.pathname}`);
  });
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
    rpc: async () => ({ data: true }),
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let patch: any = null;
      let upsert: any = null;
      let ids: string[] | null = null;
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        like: () => query,
        limit: () => query,
        maybeSingle: () => query,
        update: (value: unknown) => { patch = value; return query; },
        upsert: (value: unknown) => { upsert = value; return query; },
        in: (_key: string, value: string[]) => { ids = value; return query; },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          const run = () => {
            if (table === "club_secrets") return { data: { gobook_api_username: "fake", gobook_api_password: "fake" } };
            if (table === "clubs") return { data: { gobook_service_id: 42 } };
            if (table === "courts") return { data: [{ id: "court", name: "Court 1" }] };
            if (table === "club_members") return { data: [] };
            if (table !== "bookings") throw new Error(`Unexpected table ${table}`);
            if (upsert) {
              const old = mirrors.find((m) => m.external_id === upsert.external_id);
              if (old) Object.assign(old, upsert);
              else mirrors.push({ id: `local-${upsert.external_id}`, ...upsert });
              return { data: null };
            }
            if (patch) {
              mirrors.filter((m) => ids?.includes(m.id)).forEach((m) => {
                Object.assign(m, patch); cancellations.push(m.id);
              });
              return { data: null };
            }
            return { data: mirrors.filter((m) => m.date === filters.date && m.status === "active") };
          };
          return Promise.resolve().then(run).then(resolve, reject);
        },
      };
      return query;
    },
  };
  vm.runInNewContext(compiled, {
    createClient: () => admin, fetch, Request, Response, URL, console,
    Deno: { env: { get: () => "test-only" }, serve: (fn: typeof handler) => { handler = fn; } },
  });
  return {
    mirrors, reads, cancellations,
    provider(rows: unknown, status = 200) { providerRows = rows; providerStatus = status; },
    sync(date: string) { return handler(new Request("http://localhost/sync", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync_core_day", club_id: "test-club", booking_date: date }) })); },
  };
}
const booking = (id: number, date: string) => ({ bookingId: id, bookingDate: date, consultantName: "Court 1", startTime: "18:00", endTime: "19:00", status: "A" });

describe("GoBook day reconciliation requires a fresh register", () => {
  it("does not cancel a booking created after the preceding sync", async () => {
    const h = harness();
    h.provider([]);
    expect((await h.sync("2026-10-11")).status).toBe(200);
    h.mirrors.push({ id: "new-local", external_id: "gobook:101", date: "2026-10-11", status: "active" });
    h.provider([booking(101, "2026-10-11")]);
    expect((await h.sync("2026-10-11")).status).toBe(200);
    expect(h.reads).toHaveLength(2);
    expect(h.mirrors[0].status).toBe("active");
    expect(h.cancellations).toEqual([]);
  });
  it("reads the requested day independently instead of reusing another day's response", async () => {
    const h = harness();
    h.provider([booking(101, "2026-10-11")]);
    await h.sync("2026-10-11");
    h.mirrors.push({ id: "day-b", external_id: "gobook:102", date: "2026-10-12", status: "active" });
    h.provider([booking(102, "2026-10-12")]);
    await h.sync("2026-10-12");
    expect(h.reads).toEqual([
      "?providerServiceId=42&bookingDate=2026-10-11&pastBookings=false",
      "?providerServiceId=42&bookingDate=2026-10-12&pastBookings=false",
    ]);
    expect(h.mirrors.every((m) => m.status === "active")).toBe(true);
    expect(h.cancellations).toEqual([]);
  });
  it("still cancels a removed booking when a fresh valid register confirms its absence", async () => {
    const h = harness();
    h.mirrors.push({ id: "removed", external_id: "gobook:103", date: "2026-10-11", status: "active" });
    h.provider([]);
    const result = await (await h.sync("2026-10-11")).json();
    expect(result.cancelled).toBe(1);
    expect(h.cancellations).toEqual(["removed"]);
  });
  it.each([200, 503])("preserves existing mirrors when the provider read is invalid or failed (%s)", async (status) => {
    const h = harness();
    h.mirrors.push({ id: "kept", external_id: "gobook:104", date: "2026-10-11", status: "active" });
    h.provider({ unexpected: true }, status);
    expect((await h.sync("2026-10-11")).status).toBeGreaterThanOrEqual(500);
    expect(h.mirrors[0].status).toBe("active");
    expect(h.cancellations).toEqual([]);
  });
});