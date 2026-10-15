import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { resolveStagePlan, type PlanAnswers } from "@/lib/smart-builder/stage-plan";
import { unitCapacity, courtLoad } from "@/lib/smart-builder/structure-capacity";

/**
 * Compact overview for the consolidated Tournament Structure step (Riverside pilot):
 * one row per category/subcategory with entrants, ordered stages, next undecided stage, source and Edit,
 * plus a live, display-only capacity estimate. It never writes answers itself.
 */
export function StructureOverview({ answers, units, entrants, onEdit, editing }: {
  answers: PlanAnswers; units: { key: string; label: string }[]; entrants: Record<string, number>;
  onEdit: (key: string) => void; editing?: string | null;
}) {
  const [minutes, setMinutes] = useState(45);
  const rows = units.map((u) => ({ u, cap: unitCapacity(answers, u.key, entrants[u.key] ?? 0), src: resolveStagePlan(answers, u.key).source }));
  const total = rows.reduce((s, r) => s + r.cap.matches, 0);
  const undecided = rows.reduce((s, r) => s + r.cap.undecided, 0);
  const load = courtLoad(total, minutes);
  return (
    <div className="space-y-2 rounded-lg border border-border p-3" data-testid="structure-overview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">Structure overview</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="structure-capacity">
          <span><b className="text-foreground">{total}</b> matches planned</span>
          <span>· ≈{load.needHours} court-hours</span>
          <label className="flex items-center gap-1">at <Input type="number" min={10} className="h-7 w-16" aria-label="Minutes per match" value={minutes} onChange={(e) => { const n = Number(e.target.value); if (n >= 10) setMinutes(n); }} /> min/match</label>
          {undecided > 0 && <Badge variant="outline">+ {undecided} undecided stage{undecided > 1 ? "s" : ""} not counted</Badge>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Category</th><th className="pr-2">Entrants</th><th className="pr-2">Stages</th><th className="pr-2">Next undecided</th><th className="pr-2">Matches</th><th className="pr-2">Source</th><th /></tr></thead>
          <tbody>
            {rows.map(({ u, cap, src }) => (
              <tr key={u.key} className={`border-t border-border ${editing === u.key ? "bg-primary/5" : ""}`} data-testid={`structure-row-${u.key}`}>
                <td className="py-1 pr-2 font-medium">{u.label}</td>
                <td className="pr-2">{cap.entrants || "—"}</td>
                <td className="pr-2">{cap.stages.map((s) => s.label).join(" → ")}</td>
                <td className="pr-2">{cap.nextUndecided == null ? "—" : `Stage ${cap.nextUndecided + 1}`}</td>
                <td className="pr-2">{cap.matches || "—"}{cap.undecided ? "+?" : ""}</td>
                <td className="pr-2"><Badge variant={src === "default" ? "secondary" : src === "unset" ? "destructive" : "outline"}>{src === "default" ? "Default" : src === "unset" ? "Not set" : src === "category" ? "Category" : "Override"}</Badge></td>
                <td className="text-right"><Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => onEdit(u.key)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Estimate only. Saving the structure never creates or changes fixtures or bookings — that happens later at Generate draw, with an impact preview and your approval.</p>
    </div>
  );
}
