import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, X, HeartCrack } from "lucide-react";
import {
  eliminatedMemberIds,
  eliminatedOn,
  winnersOn,
  hasKnockoutStage,
  type KoMatchLike,
} from "@/lib/tournaments/survivors";

interface Props {
  champId: string;
  matches: KoMatchLike[];
  /** Resolve a club member id to a display name. */
  getName: (memberId: string) => string;
  /** Optional league label for a match group number. */
  getGroupLabel?: (gn: number | null) => string;
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
 * Nightly "Well done to the winners / Sorry to see you go" round-up for a
 * knockout championship. Stays on screen until the person closes it, and only
 * comes back the next day. The first one ever shown covers the whole event so
 * far rather than a single day.
 */
export function DailyDigestCard({ champId, matches, getName, getGroupLabel, now }: Props) {
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

  const { winners, gone } = useMemo(() => {
    if (!hasKnockoutStage(matches)) return { winners: [] as string[], gone: [] as string[] };
    if (firstRun) {
      const out = eliminatedMemberIds(matches);
      const survivors = new Set<string>();
      for (const m of matches) {
        for (const id of [
          m.player_a_member_id,
          m.player_b_member_id,
          (m as any).partner_a_member_id,
          (m as any).partner_b_member_id,
        ]) {
          if (id && !out.has(String(id))) survivors.add(String(id));
        }
      }
      return { winners: [...survivors], gone: [...out] };
    }
    return { winners: [...winnersOn(matches, date)], gone: [...eliminatedOn(matches, date)] };
  }, [matches, date, firstRun]);

  if (dismissed === date) return null;
  if (!winners.length && !gone.length) return null;

  const close = () => {
    try {
      localStorage.setItem(storageKey, date);
    } catch {
      /* ignore */
    }
    setDismissed(date);
  };

  const names = (ids: string[]) =>
    ids
      .map((id) => getName(id))
      .filter((n) => n && n !== "Unknown")
      .sort((a, b) => a.localeCompare(b));

  const wonNames = names(winners);
  const goneNames = names(gone);

  return (
    <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/5">
      <CardContent className="p-3 space-y-2.5">
        <div className="flex items-start gap-2">
          <Trophy className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold">
              {firstRun ? "Well done to everyone still in it" : "Well done to the winners"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {firstRun ? "Where the championship stands so far" : `Results of ${date}`}
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

        {wonNames.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {wonNames.map((n) => (
              <Badge key={`w-${n}`} className="text-[11px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40" variant="outline">
                {n}
              </Badge>
            ))}
          </div>
        )}

        {goneNames.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border/40">
            <p className="text-[13px] font-semibold flex items-center gap-1.5">
              <HeartCrack className="h-3.5 w-3.5 text-muted-foreground" />
              Sorry to see you go
            </p>
            <div className="flex flex-wrap gap-1">
              {goneNames.map((n) => (
                <Badge key={`g-${n}`} variant="secondary" className="text-[11px] line-through opacity-80">
                  {n}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {getGroupLabel ? null : null}
      </CardContent>
    </Card>
  );
}

export default DailyDigestCard;
