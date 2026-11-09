import { readFileSync } from "fs";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
import { appliedRoundPlayBy } from "@/lib/tournaments/stage-schedule";
import { rrFinishIssues } from "@/lib/tournaments/swiss-rr-finish";
const d = JSON.parse(readFileSync("/tmp/proj/input.json","utf8"));
const gn = Number(process.argv[2] ?? 3);
const spec = d.arch.builder_spec;
const st = spec.divisions[gn-1].stages.sort((a:any,b:any)=>a.order-b.order)[0];
const rounds = st.swissRounds;
const appliedPlayBy: Record<number,string> = {};
for (const r of d.rounds) if (r.group_number===gn) { const pb = appliedRoundPlayBy(r); if (pb) appliedPlayBy[r.round_number]=pb; }
const gEntries = d.entries.filter((e:any)=>e.group_number===gn).sort((x:any,y:any)=>(x.order_index??0)-(y.order_index??0));
console.log("entries", gEntries.length, "rrIssues", rrFinishIssues(gEntries.length, rounds, st.rrFinish?.groups), "pb", appliedPlayBy);
const names: Record<string,string> = {};
gEntries.forEach((e:any)=>{ names[e.club_member_id]=e.club_members?.name; });
const gm = d.matches.filter((m:any)=>m.group_number===gn && (m.round_number??0)>0);
const model = buildSwissProgression({ seedOrder: gEntries.map((e:any)=>e.club_member_id), names, totalRounds: rounds, tieBreaks: st.tieBreaks, rrFinish: st.rrFinish,
 ...(spec.swissSequencing ? { swissSequencing: spec.swissSequencing, tournamentId: d.champ.id } : {}),
 matches: gm.map((m:any)=>({ id: m.id, round: Number(m.round_number), a: m.player_a_member_id ?? m.bye_member_id ?? null, b: m.is_bye?null:m.player_b_member_id??null, winner: m.winner_member_id, isBye: !!m.is_bye, status: m.status, score: m.score, date: m.scheduled_date, time: m.scheduled_time, court: null, playBy: m.play_by, placeholderA: m.placeholder_a, placeholderB: m.placeholder_b })) } as any);
(model as any).rrFinish = st.rrFinish;
const grid: any = buildProposedSwissGrid(model as any, { schedule: { ...(st.schedule??{}) }, slots: {}, appliedPlayBy, noRepeats: true, mensCRemainderChart: gn===3, partialGeneration: d.partial>0 } as any);
console.log("issues", grid.issues);
for (const rd of grid.rounds) { if (rd.round<3) continue; console.log("R"+rd.round, "complete", (model as any).rounds.find((r:any)=>r.round===rd.round-1)?.complete);
 for (const b of rd.blocks) console.log("  ", b.rows.map((r:any)=>`${r.pos}:${r.name ?? '-'}`).join(" v "), "cert", b.certified, b.saved ? "saved":"", b.status ?? ""); }
