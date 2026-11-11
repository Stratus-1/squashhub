import data from "/tmp/la/data.json";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
const d: any = data;
const spec = d.arch.builder_spec;
const div = spec.divisions.find((x: any) => /Ladies A/.test(x.label));
const st = [...div.stages].sort((a: any, b: any) => a.order - b.order)[0];
console.log("stage", st.kind, st.swissRounds, JSON.stringify(st.schedule), st.tieBreaks, JSON.stringify(st.rrFinish));
const ents = d.entries.sort((a: any, b: any) => a.order_index - b.order_index);
const names: any = {}; ents.forEach((e: any) => names[e.club_member_id] = e.club_members.name);
const model = buildSwissProgression({ seedOrder: ents.map((e: any) => e.club_member_id), names, totalRounds: 5, tieBreaks: st.tieBreaks,
  matches: d.matches.map((m: any) => ({ id: m.id, round: Number(m.round_number), a: m.player_a_member_id ?? m.bye_member_id ?? null, b: m.is_bye ? null : m.player_b_member_id ?? null, winner: m.winner_member_id, isBye: !!m.is_bye, status: m.status, score: m.score, date: m.scheduled_date, time: m.scheduled_time, court: null, playBy: m.play_by, placeholderA: m.placeholder_a, placeholderB: m.placeholder_b })) });
console.log("rounds", model.rounds.map((r: any) => [r.round, r.created, r.complete, r.fixtures.length]));
const grid = buildProposedSwissGrid(model, { appliedPlayBy: { 3: "2026-11-05", 4: "2026-11-12" }, exactLadiesAChart: true, partialGeneration: true, noRepeats: true, schedule: st.schedule });
console.log("issues", grid.issues);
for (const rd of grid.rounds) console.log(rd.round, rd.blocks.map((b: any) => b.rows.map((r: any) => `${r.pos}:${r.name}${r.id ? "" : "(noid)"}`).join(" v ")).join(" | "));
