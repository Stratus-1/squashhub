import { useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MemberMatchRow,
  STAT_CATEGORY_LABELS,
  StatCategory,
  useMemberMatchHistory,
} from "@/hooks/use-member-stats";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string | null;
  category: StatCategory;
  /** null = All Time */
  seasonYear: number | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function MatchRow({
  m,
  onOpponent,
}: {
  m: MemberMatchRow;
  onOpponent?: (id: string, name: string) => void;
}) {
  const clickable = !!m.opponent_member_id && !!onOpponent;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <span
        className={cn(
          "w-6 h-6 rounded-md grid place-items-center text-[10px] font-bold shrink-0",
          m.won ? "bg-win/15 text-win" : "bg-loss/15 text-loss",
        )}
      >
        {m.won ? "W" : "L"}
      </span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          disabled={!clickable}
          onClick={() => clickable && onOpponent!(m.opponent_member_id!, m.opponent_name)}
          className={cn(
            "block text-[13px] font-medium text-foreground truncate text-left",
            clickable && "hover:underline",
          )}
        >
          {m.opponent_name}
        </button>
        <p className="text-[11px] text-muted-foreground truncate">
          {fmtDate(m.played_on)} · {m.event_label}
        </p>
      </div>
      <span className="text-[12px] tabular-nums text-muted-foreground shrink-0">
        {m.score || "—"}
      </span>
    </div>
  );
}

/**
 * Drill-down for one stat category: the matches behind the number, and a
 * head-to-head view when an opponent is picked.
 */
export function MatchHistorySheet({ open, onOpenChange, memberId, category, seasonYear }: Props) {
  const [opponent, setOpponent] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useMemberMatchHistory(memberId, {
    seasonYear,
    category,
    enabled: open,
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    return opponent ? all.filter((m) => m.opponent_member_id === opponent.id) : all;
  }, [data, opponent]);

  const record = useMemo(() => {
    const won = rows.filter((r) => r.won).length;
    return { played: rows.length, won, lost: rows.length - won };
  }, [rows]);

  const close = (v: boolean) => {
    if (!v) setOpponent(null);
    onOpenChange(v);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            {opponent && (
              <button
                type="button"
                onClick={() => setOpponent(null)}
                className="p-1 -ml-1 rounded hover:bg-muted"
                aria-label="Back to all matches"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            {opponent ? `vs ${opponent.name}` : `${STAT_CATEGORY_LABELS[category]} matches`}
            <Badge variant="outline" className="text-[10px]">
              {seasonYear ?? "All time"}
            </Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-4 py-2 text-[12px] text-muted-foreground">
          <span>
            <strong className="text-foreground tabular-nums">{record.played}</strong> played
          </span>
          <span>
            <strong className="text-win tabular-nums">{record.won}</strong> won
          </span>
          <span>
            <strong className="text-loss tabular-nums">{record.lost}</strong> lost
          </span>
        </div>

        {isLoading ? (
          <div className="py-10 grid place-items-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            No matches recorded yet.
          </p>
        ) : (
          <div className="pb-6">
            {rows.map((m) => (
              <MatchRow
                key={`${m.source}-${m.match_id}`}
                m={m}
                onOpponent={
                  opponent ? undefined : (id, name) => setOpponent({ id, name })
                }
              />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
