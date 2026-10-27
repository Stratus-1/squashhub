// Temporary diagnostic: inspect Men's D progression grid. Deleted after use.
import { readFileSync } from "fs";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
import { appliedRoundPlayBy } from "@/lib/tournaments/stage-schedule";
import { divisionGroup } from "@/lib/tournaments/engine-service";

const load = (f: string) => { const j = JSON.parse(readFileSync(`/tmp/browser/mensd45/${f}`, "utf8")); return j.rows[0][Object.keys(j.rows[0])[0]]; };

const champ = load("champ.json")[0];
const arch = load("arch.json")[0];
const entries = load("entries.json");
const matches = load("matches.json");
const rounds = load("rounds.json");
const flag = load("flag.json");

const gn = 4;
const spec = arch?.builder_spec;
const div = (spec?.divisions ?? []).find((x: any) => divisionGroup(spec, x) === gn);
console.log("division found:", !!div, "stages:", JSON.stringify((div?.stages ?? []).map((s: any) => ({ kind: s.kind, order: s.order, swissRounds: s.swissRounds, rrFinish: s.rrFinish, schedule: s.schedule })), null, 1));

const gEntries = entries.filter((e: any) => e.group_number === gn).sort((x: any, y: any) => (x.order_index ?? 0) - (y.order_index ?? 0));
const names: Record<string, string> = {};
gEntries.forEach((e: any) => { if (e.club_member_id) names[e.club_member_id] = e.club_members?.name ?? "Player"; });
const gm = matches.filter((m: any) => m.group_number === gn && (m.round_number ?? 0) > 0);
gm.forEach((m: any) => { if (m.player_a_member_id && m.player_a?.name) names[m.player_a_member_id] ??= m.player_a.name; if (m.player_b_member_id && m.player_b?.name) names[m.player_b_member_id] ??= m.player_b.name; });

const st = [...(div?.stages ?? [])].sort((x: any, y: any) => x.order - y.order)[0];
const model = buildSwissProgression({
  seedOrder: gEntries.map((e: any) => e.club_member_id).filter(Boolean), names, totalRounds: st?.swissRounds ?? 5, tieBreaks: st?.tieBreaks, rrFinish: st?.rrFinish?.enabled ? st.rrFinish : undefined,
  ...(spec?.swissSequencing ? { swissSequencing: spec.swissSequencing, tournamentId: champ.id } : {}),
  matches: gm.map((m: any) => ({ id: m.id, round: Number(m.round_number), a: m.player_a_member_id ?? m.bye_member_id ?? null, b: m.is_bye ? null : m.player_b_member_id ?? null,
    winner: m.winner_member_id, isBye: !!m.is_bye, status: m.status, score: m.score, date: m.scheduled_date, time: m.scheduled_time, court: null, playBy: m.play_by,
    placeholderA: m.placeholder_a, placeholderB: m.placeholder_b })),
});
console.log("model rounds completeness:", model.rounds.map((r: any) => ({ round: r.round, complete: r.complete })));
model.rrFinish = st?.rrFinish?.enabled ? st.rrFinish : undefined;

const appliedPlayBy: Record<number, string> = {};
for (const r of rounds) { if (Number(r.group_number) !== gn) continue; const pb = appliedRoundPlayBy(r); if (pb) appliedPlayBy[Number(r.round_number)] = pb; }
console.log("appliedPlayBy:", appliedPlayBy);

let grid: any;
try { grid = buildProposedSwissGrid(model, { schedule: st?.schedule ?? null, slots: {}, appliedPlayBy, noRepeats: true, partialGeneration: !!flag?.length }); } catch (e) { console.log("grid threw:", String(e)); process.exit(0); }
console.log("grid issues:", grid.issues); console.log("tieBreaks passed:", st?.tieBreaks);
for (const rd of grid.rounds) {
  console.log(`round ${rd.round}:`, rd.blocks.map((b: any) => ({ a: b.rows[0]?.name, aId: !!b.rows[0]?.id, b: b.rows[1]?.name, bId: !!b.rows[1]?.id, certified: b.certified })));
}

// replicate RR-finish branch internals
const locked = !!model.rounds.find((r: any) => r.round === 2)?.complete;
const openR2b = !locked ? model.rounds.filter((r: any) => r.round <= 2 && r.created && !r.complete).sort((a: any, b: any) => a.round - b.round)[0] ?? null : null;
console.log("locked:", locked, "openR2:", openR2b?.round, "round2 created:", model.rounds.find((r:any)=>r.round===2)?.created);
const snapshot2 = [...model.rows].sort((a: any, b: any) => (a.current ?? 0) - (b.current ?? 0)).map((r: any) => r.id);
console.log("snapshot:", snapshot2.map((id: string) => names[id]));
