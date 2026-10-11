import { spawnSync } from "bun";
import { checkDeferredSetup, setupOk, specWithSetup } from "./src/lib/tournaments/progression";
import { bufferedDb, loadEntrants, startNextStructuredStage, type Db } from "./src/lib/tournaments/structured-persist";
import { savedSwissPlayoff } from "./src/components/smart-builder/swiss-playoff-setup";
const TID = "0980bb1e-8494-4c5f-add6-d0170723f72a";
const q = (sql: string) => { const r = spawnSync(["psql", "-At", "-c", sql]); const t = r.stdout.toString().trim(); if (r.exitCode) throw new Error(r.stderr.toString()); return t ? JSON.parse(t) : []; };
const lit = (v: unknown) => v === null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const writes: string[] = [];
const base: Db = {
  async select(table, f) { const w = Object.entries(f).map(([k, v]) => v === null ? `${k} is null` : `${k}=${lit(v)}`).join(" and "); return q(`select coalesce(json_agg(t),'[]') from ${table} t ${w ? "where " + w : ""}`); },
  async insert(table) { writes.push(table); throw new Error("WRITE BLOCKED " + table); },
  async update(table) { writes.push(table); throw new Error("WRITE BLOCKED " + table); },
};
const [t] = await base.select("tournaments", { id: TID });
const d0 = t.builder_spec.divisions[0];
const field = (await loadEntrants(base, TID, t.builder_spec)).divisions[0].entrants.length;
const saved = savedSwissPlayoff(d0, d0.stages[0], "vmv0p0b27-po1", "Quarterfinal", t.beta_lifecycle?.answers, field);
console.log("screen issues", saved.issues, "top", saved.top, "field", field);
const setup: any = { kind: "mapped", discipline: saved.discipline, mapping: saved.mapping, schedule: saved.schedule, syncLater: saved.laterSync };
const c = await checkDeferredSetup(base, TID, "g1", "vmv0p0b27-po1", setup);
console.log("CHECK", JSON.stringify(c), "ok", setupOk(c));
const b = bufferedDb(base);
const next = specWithSetup(t.builder_spec, "g1", "vmv0p0b27-po1", setup);
await b.db.update("tournaments", { id: TID }, { builder_spec: next.spec });
await startNextStructuredStage(b.db, TID, "g1", "vmv0p0b27-po1", { ownerConfirmed: true });
const ins = b.ops.filter((o: any) => o.op === "insert" && o.table === "club_champs_matches").flatMap((o: any) => o.rows);
const names = Object.fromEntries(q(`select json_agg(json_build_array(id, name)) from club_members where id in (select club_member_id from club_champs_entries where champ_id='${TID}' and group_number=1)`).map((x: any) => [x[0], x[1]]));
console.log("would-create games", ins.length);
for (const r of ins) console.log("  ", names[r.player_a_member_id], "v", names[r.player_b_member_id], "|", r.scheduled_date, r.scheduled_time, "court", r.court_id, r.stage_key);
console.log("later stages after", JSON.stringify(next.spec.divisions[0].deferredStages.map((x: any) => x.name)), "stages", next.spec.divisions[0].stages.length);
console.log("ops", b.ops.map((o: any) => o.op + ":" + (o.table ?? "")).join(", "));
console.log("real writes attempted", writes);
