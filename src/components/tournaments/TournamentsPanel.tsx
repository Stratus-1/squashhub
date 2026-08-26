import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ShieldCheck } from "lucide-react";
import { useTournamentsByOwner } from "@/hooks/use-tournaments";
import { TournamentGovernanceDialog } from "./TournamentGovernanceDialog";

interface Props {
  /** Owning body — club, association or national federation. */
  ownerOrgId: string | null;
  title?: string;
  description?: string;
}

/**
 * Owner-agnostic tournament list. Structure/scoring stays in the setup wizard;
 * this panel only exposes governance for ownership, eligibility and fees.
 */
export function TournamentsPanel({ ownerOrgId, title = "Tournaments", description }: Props) {
  const navigate = useNavigate();
  const { data: tournaments = [], isLoading } = useTournamentsByOwner(ownerOrgId);
  const [governance, setGovernance] = useState<{ id: string; name: string } | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && tournaments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tournaments are owned by this body yet. Set the owning body from a tournament's Governance dialog.
          </p>
        )}
        {tournaments.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{t.name}</div>
              <div className="text-xs text-muted-foreground">
                {t.start_date} → {t.end_date} · {t.match_type === "doubles" ? "Doubles" : "Singles"}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
              <Button variant="outline" size="sm" onClick={() => navigate(`/club-champs/${t.id}`)}>
                <Eye className="w-4 h-4 mr-1" /> View
              </Button>
              <Button variant="outline" size="sm" onClick={() => setGovernance({ id: t.id, name: t.name })}>
                <ShieldCheck className="w-4 h-4 mr-1" /> Governance
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <TournamentGovernanceDialog champ={governance} onOpenChange={(v) => !v && setGovernance(null)} />
    </Card>
  );
}
