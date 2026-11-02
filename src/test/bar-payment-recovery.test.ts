import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { finaliseBarReference } from "../../supabase/functions/_shared/bar-payment-finalise";

type Row = Record<string, any>;
function database(tables: Record<string, Row[]>, failTab = false) {
  const filters: Array<[string, string, unknown]> = [];
  const admin = { from(table: string) {
    let update: Row | undefined;
    let limit = Infinity;
    const matches: Array<(r: Row) => boolean> = [];
    const q: any = {
      select() { return q; },
      eq(k: string, v: unknown) { matches.push(r => r[k] === v); return q; },
      neq(k: string, v: unknown) { matches.push(r => r[k] !== v); return q; },
      in(k: string, v: unknown[]) { matches.push(r => v.includes(r[k])); return q; },
      not() { return q; },
      lte(k: string, v: string) { filters.push([table, k, v]); matches.push(r => r[k] <= v); return q; },
      gte(k: string, v: string) { filters.push([table, k, v]); matches.push(r => r[k] >= v); return q; },
      order() { return q; }, limit(n: number) { limit = n; return q; },
      update(v: Row) { update = v; return q; },
      maybeSingle() { return execute(true); },
      then(resolve: any, reject: any) { return execute(false).then(resolve, reject); },
    };
    async function execute(single: boolean) {
      if (update && table === "bar_guest_tabs" && failTab) return { data: null, error: new Error("tab write failed") };
      const rows = (tables[table] || []).filter(r => matches.every(f => f(r))).slice(0, limit);
      if (update) rows.forEach(r => Object.assign(r, update));
      return { data: single ? rows[0] || null : rows, error: null };
    }
    return q;
  } };
  return { admin, filters };
}

async function handler(name: string, admin: any, fetchMock: any) {
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
  const ts = await import("typescript");
  const js = ts.transpile(source.replace(/^import[\s\S]*?;\s*$/gm, ""), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  let run: any;
  new Function("Deno", "createClient", "fetch", "finaliseBarReference", "Webhook", "finalisePayment", "lookupStitchStatus", "isCompletedState", "isFailedState", js)(
    { env: { get: () => "test" }, serve: (fn: any) => { run = fn; } },
    () => admin, fetchMock, finaliseBarReference, class {}, vi.fn(), vi.fn(), () => false, () => false,
  );
  return (body: Row) => run(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }));
}

const sale = (status = "pending") => ({ id: "sale", club_id: "club", guest_tab_id: "tab", payment_reference: "reference", payment_status: status, total: 60, created_at: "2026-10-27T16:00:00Z" });

describe("bar payment recovery", () => {
  it("repairs a paid sale's tab on retry without touching another club", async () => {
    const tables = { bar_visitor_sales: [sale("paid")], bar_guest_tabs: [{ id: "tab", club_id: "club", status: "closing" }, { id: "tab", club_id: "other", status: "open" }] };
    await finaliseBarReference(database(tables).admin, "club", "reference", "paid");
    expect(tables.bar_guest_tabs.map(t => t.status)).toEqual(["settled", "open"]);
    const closedAt = tables.bar_guest_tabs[0].closed_at;
    await finaliseBarReference(database(tables).admin, "club", "reference", "paid");
    expect(tables.bar_guest_tabs[0].closed_at).toBe(closedAt);
  });
  it("reports partial failure and recovers on replay", async () => {
    const tables = { bar_visitor_sales: [sale()], bar_guest_tabs: [{ id: "tab", club_id: "club", status: "closing" }] };
    await expect(finaliseBarReference(database(tables, true).admin, "club", "reference", "paid")).rejects.toThrow("tab write failed");
    expect(tables.bar_visitor_sales[0].payment_status).toBe("paid");
    await finaliseBarReference(database(tables).admin, "club", "reference", "paid");
    expect(tables.bar_guest_tabs[0].status).toBe("settled");
  });
  it("does not undo a paid tab for a delayed failure", async () => {
    const tables = { bar_visitor_sales: [sale("paid")], bar_guest_tabs: [{ id: "tab", club_id: "club", status: "settled" }] };
    await finaliseBarReference(database(tables).admin, "club", "reference", "failed");
    expect(tables.bar_visitor_sales[0].payment_status).toBe("paid");
    expect(tables.bar_guest_tabs[0].status).toBe("settled");
  });
  it("webhook verifies bar-only references rather than trusting a claimed PAID status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "pending" })));
    const run = await handler("stitch-webhook", database({ bar_visitor_sales: [sale()] }).admin, fetchMock);
    expect((await run({ id: "reference", status: "PAID" })).status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ sale_id: "sale" });
    expect(fetchMock.mock.calls[0][0]).toContain("bar-card-verify");
  });
  it("returns a retryable failure if bar verification fails", async () => {
    const run = await handler("stitch-webhook", database({ bar_visitor_sales: [sale()] }).admin, vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "write failed" }))));
    expect((await run({ id: "reference", status: "PAID" })).status).toBe(500);
  });
  it("backup checks a 27 October bar payment on 2 November", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T07:20:00Z"));
    try {
      const db = database({ bar_visitor_sales: [sale()] });
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "paid" })));
      const run = await handler("stitch-sweep-pending-payments", db.admin, fetchMock);
      expect((await (await run({})).json()).barPaid).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("an old unknown provider result retains its pending reference", async () => {
    const s = sale();
    const db = database({ bar_visitor_sales: [s], clubs: [{ id: "club", payment_gateway: "stitch" }], club_secrets: [{ club_id: "club", payment_gateway_credentials: { client_id: "test", client_secret: "test" } }] });
    const run = await handler("bar-card-verify", db.admin, vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    expect((await (await run({ sale_id: "sale" })).json()).status).toBe("pending");
    expect(s.payment_reference).toBe("reference");
    expect(s.payment_status).toBe("pending");
  });
});