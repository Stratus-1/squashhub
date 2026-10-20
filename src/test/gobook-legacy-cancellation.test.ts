import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Exercise the real reconciliation section with fictional provider/database state.
const source = readFileSync("supabase/functions/gobook-sync/index.ts", "utf8");
const start = source.indexOf("    // Reconcile active mirrors only after a successful provider read.");
const end = source.indexOf("\n  }\n\n  return result;", start);
if (start < 0 || end < 0) throw new Error("Legacy reconciliation section not found");
const compiled = ts.transpileModule(`async function reconcile() { ${source.slice(start, end)}; return result; }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

describe("legacy GoBook cancelled championship holds", () => {
  it.each(["2026-10-20", "2026-10-21"])("removes missing unused holds on %s and preserves games", async (dateStr) => {
    const rows = [
      { id: "unused", external_id: "unused", external_booker_name: "Club Championships", status: "active" },
      { id: "linked", external_id: "linked", external_booker_name: "Club Championships", status: "active" },
      { id: "member", external_id: "member", external_booker_name: "Club Championships", club_member_id: "fictional", status: "active" },
      { id: "present", external_id: "present", external_booker_name: "Club Championships", status: "active" },
      { id: "released", external_id: "released", external_booker_name: "Club Championships", status: "cancelled" },
    ];
    const admin = { from(table: string) {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      let ids: string[] = [];
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => { filters[key] = value; return q; },
        in: (_key: string, value: string[]) => { ids = value; return q; },
        update: (value: Record<string, unknown>) => { patch = value; return q; },
        then(resolve: (value: unknown) => unknown) {
          if (table === "club_champs_matches") return Promise.resolve({ data: [{ booking_id: "linked" }], error: null }).then(resolve);
          if (patch) rows.filter(r => ids.includes(r.id)).forEach(r => Object.assign(r, patch));
          return Promise.resolve({ data: patch ? null : rows.filter(r => r.status === filters.status), error: null }).then(resolve);
        },
      };
      return q;
    } };
    const ctx = vm.createContext({ admin, dateStr, clubId: "fictional-riverside", seenExternal: new Set(["present"]), result: { cancelled: 0 } });
    vm.runInContext(compiled, ctx);
    const result = await vm.runInContext("reconcile()", ctx);
    expect(result.cancelled).toBe(1);
    expect(rows.map(r => r.status)).toEqual(["cancelled", "active", "active", "active", "cancelled"]);
    expect((await vm.runInContext("reconcile()", ctx)).cancelled).toBe(1); // repeat refresh does not count released rows again
    expect(rows.filter(r => r.status === "active").map(r => r.id)).toEqual(["linked", "member", "present"]);
  });
});