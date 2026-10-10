import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InlineTournamentStandings({ tournamentId, name, children }: {
  tournamentId: string; name: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const panelId = `inline-standings-${tournamentId}`;
  return (
    <section className="min-w-0 space-y-3" aria-label={`${name} standings`}>
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <Trophy className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="break-words">{name}</span>
        </h2>
        <Button variant="outline" size="sm" className="shrink-0 gap-1" aria-expanded={open}
          aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? "Collapse" : "Expand standings"}
        </Button>
      </div>
      <div id={panelId} hidden={!open} className="min-w-0">{children}</div>
    </section>
  );
}