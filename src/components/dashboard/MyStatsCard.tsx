import { useMemo, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  STAT_CATEGORY_LABELS,
  STAT_CATEGORY_ORDER,
  StatCategory,
  useMemberStatSeasons,
  useMemberStatsSummary,
} from "@/hooks/use-member-stats";
import { useMyClub } from "@/hooks/use-club";
import { MatchHistorySheet } from "./MatchHistorySheet";

const CATEGORY_ACCENT: Record<string, string> = {
  club: "hsl(var(--member-courts, var(--primary)))",
  league: "hsl(var(--member-leagues, var(--primary)))",
  regional: "hsl(var(--member-profile, var(--primary)))",
  national: "hsl(var(--member-ladder, var(--primary)))",
};

/** Compact wins-vs-losses ring; a dashed neutral ring when there are no matches. */
function WinLossDonut({ won, lost }: { won: number; lost: number }) {
  const total = won + lost;
  const r = 15, c = 2 * Math.PI * r;
  const pct = total ? Math.round((won / total) * 100) : 0;
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden="true">
      {total ? (
        <>
          <circle cx="20" cy="20" r={r} fill="none" strokeWidth="6" className="stroke-loss" />
          <circle cx="20" cy="20" r={r} fill="none" strokeWidth="6" className="stroke-win" strokeDasharray={`${(won / total) * c} ${c}`} />
          <text x="20" y="20" transform="rotate(90 20 20)" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[10px] font-bold">{pct}%</text>
        </>
      ) : (
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeDasharray="3 3" className="stroke-muted-foreground/40" />
      )}
    </svg>
  );
}

interface Props {
  memberId: string | null;
}

/**
 * MY STATS — the member's own performance history, by season and by category.
 * Ranking / standing information deliberately lives in MyRankingsCard.
 */
export function MyStatsCard({ memberId }: Props) {
  const { data: seasons } = useMemberStatSeasons(memberId);
  const [season, setSeason] = useState<number | null | undefined>(undefined);
  const [openCategory, setOpenCategory] = useState<StatCategory | null>(null);

  const seasonOptions = useMemo(() => {
    const years = new Set<number>(seasons ?? []);
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [seasons]);

  // Default to All Time; members can switch to a specific year.
  const activeSeason = season === undefined ? null : season;

  const { data: summary } = useMemberStatsSummary(memberId, activeSeason);
  const stats = summary?.byCategory;
  const computedAt = summary?.computedAt ?? null;
  const { data: clubData } = useMyClub();
  const club = clubData?.club;
  const statsActivated = !!club?.sla_accepted_at;

  const total = stats?.total;


  return (
    <Card className="p-3 rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-heading font-semibold text-foreground">
          My Stats
        </h2>
        <div className="flex items-center gap-1 max-w-full overflow-x-auto">
          {seasonOptions.map((y) => (
            <Button variant="ghost"
              key={y}
              onClick={() => setSeason(y)}
              className={cn(
                "h-11 min-w-11 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                activeSeason === y
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {y}
            </Button>
          ))}
          <Button variant="ghost"
            onClick={() => setSeason(null)}
            className={cn(
              "h-11 min-w-11 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors",
              activeSeason === null
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            All Time
          </Button>
        </div>
      </div>

      {total && (
        <Button variant="ghost"
          onClick={() => setOpenCategory("total")}
          className="h-auto min-h-16 w-full rounded-lg bg-muted/40 border border-border px-3 py-2.5 mb-2 flex items-center justify-between text-left"
        >
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Overall</p>
            <p className="text-lg font-heading font-bold text-foreground tabular-nums leading-tight">
              {total.played} played
              <span className="text-sm font-medium text-muted-foreground">
                {" "}
                · {total.won}W – {total.lost}L
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-heading font-bold text-primary tabular-nums">
              {total.winRate}%
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {STAT_CATEGORY_ORDER.filter((c) => c !== "total").map((c) => {
          const s = stats?.[c];
          const played = s?.played ?? 0;
          const accent = CATEGORY_ACCENT[c];
          return (
            <Button variant="ghost"
              key={c}
              onClick={() => setOpenCategory(c)}
              aria-label={`${STAT_CATEGORY_LABELS[c]} ${played} played, ${s?.won ?? 0} won, ${s?.lost ?? 0} lost`}
              className="h-auto min-h-20 flex items-center gap-2.5 rounded-lg border border-border border-l-4 p-2.5 text-left transition-colors hover:bg-muted/60"
              style={{ borderLeftColor: accent, backgroundColor: `color-mix(in hsl, ${accent} 8%, transparent)` }}
            >
              <WinLossDonut won={s?.won ?? 0} lost={s?.lost ?? 0} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
                    {STAT_CATEGORY_LABELS[c]}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <p className="text-base font-heading font-bold text-foreground tabular-nums leading-tight">
                  {played}
                  <span className="text-[11px] font-medium text-muted-foreground"> played</span>
                </p>
                <p className="text-[11px] tabular-nums">
                  {played ? (
                    <><span className="font-semibold text-win">{s?.won ?? 0}W</span><span className="text-muted-foreground"> – </span><span className="font-semibold text-loss">{s?.lost ?? 0}L</span></>
                  ) : <span className="text-muted-foreground">No matches yet</span>}
                </p>
              </div>
            </Button>
          );
        })}
      </div>

      {computedAt && (
        <p className="mt-2 text-xs text-muted-foreground">
          Updated{" "}
          {new Date(computedAt).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}

      {!statsActivated && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/40 border border-border px-2.5 py-2">
          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs leading-snug text-muted-foreground">
            Full stats will be activated once your club subscribes to SquashHub.
          </p>
        </div>
      )}

      <MatchHistorySheet
        open={openCategory !== null}
        onOpenChange={(v) => !v && setOpenCategory(null)}
        memberId={memberId}
        category={openCategory ?? "total"}
        seasonYear={activeSeason}
      />
    </Card>
  );
}

