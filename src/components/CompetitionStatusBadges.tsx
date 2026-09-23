import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompetitionStatus } from "@/hooks/use-competition-status";
import { cn } from "@/lib/utils";

/**
 * Warn-only indicator: shows when a player's league registration or
 * Squash South Africa membership is not confirmed active. Never blocks.
 */
export function CompetitionStatusBadges({
  memberId, associationId, className, showUnknown = false,
}: { memberId: string; associationId?: string | null; className?: string; showUnknown?: boolean }) {
  const s = useCompetitionStatus(memberId, associationId);
  if (!s) return null;
  const issues: string[] = [];
  if (s.league === "inactive") issues.push("League registration inactive");
  else if (s.league === "unknown" && showUnknown) issues.push("League registration not confirmed");
  if (s.ssa === "inactive") issues.push("Squash South Africa membership not active");
  else if (s.ssa === "unknown" && showUnknown) issues.push("Squash South Africa membership not confirmed");
  if (!issues.length) return null;
  const hard = s.league === "inactive" || s.ssa === "inactive";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex shrink-0", hard ? "text-destructive" : "text-muted-foreground", className)} aria-label={issues.join(", ")}>
          <AlertTriangle className="w-3.5 h-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {issues.map((i) => <div key={i}>{i}</div>)}
        <div className="text-muted-foreground mt-1">Warning only — player can still be selected.</div>
      </TooltipContent>
    </Tooltip>
  );
}
