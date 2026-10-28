import { it } from "vitest";
import d from "/tmp/t/d.json";
import { timelinePlayoffSpec } from "@/lib/smart-builder/attach-timeline-playoffs";
it("x", () => { const n:any = timelinePlayoffSpec(d.spec as any, d.plan); const g1=n?.divisions?.[0]; console.log(JSON.stringify(g1?.stages?.slice(1).map((s:any)=>({n:s.name,m:s.mapping?.matches,pools:s.mapping?.pools,u:s.mapping?.units})),null,0), JSON.stringify(g1?.deferredStages)); });
