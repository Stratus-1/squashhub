import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { expiredChampHold } from "../../supabase/functions/_shared/champ-hold-release";
import { champsSlotStarts } from "../lib/tournaments/self-schedule";

// Execute the real edge handler with fake provider/database boundaries; no live services.
const source = readFileSync("supabase/functions/gobook-api/index.ts", "utf8")
  .replace(/^import .*https:\/\/esm\.sh\/.*;$/m, "")
  .replace(/^import .*champ-hold-release.*;$/m, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
type Mirror = { id: string; external_id: string; date: string; status: string; external_booker_name?: string; club_member_id?: string; court_id?: string; start_time?: string; end_time?: string };
function harness(clubId = "test-club", linkedIds: string[] = [], now = "2026-10-20T10:34:00Z") {
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
      let single = false;
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        like: () => query,
        limit: () => query,
        maybeSingle: () => { single = true; return query; },
        update: (value: unknown) => { patch = value; return query; },
        upsert: (value: unknown) => { upsert = value; return query; },
        in: (_key: string, value: string[]) => { ids = value; return query; },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          const run = () => {
            if (table === "club_secrets") return { data: { gobook_api_username: "fake", gobook_api_password: "fake" } };
            if (table === "clubs") return { data: { gobook_service_id: 42 } };
            if (table === "courts") return { data: [{ id: "court", name: "Court 1" }] };
            if (table === "club_members") return { data: [] };
            // The sync protects fixture-linked bookings: no links in this harness.
            if (table === "club_champs_matches") {
              const links = linkedIds.filter(id => !filters.booking_id || id === filters.booking_id).map((booking_id) => ({ booking_id }));
              return { data: single ? links[0] ?? null : links };
            }
            if (table !== "bookings") throw new Error(`Unexpected table ${table}`);
            if (upsert) {
              // PostgreSQL checks overlaps BEFORE resolving the upsert identity.
              const clash = mirrors.find(m => m.status === "active" && m.date === upsert.date && m.court_id === upsert.court_id && m.start_time === upsert.start_time && m.id !== upsert.id);
              if (clash) return { data: null, error: { code: "23P01" } };
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
            const matches = mirrors.filter(m => Object.entries(filters).every(([key, value]) => key === "club_id" || key === "source" || (m as any)[key] === value));
            return { data: single ? matches[0] ?? null : matches };
          };
          return Promise.resolve().then(run).then(resolve, reject);
        },
      };
      return query;
    },
  };
  vm.runInNewContext(compiled, {
    createClient: () => admin, fetch, Request, Response, URL, console,
    expiredChampHold: (club: string, date: string, name: unknown) => expiredChampHold(club, date, name, new Date(now)),
    Deno: { env: { get: () => "test-only" }, serve: (fn: typeof handler) => { handler = fn; } },
  });
  return {
    mirrors, reads, cancellations,
    provider(rows: unknown, status = 200) { providerRows = rows; providerStatus = status; },
    sync(date: string) { return handler(new Request("http://localhost/sync", { method: "POST", headers: { Authorization: "Bearer test-only", "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync_core_day", club_id: clubId, booking_date: date }) })); },
  };
}
const booking = (id: number, date: string) => ({ bookingId: id, bookingDate: date, consultantName: "Court 1", startTime: "18:00", endTime: "19:00", status: "A" });

describe("GoBook day reconciliation requires a fresh register", () => {
  it("refreshes an already-recorded active booking using its stable UUID", async () => {
    const h = harness();
    h.mirrors.push({ id: "stable", external_id: "gobook:101", date: "2026-10-20", status: "active", court_id: "court", start_time: "18:00:00" });
    h.provider([booking(101, "2026-10-20")]);
    const result = await (await h.sync("2026-10-20")).json();
    expect(result).toMatchObject({ success: true, synced: 1, skipped: 0 });
    expect(h.mirrors).toHaveLength(1);
    expect(h.mirrors[0].id).toBe("stable");
  });
  it("never renames an occupying hold to a cancelled booking's existing external ID", async () => {
    const h = harness();
    h.mirrors.push(
      { id: "canonical", external_id: "gobook:101", date: "2026-10-20", status: "cancelled", club_member_id: "player", court_id: "court", start_time: "18:00:00" },
      { id: "old-hold", external_id: "gobook:102", date: "2026-10-20", status: "active", external_booker_name: "Club Championships", court_id: "court", start_time: "18:00:00" },
    );
    h.provider([booking(101, "2026-10-20")]);
    expect((await h.sync("2026-10-20")).status).toBe(200);
    expect(h.mirrors.map(m => m.external_id)).toEqual(["gobook:101", "gobook:102"]);
    expect(h.mirrors[1].status).toBe("cancelled");
    expect((await h.sync("2026-10-20")).status).toBe(200);
    expect(h.mirrors[0]).toMatchObject({ id: "canonical", status: "active", club_member_id: "player" });
  });
  it("preserves fixture-linked booking ownership and allocation when a provider hold remains", async () => {
    const h = harness("test-club", ["linked"]);
    h.mirrors.push({ id: "linked", external_id: "gobook:101", date: "2026-10-20", status: "active", club_member_id: "player", start_time: "18:45:00" });
    h.provider([{ ...booking(101, "2026-10-20"), pcMappingText: "Club Championships" }]);
    expect((await h.sync("2026-10-20")).status).toBe(200);
    expect(h.mirrors[0]).toMatchObject({ club_member_id: "player", start_time: "18:45:00", status: "active" });
  });
  it.each(["2026-10-20T09:50:00Z", "2026-10-20T12:50:00Z"])("removes cancelled championship holds on refresh at %s without a cron", async (now) => {
    const h = harness("d8397b8a-60d3-4c4b-afee-25dab218bf19", ["linked"], now);
    h.mirrors.push(
      { id: "removed", external_id: "gobook:101", date: "2026-10-20", status: "active", external_booker_name: "Club Championships" },
      { id: "linked", external_id: "gobook:102", date: "2026-10-20", status: "active", external_booker_name: "Club Championships" },
      { id: "member", external_id: "gobook:103", date: "2026-10-20", status: "active", external_booker_name: "Club Championships", club_member_id: "synthetic-member" },
    );
    h.provider([]);
    expect((await h.sync("2026-10-20")).status).toBe(200);
    expect(h.mirrors.map(m => m.status)).toEqual(["cancelled", "active", "active"]);
    expect(h.cancellations).toEqual(["removed"]);
    await h.sync("2026-10-20");
    expect(h.cancellations).toEqual(["removed"]);
    expect(h.reads).toHaveLength(2);
  });
  it("uses a current GoBook championship hold after noon as free capacity", async () => {
    const h = harness("d8397b8a-60d3-4c4b-afee-25dab218bf19");
    h.mirrors.push({ id: "released", external_id: "gobook:101", date: "2026-10-20", status: "cancelled", external_booker_name: "Club Championships" });
    h.provider([{ ...booking(101, "2026-10-20"), pcMappingText: "Club Championships" }]);
    expect((await h.sync("2026-10-20")).status).toBe(200);
    expect(h.mirrors[0].status).toBe("active");
    const capacity = h.mirrors.map(m => ({ ...m, court_id: 27, start_time: "18:00", end_time: "19:00" }));
    expect(champsSlotStarts(capacity, 45).get(27)).toEqual(["18:00"]);
    h.provider([]);
    await h.sync("2026-10-20");
    expect(h.mirrors[0].status).toBe("cancelled");
    expect(champsSlotStarts(h.mirrors.map(m => ({ ...m, court_id: 27, start_time: "18:00", end_time: "19:00" })), 45).size).toBe(0);
  });
  it("releases unused reimported holds but preserves linked and member-owned rows", async () => {
    const h = harness("d8397b8a-60d3-4c4b-afee-25dab218bf19", ["linked"]);
    h.mirrors.push(
      { id: "unused", external_id: "gobook:101", date: "2026-10-20", status: "active", external_booker_name: "Club Championships" },
      { id: "linked", external_id: "gobook:102", date: "2026-10-20", status: "active", external_booker_name: "Club Championships" },
      { id: "member", external_id: "gobook:103", date: "2026-10-20", status: "active", external_booker_name: "Club Championships", club_member_id: "synthetic-member" },
    );
    h.provider([]);
    await h.sync("2026-10-20");
    expect(h.mirrors.map((m) => m.status)).toEqual(["cancelled", "active", "active"]);
    expect(h.cancellations).toEqual(["unused"]);
  });
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