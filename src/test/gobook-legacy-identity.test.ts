import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

const source = readFileSync("supabase/functions/gobook-sync/index.ts", "utf8");
const start = source.indexOf("    const seenExternal = new Set<string>();");
const end = source.indexOf("    // Reconcile active mirrors", start);
if (start < 0 || end < 0) throw new Error("Legacy import section missing");
const compiled = ts.transpileModule(`async function sync() { ${source.slice(start, end)} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

it("legacy refresh retains cancelled provider identity and never overwrites an occupying hold", async () => {
  const rows: any[] = [
    { id: "canonical", external_id: "20261020-1-18", status: "cancelled", club_member_id: "player", court_id: 27, date: "2026-10-20", start_time: "18:00:00" },
    { id: "occupying", external_id: "other-id", status: "active", court_id: 27, date: "2026-10-20", start_time: "18:00:00" },
  ];
  const admin = { from(table: string) {
    const filters: Record<string, unknown> = {};
    let patch: any;
    const q: any = {
      select: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { filters[k] = v; return q; },
      maybeSingle: () => q,
      update: (v: unknown) => { patch = v; return q; },
      insert: () => { throw new Error("Existing identity must not be inserted"); },
      then(resolve: (v: unknown) => unknown) {
        if (table === "club_champs_matches") return Promise.resolve({ data: null }).then(resolve);
        const matching = rows.filter(r => Object.entries(filters).every(([k,v]) => k === "club_id" || k === "source" || r[k] === v));
        if (patch) matching.forEach(r => Object.assign(r, patch));
        return Promise.resolve({ data: matching[0] ?? null }).then(resolve);
      },
    };
    return q;
  } };
  const result = { synced: 0 };
  const ctx = vm.createContext({ admin, result, clubId: "fictional-riverside", dateStr: "2026-10-20", dateKey: () => "20261020", courtMap: new Map([[1,27]]), nameMap: new Map(), slots: [{ free: false, bookerName: "Club Championships", courtNumber: 1, startHour: 18 }], console });
  vm.runInContext(compiled, ctx);
  await vm.runInContext("sync()", ctx);
  expect(rows.map(r => r.external_id)).toEqual(["20261020-1-18", "other-id"]);
  expect(result.synced).toBe(0);
  rows[1].status = "cancelled";
  await vm.runInContext("sync()", ctx);
  expect(rows[0]).toMatchObject({ id: "canonical", status: "active", club_member_id: "player" });
  expect(result.synced).toBe(1);
});