import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_PROVISIONAL,
  ProvisionalSettings,
  matchesRemaining,
  rankingStatus,
} from "@/lib/rankings/provisional";

interface Props {
  matchesPlayed: number;
  settings?: ProvisionalSettings;
  /** Optional label of the ranking system, e.g. "Club ranking". */
  scopeLabel?: string;
  className?: string;
}

/**
 * Shows "Provisional" next to a points figure until the player has played the
 * configured number of ranked matches in THAT ranking system.
 */
export function ProvisionalBadge({ matchesPlayed, settings = DEFAULT_PROVISIONAL, scopeLabel, className }: Props) {
  if (rankingStatus(matchesPlayed, settings) === "official") return null;
  const left = matchesRemaining(matchesPlayed, settings);
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 ${className ?? ""}`}
      title={`${scopeLabel ? scopeLabel + ": " : ""}provisional — ${left} more ranked ${left === 1 ? "match" : "matches"} to become official.`}
    >
      Provisional
    </Badge>
  );
}
