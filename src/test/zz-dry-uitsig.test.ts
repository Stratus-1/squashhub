import { it } from "vitest";
import fs from "node:fs";
import { stageLifecycle, autoProgress } from "@/lib/tournaments/progression";
import type { Db } from "@/lib/tournaments/structured-persist";
it("dry", async () => {
  const t: Record<string, any[]> = {};
  for (const f of fs.readdirSync("/tmp/dry").filter((x) => x.endsWith(".json"))) t[f.replace(".json", "")] = JSON.parse(fs.readFileSync(`/tmp/dry/${f}`, "utf8"));
  const inserted: any[] = [];
  const match = (r: any, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => r[k] === v);
  let n = 0;
  const db: Db = {
    async insert(table, rows) { const out = rows.map((r) => ({ id: `new-${++n}`, ...r })); (t[table] ??= []).push(...out); inserted.push(...out.map((r) => ({ table, ...r }))); return out; },
    async select(table, f) { return (t[table] ?? []).filter((r) => match(r, f)); },
    async update() { throw new Error("no update"); },
  };
  const tid = "f954222a-0f0a-4d8c-ac7b-9c74042cc69e";
  const before = await stageLifecycle(db, tid);
  console.log(before.filter((s) => s.stageKey.includes("po")).map((s) => `${s.divisionLabel} ${s.name}: ${s.state} — ${s.detail}`).join("\n"));
  const r = await autoProgress(db, tid);
  console.log("started", r.started.map((s) => `${s.divisionLabel} ${s.name}`), "blocked", r.blocked.map((b) => b.detail));
  const names = new Map<string, string>();
  console.log(inserted.map((x) => x.table === "club_champs_matches" ? `MATCH g${x.group_number} r${x.round_number} #${x.bracket_position} ${x.stage_label} ${x.player_a_member_id} v ${x.player_b_member_id} play_by=${x.play_by ?? ""}` : `${x.table} ${x.stage_key ?? ""} r${x.round_number ?? ""}`).join("\n"));
  void names;
});
