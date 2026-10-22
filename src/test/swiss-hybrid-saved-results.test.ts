import { describe, expect, it } from "vitest";
import { buildSwissProgression, buildProposedSwissGrid, type ProgressionMatchInput } from "@/lib/tournaments/swiss-progression-view";

const seeds=Array.from({length:18},(_,i)=>`p${i+1}`);
const game=(round:number,a:number,b:number,winner:number,score:string):ProgressionMatchInput=>({id:`r${round}-${a}`,round,a:`p${a}`,b:`p${b}`,winner:`p${winner}`,score,status:"completed"});
const first=Array.from({length:9},(_,i)=>game(1,i+1,18-i,i+1,"15-0,15-0,15-0"));
const second=[[1,10],[2,9],[3,8],[4,7],[5,6],[11,18],[12,17],[13,16],[14,15]].map(([a,b])=>game(2,a,b,a,"0-15,0-15,15-0,15-0,15-0"));
const modelOf=(matches:ProgressionMatchInput[])=>buildSwissProgression({seedOrder:seeds,names:{},matches,totalRounds:5,tieBreaks:["position_swap"],rrFinish:{enabled:true,groups:2}});
describe("Riverside hybrid factual opening-round results",()=>{
 it("retains all nine actual R2 results when fixed-chart opponents differ",()=>{
  const model=modelOf([...first,...second]),before=JSON.stringify(model);
  const legacy=buildProposedSwissGrid(model,{exactMensCChart:true});
  expect(legacy.rounds[1].blocks.filter((b)=>b.saved)).toHaveLength(4);
  const fixed=buildProposedSwissGrid(model,{exactMensCChart:true,factualOpeningRounds:true});
  expect(fixed.rounds[1].blocks).toHaveLength(9);
  for(const m of second){
   const block=fixed.rounds[1].blocks.find((b)=>b.matchId===m.id);
   expect(block?.saved).toBe(true);expect(block?.score).toBe("3–2");
   expect(new Set(block?.rows.map((r)=>r.id))).toEqual(new Set([m.a,m.b]));
   expect(block?.rows.find((r)=>r.id===m.winner)?.result).toBe("W");
   expect(block?.rows.some((r)=>r.projected)).toBe(false);
  }
  expect(JSON.stringify(model)).toBe(before);
 });
 it("never leaks a previous round's score into a projected later meeting",()=>{
  const model=modelOf([...first,...second]);
  const grid=buildProposedSwissGrid(model,{exactMensCChart:true,factualOpeningRounds:true});
  for(const r of grid.rounds.filter((r)=>r.round>=3)) for(const b of r.blocks){
   expect(b.score).toBeNull();expect(b.rows.every((r)=>r.result==="")).toBe(true);
  }
 });
 it("partial saved R2 results stay factual, with no invented results for unmatched chart slots",()=>{
  const grid=buildProposedSwissGrid(modelOf([...first,...second.slice(0,3)]),{exactMensCChart:true,factualOpeningRounds:true});
  expect(grid.rounds[1].blocks.map((b)=>b.matchId).sort()).toEqual(second.slice(0,3).map((m)=>m.id).sort());
  expect(grid.rounds[1].blocks.every((b)=>b.saved&&b.score==="3–2")).toBe(true);
 });
});