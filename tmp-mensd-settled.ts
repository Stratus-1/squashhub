// Temporary diagnostic: which Men's D positions are provably final. Deleted after use.
import { readFileSync } from "fs";
import { buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";
import { settledSwiss } from "@/lib/tournaments/swiss-settled";

const load = (f: string) => { const j = JSON.parse(readFileSync(`/tmp/browser/mensd45/${f}`, "utf8")); return j.rows[0][Object.keys(j.rows[0])[0]]; };
const champ = load("champ.json")[0];
const arch = load("arch.json")[0];
const entries = load("entries.json");
const matches = load("matches.json");

const gn = 4;
const spec = arch?.builder_spec;
const gEntries = entries.filter((e: any) => e.group_number === gn).sort((x: any, y: any) => (x.order_index ?? 0) - (y.order_index ?? 0));
const names: Record<string, string> = {};
gEntries.forEach((e: any) => { if (e.club_member_id) names[e.club_member_id] = e.club_members?.name ?? "Player"; });
const gm = matches.filter((m: any) => m.group_number === gn && (m.round_number ?? 0) > 0);
gm.forEach((m: any) => { if (m.player_a_member_id && m.player_a?.name) names[m.player_a_member_id] ??= m.player_a.name; if (m.player_b_member_id && m.player_b?.name) names[m.player_b_member_id] ??= m.player_b.name; });

const model = buildSwissProgression({
  seedOrder: gEntries.map((e: any) => e.club_member_id).filter(Boolean), names, totalRounds: 5,
  matches: gm.map((m: any) => ({ id: m.id, round: Number(m.round_number), a: m.player_a_member_id ?? null, b: m.is_bye ? null : m.player_b_member_id ?? null,
    winner: m.winner_member_id, isBye: !!m.is_bye, status: m.status, score: m.score, date: m.scheduled_date, time: m.scheduled_time, court: null, playBy: m.play_by })),
});

const openR2 = model.rounds.filter((r) => r.round <= 2 && r.created && !r.complete).sort((a, b) => a.round - b.round)[0] ?? null;
console.log("open round:", openR2?.round);
const outstanding = openR2.fixtures.filter((f) => f.state === "scheduled" && f.a && f.b).map((f) => ({ a: f.a as string, b: f.b as string }));
console.log("outstanding games:", outstanding.map((o) => `${names[o.a]} v ${names[o.b]}`));
const decidedGames = model.rounds.filter((r) => r.round <= (openR2?.round ?? 0)).flatMap((r) => r.fixtures.flatMap((f) =>
  f.state === "completed" ? [{ a: f.a, b: f.b, winner: f.winner, round: r.round }]
  : f.state === "bye" ? [{ a: f.a ?? f.b, b: null, winner: null, round: r.round }] : []));
console.log("decided games:", decidedGames.length);
const seedOrder = [...model.rows].sort((a, b) => a.seed - b.seed).map((r) => r.id);
const res = settledSwiss({ seedOrder, decidedGames, outstanding, round: (openR2?.round ?? 1) + 1, finalRound: 5, positionsOnly: true, tieBreaks: ["position_swap"] } as any);
console.log("enumerable:", res.enumerable);
if (res.enumerable) {
  const sp = (res as any).settledPositions as Map<string, number>;
  const byPos = new Map<number, string>();
  sp.forEach((pos, id) => byPos.set(pos, names[id] ?? id));
  console.log("settled positions:", [...byPos.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p}:${n}`));
  // snapshot order by current standing
  const snapshot = [...model.rows].sort((a, b) => (a.current ?? 0) - (b.current ?? 0)).map((r) => r.id);
  console.log("snapshot groups of 4:");
  for (let g = 0; g < 4; g++) {
    const ids = snapshot.slice(g * 4, g * 4 + 4);
    console.log(` group ${g + 1}:`, ids.map((id) => `${names[id]}${sp.has(id) ? " (settled)" : " (UNSETTLED)"}`));
  }
}
