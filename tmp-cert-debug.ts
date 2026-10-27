// Temporary diagnostic for certification scenarios. Deleted after use.
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";

const pairOf = (b: any) => [b.rows[0].id, b.rows[1].id].sort().join("|");

// Scenario from existing test: 18 players, groups 3, p17 v p18 open in R2
const r1 = Array.from({ length: 9 }, (_, i) => ({ id: `r1-${i}`, round: 1, a: `p${i + 1}`, b: `p${i + 10}`, winner: `p${i + 1}`, status: "completed" }));
const r2 = [["p1","p2"],["p3","p4"],["p5","p6"],["p7","p8"],["p9","p10"],["p11","p12"],["p13","p14"],["p15","p16"]]
  .map(([a, b], i) => ({ id: `r2-${i}`, round: 2, a, b, winner: a, status: "completed" }));
r2.push({ id: "r2-open", round: 2, a: "p17", b: "p18", winner: null, status: "scheduled" });
const m18 = buildSwissProgression({ seedOrder: Array.from({ length: 18 }, (_, i) => `p${i + 1}`), names: {}, totalRounds: 5, matches: [...r1, ...r2] } as any);
(m18 as any).rrFinish = { enabled: true, groups: 3 };
const g18 = buildProposedSwissGrid(m18, { schedule: null, partialGeneration: true } as any);
console.log("18p certified:", g18.rounds.filter((r) => r.round >= 3).flatMap((r) => r.blocks.filter((b) => b.certified).map((b) => `r${r.round}:${pairOf(b)}@${b.rows[0].pos}v${b.rows[1].pos}`)));

// My 8-player scenario, uppercase ids
const P = ["P1","P2","P3","P4","P5","P6","P7","P8"];
const s1 = [["P1","P5"],["P2","P6"],["P3","P7"],["P4","P8"]].map(([a,b],i)=>({id:`a-r1-${i}`,round:1,a,b,winner:a,status:"completed"}));
const s2 = [["P1","P2"],["P3","P4"],["P5","P6"]].map(([a,b],i)=>({id:`a-r2-${i}`,round:2,a,b,winner:a,status:"completed"}));
s2.push({ id: "a-r2-open", round: 2, a: "P7", b: "P8", winner: null, status: "scheduled" } as any);
const m8 = buildSwissProgression({ seedOrder: P, names: {}, totalRounds: 5, tieBreaks: ["position_swap"], matches: [...s1, ...s2] } as any);
(m8 as any).rrFinish = { enabled: true, groups: 2 };
const g8 = buildProposedSwissGrid(m8, { schedule: null, partialGeneration: true } as any);
console.log("8p certified:", g8.rounds.filter((r) => r.round >= 3).flatMap((r) => r.blocks.filter((b) => b.certified).map((b) => `r${r.round}:${pairOf(b)}@${b.rows[0].pos}v${b.rows[1].pos}`)));
console.log("8p all r3-5:", g8.rounds.filter((r) => r.round >= 3).map((r) => `R${r.round}: ` + r.blocks.map((b) => `${pairOf(b)}@${b.rows[0].pos}v${b.rows[1].pos}${b.certified ? "*" : ""}`).join(" ")));
