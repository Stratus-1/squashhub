import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, History, Undo2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId: string;
  memberId: string | null;
  memberName?: string | null;
  /** Club admins may reverse an award straight from the history. */
  canManage?: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  challenge: "Ladder challenge",
  league: "League match",
  tournament: "Tournament / championship",
  match: "Club match",
  manual: "Manual adjustment",
  seed: "Opening balance",
  reversal: "Reversal",
};

/** "Where my points came from" — the full ranking transactions history for one member. */
export function RankingLedgerDialog({ open, onOpenChange, clubId, memberId, memberName, canManage }: Props) {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["ranking-ledger", clubId, memberId],
    enabled: open && !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ranking_points_ledger" as any)
        .select("id, created_at, delta, balance_after, reason, source_type, source_id, pending_id")
        .eq("club_id", clubId)
        .eq("member_id", memberId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const reversedPendingIds = new Set(
    rows.filter((r) => r.source_type === "reversal" && r.pending_id).map((r) => r.pending_id as string),
  );

  const reverse = async (pendingId: string) => {
    const why = prompt("Why is this award being reversed?");
    if (why === null) return;
    try {
      const { error } = await (supabase as any).rpc("reverse_ranking_points_pending", {
        _pending_id: pendingId,
        _reason: why.trim() || null,
      });
      if (error) throw error;
      toast.success("Award reversed — both players were corrected.");
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["ranking-points-leaderboard", clubId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not reverse this award");
    }
  };

  const earned = rows.filter((r) => Number(r.delta) > 0).reduce((s, r) => s + Number(r.delta), 0);
  const lost = rows.filter((r) => Number(r.delta) < 0).reduce((s, r) => s + Number(r.delta), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="w-4 h-4" />
            Where these points came from
          </DialogTitle>
          <DialogDescription className="text-xs">
            {memberName ? `${memberName} — every` : "Every"} points movement, newest first.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No points movements recorded yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Earned" value={`+${earned.toFixed(2)}`} tone="up" />
              <Stat label="Lost" value={lost.toFixed(2)} tone={lost < 0 ? "down" : "flat"} />
              <Stat label="Balance" value={Number(rows[0].balance_after ?? 0).toFixed(2)} tone="flat" />
            </div>

            <div className="max-h-[55vh] overflow-y-auto divide-y rounded-md border">
              {rows.map((r) => {
                const delta = Number(r.delta);
                return (
                  <div key={r.id} className="flex items-start justify-between gap-3 p-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_LABEL[r.source_type as string] ?? r.source_type ?? "Adjustment"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 break-words">{r.reason}</p>
                      {canManage && r.pending_id && r.source_type !== "reversal" && !reversedPendingIds.has(r.pending_id) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 mt-1 text-[11px] text-muted-foreground"
                          onClick={() => reverse(r.pending_id as string)}
                        >
                          <Undo2 className="w-3 h-3 mr-1" /> Reverse
                        </Button>
                      )}
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className={`text-sm font-semibold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        → {Number(r.balance_after ?? 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "up" | "down" | "flat" }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className={`text-sm font-semibold tabular-nums ${tone === "up" ? "text-emerald-600" : tone === "down" ? "text-destructive" : ""}`}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
