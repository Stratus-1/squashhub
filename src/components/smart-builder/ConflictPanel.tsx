import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SetupConflict } from "@/lib/smart-builder/consistency";

/** Setup contradictions the organiser must reconcile explicitly before continuing. */
export function ConflictPanel({ conflicts, onResolve }: { conflicts: SetupConflict[]; onResolve: (c: SetupConflict, pick: "yes" | "no") => void }) {
  if (!conflicts.length) return null;
  return (
    <div className="space-y-2" data-testid="setup-conflicts">
      {conflicts.map((c) => (
        <div key={c.id} role="alert" className="space-y-2 rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm">
          <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span>{c.message}</span></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onResolve(c, "yes")}>{c.yes.label}</Button>
            {c.no && <Button size="sm" variant="outline" title={c.no.explain} onClick={() => onResolve(c, "no")}>{c.no.label}</Button>}
          </div>
          {c.no && <p className="text-xs text-muted-foreground">{c.no.label}: {c.no.explain}</p>}
          <p className="text-xs text-muted-foreground">Fix in: {c.step}. Setup can't be completed and the draw can't be generated until this is resolved.</p>
        </div>
      ))}
    </div>
  );
}
