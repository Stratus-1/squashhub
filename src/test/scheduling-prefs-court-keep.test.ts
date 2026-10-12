import { planPrefWaves } from "@/lib/tournaments/scheduling-prefs";
import { test, expect } from "vitest";
test("each category keeps its chosen court; Required court never lent while that category waits",()=>{
const prefs:any={rest:"none",courts:"category",courtsPreBooked:true,categoryCourts:[{courtIds:[26],key:"Mens B",rule:"preferred",weekdays:[3]},{courtIds:[24],key:"Mens A",rule:"preferred",weekdays:[3]},{courtIds:[20],key:"Ladies A",rule:"only",weekdays:[3]}]};
const labels:any={1:"Mens A · Singles",2:"Mens B · Singles",3:"Ladies A · Singles"};
let games:any[]=[];let n=0;
for(const [g,c] of [[1,8],[2,6],[3,4]]) for(let i=0;i<c;i++) games.push({id:`g${g}-${i}`,round:1,people:[`p${n++}`,`p${n++}`],groups:[g]});
const r=planPrefWaves({games,days:[{date:"2026-11-04",from:"16:00",to:"21:00",courtIds:[20,24,26]}],minutes:40,busy:[],prefs,keyOf:(g)=>labels[String(g)]});
expect(r.issues).toEqual([]); const by=(p:string)=>r.slots.filter(s=>s.id.startsWith(p)); expect(by("g3-").every(s=>s.courtId===20)).toBe(true); expect(by("g2-").every(s=>s.courtId===26)).toBe(true); expect(by("g1-").slice(0,5).every(s=>s.courtId===24)).toBe(true);
});
