import { it } from "vitest";
import fs from "fs";
import { timelinePlayoffSpec } from "@/lib/smart-builder/attach-timeline-playoffs";
import { placeholderGames } from "@/lib/smart-builder/playoff-placeholders";
for (const f of ["/tmp/aabb_real.json", "/tmp/aabb_xover.json"]) it(f, () => {
  const { spec, plan } = JSON.parse(fs.readFileSync(f, "utf8"));
  const next: any = timelinePlayoffSpec(spec, plan);
  const g1 = (next ?? spec).divisions[0];
  console.log(f, next ? "CHANGED" : "unchanged", JSON.stringify(g1.stages.map((x: any) => x.name)), "deferred:", JSON.stringify((g1.deferredStages ?? []).map((x: any) => x.name)));
  console.log(JSON.stringify(placeholderGames(g1).map((g) => `${g.stageName} ${g.order}: ${g.a} v ${g.b}`)));
  if (next) console.log("others same:", JSON.stringify(next.divisions.slice(1)) === JSON.stringify(spec.divisions.slice(1)));
});
