import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowUp, Check, X, Loader2 } from "lucide-react";

type Props = { clubId?: string | null };

/**
 * Admin queue for ladder position changes proposed by league / championship
 * results when the club has "Apply ladder moves automatically" switched off.
 */
export function LadderPendingMovesCard({ clubId }: Props) {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ladder-moves-pending", clubId],
    enabled: !!clubId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ladder_moves_pending")
        .select("*")
        .eq("club_id", clubId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const memberIds = Array.from(
    new Set(rows.flatMap((r) => [r.winner_member_id, r.loser_member_id]).filter(Boolean)),
  );

  const { data: names = new Map<string, string>() } = useQuery({
    queryKey: ["ladder-pending-names", memberIds],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("club_members")
        .select("id, name")
        .in("id", memberIds);
      const out = new Map<string, string>();
      (data || []).forEach((m: any) => out.set(m.id, m.name || "—"));
      return out;
    },
  });

  const act = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await (supabase as any).rpc(
        approve ? "approve_ladder_move_pending" : "reject_ladder_move_pending",
        { _pending_id: id },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Ladder move applied" : "Ladder move rejected");
      qc.invalidateQueries({ queryKey: ["ladder-moves-pending", clubId] });
      qc.invalidateQueries({ queryKey: ["club-members"] });
      qc.invalidateQueries({ queryKey: ["ladder"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not update this ladder move"),
  });

  if (!clubId) return null;
  if (!isLoading && rows.length === 0) return null;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowUp className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold">Pending ladder moves</p>
        {rows.length > 0 && (
          <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{rows.length}</Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Position changes proposed by league and championship results. Approve to apply them to the ladder.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md border p-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {names.get(r.winner_member_id) || "Player"} (#{r.winner_position}) beat{" "}
                  {names.get(r.loser_member_id) || "Player"} (#{r.loser_position})
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {r.source === "league" ? "League game" : r.source === "tournament" ? "Championship / tournament" : "Competition"}
                  {" · "}
                  {r.movement === "swap" ? "Swap positions" : `Take #${r.loser_position}, others move down`}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                disabled={act.isPending}
                onClick={() => act.mutate({ id: r.id, approve: false })}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                className="h-7 px-2"
                disabled={act.isPending}
                onClick={() => act.mutate({ id: r.id, approve: true })}
              >
                <Check className="w-3.5 h-3.5 mr-1" /> Approve
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
