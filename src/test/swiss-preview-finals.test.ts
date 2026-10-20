import { describe, it, expect } from "vitest";
import { swissPreviewFinalsTemplate as template } from "@/lib/tournaments/swiss-preview-finals";
import { preferredSwissTemplate, strictSwissPlan, opponentKey } from "@/lib/tournaments/swiss-no-repeat";
import { buildProposedSwissGrid, buildSwissProgression } from "@/lib/tournaments/swiss-progression-view";

describe("24-player preview finals", () => {
  it("R4 top four cross; R2 duplicate pairs are switched", () => {
    expect(template(24,4).pairs.map(p=>[p.a,p.b])).toEqual([[1,4],[2,3],[5,7],[6,8],[9,12],[10,11],[13,16],[14,15],[17,19],[18,20],[21,24],[22,23]]);
  });
  it("R5 adjacent finals through 24", () => {
    expect(template(24,5).pairs.map(p=>[p.a,p.b])).toEqual(Array.from({length:12},(_,i)=>[i*2+1,i*2+2]));
  });
  it("five rounds: every position once per round, no earlier pair repeated", () => {
    const seen=new Set<string>();
    for(let r=1;r<=5;r++) {
      const pairs=template(24,r).pairs;
      expect(pairs.flatMap(p=>[p.a,p.b]).sort((a,b)=>a-b)).toEqual(Array.from({length:24},(_,i)=>i+1));
      for(const p of pairs) { const key=opponentKey(String(p.a),String(p.b)); expect(seen.has(key)).toBe(false); seen.add(key); }
    }
  });
  it("actual opponent history overrides the preview preference", () => {
    const plan=strictSwissPlan({occupants:Array.from({length:24},(_,i)=>`p${i+1}`),round:4,preferred:template(24,4).pairs,usePreferredTemplate:true,history:[{round:3,a:"p1",b:"p4"}]});
    expect(plan.ready).toBe(true);
    expect(plan.pairs.some(p=>p.a===1&&p.b===4)).toBe(false);
  });
  it("opt-in display only; other sizes and default live projection unchanged", () => {
    const model=buildSwissProgression({seedOrder:Array.from({length:24},(_,i)=>`p${i+1}`),names:{},matches:[],totalRounds:5});
    const snapshot=JSON.stringify(model);
    const preview=buildProposedSwissGrid(model,{previewFinals:true});
    expect(preview.issues).toEqual([]);
    expect(preview.rounds[4].blocks.map(b=>b.rows.map(r=>r.pos))).toEqual(Array.from({length:12},(_,i)=>[i*2+1,i*2+2]));
    expect(buildProposedSwissGrid(model).rounds[3].blocks[0].rows.map(r=>r.pos)).toEqual([1,3]);
    expect(preferredSwissTemplate(24,4).pairs[0]).toMatchObject({a:1,b:3});
    expect(JSON.stringify(model)).toBe(snapshot);
    for(const n of [16,18]) for(let r=1;r<=5;r++) expect(template(n,r)).toEqual(preferredSwissTemplate(n,r));
  });
});
