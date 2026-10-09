import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useIsAssociationAdmin } from "@/hooks/use-association-admin";
import { useTeamPenalties } from "@/hooks/use-league-penalties";
import { ApplyTeamPenaltyDialog } from "./ApplyTeamPenaltyDialog";

interface Props {
  associationId: string;
  fixture: { id: string; date: string; label?: string };
  teams: { code: string; name?: string | null }[];
}

/** Completed fixture: lists team standings penalties and lets league admins apply one. */
export function FixturePenaltyBar({ associationId, fixture, teams }: Props) {
  const isAdmin = useIsAssociationAdmin(associationId);
  const { data = [] } = useTeamPenalties(associationId, { fixtureId: fixture.id });
  const [open, setOpen] = useState(false);
  const active = data.filter((p) => !p.reversed_at);
  if (!isAdmin && active.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border px-2 py-1.5 text-xs flex flex-wrap items-center gap-2">
      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
      {active.length === 0 ? (
        <span className="text-muted-foreground">No standings penalties on this fixture.</span>
      ) : (
        active.map((p) => (
          <span key={p.id}>
            <b className="text-destructive">−{p.points}</b> {teams.find((t) => t.code.toUpperCase() === p.team_code)?.name || p.team_code} · {p.rule_name}
          </span>
        ))
      )}
      {isAdmin && (
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => setOpen(true)}>Apply penalty</Button>
      )}
      <ApplyTeamPenaltyDialog open={open} onOpenChange={setOpen} associationId={associationId}
        teams={teams.filter((t) => t.code && t.code !== "__BYE__")} fixture={fixture} />
    </div>
  );
}
