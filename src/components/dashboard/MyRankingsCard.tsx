import { useState } from "react";
import { ChevronRight, Loader2, Minus, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMemberRankings, useNearbyRankings } from "@/hooks/use-member-rankings";
import { useRankingMovement, rankDelta } from "@/hooks/use-ranking-movement";
import { useProvisionalSettings, useClubRankedMatchCounts } from "@/hooks/use-provisional-ranking";
import { ProvisionalBadge } from "@/components/rankings/ProvisionalBadge";
import { DEFAULT_PROVISIONAL, RANKING_SCOPE_LABELS, RankingScope } from "@/lib/rankings/provisional";

interface Props {
  clubId: string | null;
  memberId: string | null;
}

function Movement({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[11px] font-semibold",
        delta > 0 ? "text-win" : delta < 0 ? "text-loss" : "text-muted-foreground",
      )}
      title="Movement since the last ranking snapshot"
    >
      <Icon className="w-3.5 h-3.5" />
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

/**
 * MY RANKINGS — where the member stands right now on each ranking system
 * SquashHub already runs (club, regional, national). Performance history
 * lives in MyStatsCard.
 */
export function MyRankingsCard({ clubId, memberId }: Props) {
  const { data: rankings, isLoading } = useMemberRankings(clubId, memberId);
  const [detail, setDetail] = useState<RankingScope | null>(null);

  const movement = useRankingMovement(clubId, !!rankings?.club);
  const prev = memberId ? movement.data?.byMember.get(memberId) : undefined;

  const { data: provisional } = useProvisionalSettings("club", clubId);
  const { data: matchCounts } = useClubRankedMatchCounts(clubId);
  const clubSettings = provisional ?? DEFAULT_PROVISIONAL;
  const myMatches = memberId ? (matchCounts?.get(memberId) ?? 0) : 0;

  const scopes: RankingScope[] = ["club", "association", "national"];
  const active = detail ? rankings?.[detail] : null;
  const nearby = useNearbyRankings(active?.snapshotId, active?.rank, !!detail);

  if (!isLoading && rankings && Object.keys(rankings).length === 0) return null;

  return (
    <Card className="p-3 rounded-2xl">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-heading uppercase tracking-[0.18em] text-foreground">
          My Rankings
        </h2>
      </div>

      {isLoading ? (
        <div className="py-6 grid place-items-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {scopes.map((scope) => {
            const r = rankings?.[scope];
            const delta =
              scope === "club"
                ? r
                  ? rankDelta(r.rank, prev?.previousRank)
                  : null
                : r && r.previousRank != null
                  ? r.previousRank - r.rank
                  : null;
            const tappable = !!r && (scope === "club" || !!r.snapshotId);
            return (
              <button
                key={scope}
                type="button"
                disabled={!tappable}
                onClick={() => tappable && setDetail(scope)}
                className="w-full flex items-center justify-between gap-3 py-2 text-left disabled:cursor-default"
              >
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    {RANKING_SCOPE_LABELS[scope]}
                    {scope === "club" && r && (
                      <ProvisionalBadge
                        matchesPlayed={myMatches}
                        settings={clubSettings}
                        scopeLabel={RANKING_SCOPE_LABELS.club}
                      />
                    )}
                  </div>
                  {r ? (
                    <p className="text-base font-heading font-bold text-foreground tabular-nums leading-tight">
                      #{r.rank}
                      <span className="text-[12px] font-medium text-muted-foreground">
                        {" "}
                        · {r.points.toFixed(2)} pts
                      </span>
                    </p>
                  ) : (
                    <p className="text-base font-heading font-bold text-muted-foreground leading-tight">
                      —
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Movement delta={delta} />
                  {tappable && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Sheet open={detail !== null} onOpenChange={(v) => !v && setDetail(null)}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base">
              {detail ? RANKING_SCOPE_LABELS[detail] : ""}
            </SheetTitle>
          </SheetHeader>
          {detail === "club" ? (
            <p className="py-4 text-[13px] text-muted-foreground">
              You are <strong className="text-foreground">#{rankings?.club?.rank}</strong> on the
              club points list with{" "}
              <strong className="text-foreground">{rankings?.club?.points.toFixed(2)}</strong>{" "}
              points.{" "}
              <a href="/ladder" className="text-primary hover:underline">
                Open the club ladder
              </a>
              .
            </p>
          ) : nearby.isLoading ? (
            <div className="py-8 grid place-items-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="py-2 pb-6">
              {(nearby.data ?? []).map((row) => {
                const isMe = active?.playerCode && row.playerCode === active.playerCode;
                return (
                  <div
                    key={`${row.rank}-${row.playerCode}`}
                    className={cn(
                      "flex items-center gap-3 py-2 border-b border-border last:border-0",
                      isMe && "bg-primary/5 rounded-md px-2",
                    )}
                  >
                    <span className="w-8 text-[12px] font-bold tabular-nums text-muted-foreground">
                      #{row.rank}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[13px] truncate",
                        isMe ? "font-semibold text-foreground" : "text-foreground/80",
                      )}
                    >
                      {row.name}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {row.score.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
