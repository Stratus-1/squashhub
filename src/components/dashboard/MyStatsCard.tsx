import { useMemo, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
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

  // Default to the newest season with data, until the member chooses.
  const activeSeason = season === undefined ? (seasonOptions[0] ?? null) : season;

  const { data: summary } = useMemberStatsSummary(memberId, activeSeason);
  const stats = summary?.byCategory;
  const computedAt = summary?.computedAt ?? null;

  const total = stats?.total;


  return (
    <Card className="p-3 rounded-2xl">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-xs font-heading uppercase tracking-[0.18em] text-foreground">
          My Stats
        </h2>
        <div className="flex items-center gap-1 overflow-x-auto">
          {seasonOptions.map((y) => (
            <button
              key={y}
              onClick={() => setSeason(y)}
              className={cn(
                "px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                activeSeason === y
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {y}
            </button>
          ))}
          <button
            onClick={() => setSeason(null)}
            className={cn(
              "px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors",
              activeSeason === null
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            All Time
          </button>
        </div>
      </div>

      {total && (
        <button
          onClick={() => setOpenCategory("total")}
          className="w-full rounded-xl bg-muted/40 border border-border px-3 py-2.5 mb-2 flex items-center justify-between text-left"
        >
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overall</p>
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
        </button>
      )}

      <div className="grid grid-cols-2 gap-2">
        {STAT_CATEGORY_ORDER.filter((c) => c !== "total").map((c) => {
          const s = stats?.[c];
          return (
            <button
              key={c}
              onClick={() => setOpenCategory(c)}
              className="rounded-lg bg-muted/40 border border-border p-2.5 text-left hover:bg-muted/60 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {STAT_CATEGORY_LABELS[c]}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <p className="text-base font-heading font-bold text-foreground tabular-nums leading-tight">
                {s?.played ?? 0}
                <span className="text-[11px] font-medium text-muted-foreground"> played</span>
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {s?.won ?? 0}W – {s?.lost ?? 0}L · {s?.winRate ?? 0}%
              </p>
            </button>
          );
        })}
      </div>

      {computedAt && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Updated{" "}
          {new Date(computedAt).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
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

