import { describe, expect, it } from "vitest";
import { sequenceSwissRound, swissOpponentKey as key } from "@/lib/tournaments/swiss-sequencing";
import { prospectiveSwissPolicy, swissSequencingEnabled, assertTournamentPairingWritable, isFrozenUitsigTournament } from "@/lib/tournaments/swiss-sequencing-policy";
import { nextSwissRound, swissStandings, type SpecDivision } from "@/lib/tournaments/engine-service";
import { buildSwissProgression, buildProposedSwissGrid } from "@/lib/tournaments/swiss-progression-view";
import { rrFinishRound } from "@/lib/tournaments/swiss-rr-finish";
import { autoProgress } from "@/lib/tournaments/progression";
import { atomically, generateStructuredTournament, rebuildStructured, persistStructure, insertFixtures } from "@/lib/tournaments/structured-persist";
import { persistStepTournament, saveLifecycle } from "@/lib/smart-builder/step-handover";
import { attachTimelinePlayoffs, createPlannedPlayoffFixtures } from "@/lib/smart-builder/attach-timeline-playoffs";

const policy = prospectiveSwissPolicy("new-test", "2026-10-23T00:00:00Z");
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i+1}`, points: 0, seed: i+1, byes: 0 }));
const division = (n: number, rounds: number, groups?: number) => ({ divisionId: "d", entrants: players(n).map((p) => ({ id: p.id, rank: p.seed })), stages: [{ id: "s", order: 0, kind: "swiss", swissRounds: rounds, tieBreaks: ["position_swap"], ...(groups ? { rrFinish: { enabled: true, groups } } : {}) }] }) as unknown as SpecDivision;
const row = (round: number, a: string, b: string | null, winner: string | null = a) => ({ id: `r${round}-${a}`, divisionId: "d", stageId: "s", stageKind: "swiss" as const, a, b, winner, round, status: "completed" });
const grid = (d: SpecDivision, rows: ReturnType<typeof row>[], enabled = true) => buildProposedSwissGrid(buildSwissProgression({ seedOrder: d.entrants.map((e) => e.id), names: {}, totalRounds: d.stages[0].swissRounds, tieBreaks: d.stages[0].tieBreaks, rrFinish: d.stages[0].rrFinish, ...(enabled ? { swissSequencing: policy, tournamentId: "new-test" } : {}), matches: rows.map((r) => ({ ...r, round: r.round ?? 1 })) }));

describe("General prospective Swiss final sequencing", () => {
  it("targets bottom-six final positions 13–18 and respects earlier R1/R2 opponents", () => {
    const ps = players(6), history = new Set([key("p1","p4"), key("p2","p5"), key("p3","p6")]);
    const result = sequenceSwissRound({ players: ps, played: history, round: 5, finalRound: 5, positionOffset: 12 });
    expect(result.pairs).toEqual([["p1","p2"],["p3","p4"],["p5","p6"]]);
    expect(result.exceptions).toEqual([]);
  });
  it("preserves current adjacent pairs in R3/R4 when score fairness allows", () => {
    const history = new Set<string>(), ps = players(6);
    for (const round of [3,4]) {
      const result = sequenceSwissRound({ players: ps, played: history, round, finalRound: 5 });
      for (const [a,b] of result.pairs) { expect(b).not.toBeNull(); if (b) { expect(history.has(key(a,b))).toBe(false); history.add(key(a,b)); } }
      expect(result.pairs.some(([a,b]) => b && Math.floor(ps.findIndex((p) => p.id===a)/2) === Math.floor(ps.findIndex((p) => p.id===b)/2))).toBe(false);
    }
    expect(sequenceSwissRound({ players: ps, played: history, round: 5, finalRound: 5 }).pairs).toEqual([["p1","p2"],["p3","p4"],["p5","p6"]]);
  });
  it("uses changed current ranking, not frozen identities", () => {
    const ps = [players(6)[5], ...players(6).slice(0,5)].map((p,i) => ({ ...p, seed:i+1 }));
    expect(sequenceSwissRound({ players: ps, played: new Set(), round: 4, finalRound: 4 }).pairs).toEqual([["p6","p1"],["p2","p3"],["p4","p5"]]);
  });
  it("reports final conflicts and chooses a complete nearest non-repeat matching", () => {
    const result = sequenceSwissRound({ players: players(6), played: new Set([key("p1","p2")]), round: 5, finalRound: 5, positionOffset: 12 });
    expect(result.pairs).not.toContainEqual(["p1","p2"]);
    expect(result.pairs).toContainEqual(["p5","p6"]);
    expect(result.exceptions[0]).toMatch(/13 v 14 unavailable.*already met/);
    expect(new Set(result.pairs.flat()).size).toBe(6);
  });
  it("prioritizes score fairness over reserving an early adjacent match", () => {
    const ps=players(4).map((p,i) => ({ ...p, points:i<2?3:0 }));
    expect(sequenceSwissRound({ players:ps, played:new Set(), round:3, finalRound:5 }).pairs).toEqual([["p1","p2"],["p3","p4"]]);
  });
  it("odd cohort gives one fair bye without repeats", () => {
    const ps=players(7); ps[6].byes=1;
    const result=sequenceSwissRound({ players:ps, played:new Set(), round:5, finalRound:5 });
    expect(result.pairs.filter(([,b]) => b===null)).toEqual([["p6",null]]);
    expect(new Set(result.pairs.flat().filter(Boolean)).size).toBe(7);
  });
  it("fails closed rather than forcing an opponent repeat", () => {
    expect(() => sequenceSwissRound({ players:players(4), played:new Set([key("p1","p2"),key("p1","p3"),key("p1","p4")]), round:5, finalRound:5 })).toThrow(/no complete pairing without repeat/);
  });
  it.each([4,5])("all-Swiss %i-round tournament shares generator/projection and never repeats", (rounds) => {
    const d=division(12,rounds), rows: ReturnType<typeof row>[]=[];
    for(let i=0;i<6;i++) rows.push(row(1,`p${i+1}`,`p${12-i}`));
    for(let round=2;round<=rounds;round++) {
      const before=JSON.stringify(rows);
      const next=nextSwissRound("new-test",d,"s",rows,true,policy);
      if(round>=3) {
        const proposal=grid(d,rows).rounds[round-1].blocks.map((b) => b.rows.map((r) => r.id));
        expect(next.map((f) => [f.a,f.b])).toEqual(proposal);
      }
      const met=new Set(rows.flatMap((r) => r.b?[key(r.a,r.b)]:[]));
      next.forEach((f,i) => { expect(f.b && met.has(key(String(f.a),f.b))).toBe(false); rows.push(row(round,String(f.a),f.b,i%2?f.b:f.a)); });
      expect(JSON.stringify(rows.slice(0,-next.length))).toBe(before);
      expect(new Set(next.flatMap((f) => [f.a,f.b])).size).toBe(12);
    }
  });
  it("18 players with three RR groups remain separate from the six dynamic Swiss players", () => {
    const d=division(18,5,3), rows: ReturnType<typeof row>[]=[];
    // R1 qualifying opponents cross halves; R2 top/bottom crossover avoids internal RR repeats.
    for(let i=0;i<9;i++) rows.push(row(1,`p${i+1}`,`p${i+10}`));
    [[1,9],[2,8],[3,7],[4,6],[5,10],[11,18],[12,17],[13,16],[14,15]].forEach(([a,b])=>rows.push(row(2,`p${a}`,`p${b}`)));
    const snapshot=swissStandings(d,d.stages[0],rows).map((r)=>r.id);
    const swiss=new Set(snapshot.slice(12));
    for(const round of [3,4,5]) {
      const next=nextSwissRound("new-test",d,"s",rows,true,policy);
      expect(next).toHaveLength(9);
      expect(next.slice(0,6).map((f)=>[f.a,f.b])).toEqual(rrFinishRound(snapshot,round,3).pairs);
      expect(next.slice(6).every((f)=>swiss.has(String(f.a))&&swiss.has(String(f.b)))).toBe(true);
      expect(grid(d,rows).rounds[round-1].blocks.map((b)=>key(String(b.rows[0].id),String(b.rows[1].id))).sort()).toEqual(next.map((f)=>key(String(f.a),String(f.b))).sort());
      next.forEach((f,i)=>rows.push(row(round,String(f.a),f.b,i%2?f.b:f.a)));
    }
  });
  it("future Swiss names remain unresolved until the preceding round finishes", () => {
    const d=division(12,5); const proposed=grid(d,[]);
    expect(proposed.rounds[4].blocks.every((b)=>b.rows.every((r)=>r.id===null))).toBe(true);
  });
});

describe("Existing Uitsig and prospective tournament guardrails", () => {
  const uitsig="f954222a-0f0a-4d8c-ac7b-9c74042cc69e";
  it("the Uitsig freeze is lifted: pairing writers are no longer blocked by the tournament ID", () => {
    expect(isFrozenUitsigTournament(uitsig)).toBe(false);
    expect(()=>assertTournamentPairingWritable(uitsig)).not.toThrow();
  });
  it("rejects old tournaments, missing policies and copied tournament identities", () => {
    expect(prospectiveSwissPolicy("old","2026-10-06")).toBeUndefined();
    expect(swissSequencingEnabled(undefined,"new-test")).toBe(false);
    expect(swissSequencingEnabled(policy,"different")).toBe(false);
  });
  it("Uitsig keeps its legacy approved charts because no sequencing policy is minted for it", () => {
    const d=division(18,5,3); const model=buildSwissProgression({ seedOrder:d.entrants.map((e)=>e.id),names:{},totalRounds:5,rrFinish:d.stages[0].rrFinish,matches:[] });
    const before=JSON.stringify(model), legacy=JSON.stringify(buildProposedSwissGrid(model,{exactMensCChart:true}));
    expect(JSON.stringify(buildProposedSwissGrid({...model,tournamentId:uitsig},{exactMensCChart:true}))).toBe(legacy);
    expect(JSON.stringify(model)).toBe(before);
  });
  it("generation, rebuild, persistence and automatic progression are no longer blocked for Uitsig", async () => {
    const db:any={select:()=>{throw new Error("DB accessed");},insert:()=>{throw new Error("DB accessed");},update:()=>{throw new Error("DB accessed");},remove:()=>{throw new Error("DB accessed");}};
    const notFrozenBlock=async(p:Promise<any>)=>{ const e=await p.then(()=>null,(x:any)=>x); expect(String(e&&e.message||e)).not.toMatch(/protected/); };
    await notFrozenBlock(generateStructuredTournament(db,uitsig));
    await notFrozenBlock(rebuildStructured(db,uitsig));
    await notFrozenBlock(persistStructure(db,uitsig,{} as any));
    await notFrozenBlock(insertFixtures(db,uitsig,{} as any,{} as any,[]));
    await notFrozenBlock(saveLifecycle(uitsig,{} as any));
    await notFrozenBlock(persistStepTournament({existingId:uitsig} as any));
    await notFrozenBlock(attachTimelinePlayoffs(uitsig,{}));
    await notFrozenBlock(createPlannedPlayoffFixtures(uitsig,{}));
    await notFrozenBlock(autoProgress(db,uitsig));
    expect(()=>nextSwissRound(uitsig,division(18,5),"s",[],true,policy)).not.toThrow(/protected/);
  });
  it("new first-draw generation persists a matching policy; old or already-generated tournaments never adopt it", async () => {
    const base=division(6,5);
    const d={...base,stages:base.stages.map((s)=>({...s,name:"Swiss",schedule:{rule:"play_by",deadline:"2026-11-30"}})),unit:"players",label:"Swiss",expectedEntrants:6,seeding:{source:"entry_order",method:"snake"},placements:"champion",finalStandings:"last_stage"};
    for(const createdAt of ["2026-10-06T00:00:00Z","2026-10-23T00:00:00Z"]) {
      const spec={version:1,architecture:"structured",name:"Synthetic",divisions:[d]};
      const tables:Record<string,any[]>={tournaments:[{id:"new-test",created_at:createdAt,builder_architecture:"structured",builder_spec:spec}],club_champs_entries:players(6).map((p,i)=>({champ_id:"new-test",club_member_id:p.id,group_number:1,order_index:i})),club_champs_matches:[]};
      const patches:any[]=[];
      const db:any={select:async(t:string,f:Record<string,unknown>)=>(tables[t]??[]).filter((r)=>Object.entries(f).every(([k,v])=>r[k]===v)),update:async(t:string,f:any,p:any)=>{patches.push(p);Object.assign(tables[t][0],p);},insert:async(t:string,rs:any[])=>{const out=rs.map((r,i)=>({id:`${t}-${i}`,...r}));(tables[t]??=[]).push(...out);return out;}};
      await generateStructuredTournament(db,"new-test");
      expect(tables.club_champs_matches).toHaveLength(3);
      expect(tables.tournaments[0].builder_spec.divisions[0].stages).toEqual(d.stages);
      expect(!!tables.tournaments[0].builder_spec.swissSequencing).toBe(createdAt.startsWith("2026-10-23"));
      const before=JSON.stringify(tables); const count=patches.length;
      await expect(generateStructuredTournament(db,"new-test")).rejects.toThrow(/already exist/);
      expect(JSON.stringify(tables)).toBe(before); expect(patches).toHaveLength(count);
    }
  });
});