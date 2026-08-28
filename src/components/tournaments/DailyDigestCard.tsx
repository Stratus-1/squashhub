import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, X } from "lucide-react";
import {
  winnerMemberIds,
  winnersOn,
  hasKnockoutStage,
  type KoMatchLike,
} from "@/lib/tournaments/survivors";

interface Props {
  champId: string;
  matches: KoMatchLike[];
  /** Resolve a club member id to a display name. */
  getName: (memberId: string) => string;
  /** Test seam — defaults to now. */
  now?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The day the digest is about: today from 22:00, otherwise yesterday's round-up. */
export function digestDate(now: Date): string {
  if (now.getHours() >= 22) return ymd(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return ymd(y);
}

/**
 * Nightly "Well done to the winners" round-up for a knockout championship.
 * Lists only players who actually WON a knockout match (not everyone merely
 * still in). Stays on screen until closed, and only comes back the next day.
 * The first one ever shown covers the whole event so far.
 */
export function DailyDigestCard({ champId, matches, getName, now }: Props) {
  const storageKey = `sh.champ.digest.${champId}.last`;
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const today = now ?? new Date();
  const date = digestDate(today);
  const firstRun = dismissed === null;

  const winners = useMemo(() => {
    if (!hasKnockoutStage(matches)) return [] as string[];
    if (firstRun) return [...winnerMemberIds(matches)];
    return [...winnersOn(matches, date)];
  }, [matches, date, firstRun]);

  if (dismissed === date) return null;
  if (!winners.length) return null;

  const close = () => {
    try {
      localStorage.setItem(storageKey, date);
    } catch {
      /* ignore */
    }
    setDismissed(date);
  };

  const wonNames = winners
    .map((id) => getName(id))
    .filter((n) => n && n !== "Unknown")
    .sort((a, b) => a.localeCompare(b));

  if (!wonNames.length) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/5">
      <CardContent className="p-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <Trophy className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">
              {firstRun ? "Well done to the winners so far" : "Well done to the winners"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {firstRun ? "Everyone who has won a knockout match" : `Results of ${date}`}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={close}
            aria-label="Close round-up"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {wonNames.map((n) => (
            <Badge key={`w-${n}`} className="text-[11px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40" variant="outline">
              {n}
            </Badge>
          ))}
        </div>
      </CardContent>

    </Card>
  );
}

export default DailyDigestCard;
