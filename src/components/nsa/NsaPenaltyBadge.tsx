import { useNsaFixturePenalties } from "@/hooks/use-nsa";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";

interface Props {
  fixtureId: number | null | undefined;
  /** "home" | "away" — match against scraped team_side */
  teamSide?: "home" | "away";
  /** Match by team code (e.g. "CSI006") */
  teamCode?: string | null;
  className?: string;
}

/**
 * Renders a red penalty badge when NSA has applied a deduction to this team
 * on this fixture. Tooltip lists all reasons.
 */
export function NsaPenaltyBadge({ fixtureId, teamSide, teamCode, className }: Props) {
  const { data, isLoading } = useNsaFixturePenalties(fixtureId ?? null);

  if (isLoading || !data) return null;

  const teams = (data as any)?.teams as Array<any> | undefined;
  if (!teams || teams.length === 0) return null;

  const match = teams.find((t) => {
    if (teamSide && t.side === teamSide) return true;
    if (teamCode && (t.code || "").toUpperCase() === teamCode.toUpperCase()) return true;
    return false;
  });

  if (!match || !match.penalty_points) return null;

  const reasons: Array<{ label: string; points?: number }> = match.reasons || [];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className={`gap-1 font-mono cursor-help ${className ?? ""}`}>
            <AlertTriangle className="h-3 w-3" />
            {match.penalty_points} pts
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs font-semibold mb-1">NSA penalty applied</div>
          {reasons.length === 0 ? (
            <div className="text-xs text-muted-foreground">No reason published.</div>
          ) : (
            <ul className="text-xs space-y-0.5">
              {reasons.map((r, i) => (
                <li key={i}>
                  • {r.label}
                  {r.points !== undefined ? ` (${r.points})` : ""}
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default NsaPenaltyBadge;
