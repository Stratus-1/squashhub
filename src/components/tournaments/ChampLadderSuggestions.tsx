import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { computeChampLadderSuggestions, type LadderSuggestion } from "@/lib/tournament-formats/handicap";
import { useMemberContext } from "@/contexts/MemberContext";

type Props = {
  champId: string;
  clubId: string;
  isAdmin: boolean;
};

/**
 * Post-tournament ladder-move suggestions based on how much each player
 * over- or under-performed the applied handicap. Admin-only apply button
 * writes new ladder_position values and logs each move in
 * ladder_adjustment_log for auditability.
 */
export function ChampLadderSuggestions({ champId, clubId, isAdmin }: Props) {
  const qc = useQueryClient();
  const { activeMember } = useMemberContext();
  const [applying, setApplying] = useState(false);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["champ-ladder-suggestions", champId],
    queryFn: () => computeChampLadderSuggestions(clubId, champId),
    enabled: !!champId && !!clubId,
    staleTime: 30_000,
  });

  const memberIds = useMemo(
    () => suggestions.map((s) => s.member_id),
    [suggestions],
  );

  const { data: memberNames = new Map<string, string>() } = useQuery({
    queryKey: ["champ-suggestion-names", memberIds],
    enabled: memberIds.length > 0,
    queryFn: async () => {
      const { data } = await fromExt("club_members")
        .select("id, name")
        .in("id", memberIds);
      const out = new Map<string, string>();
      (data || []).forEach((m: any) => out.set(m.id, m.name || "—"));
      return out;
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const batchId = crypto.randomUUID();
      // Apply in two passes so unique constraints on ladder_position
      // (if any) don't fire mid-way: park all targets in a high range,
      // then set final positions.
      const parkOffset = 1_000_000;
      for (const s of suggestions) {
        await fromExt("club_members")
          .update({ ladder_position: parkOffset + s.suggested_position })
          .eq("id", s.member_id);
      }
      for (const s of suggestions) {
        await fromExt("club_members")
          .update({ ladder_position: s.suggested_position })
          .eq("id", s.member_id);
        await fromExt("ladder_adjustment_log").insert({
          batch_id: batchId,
          club_id: clubId,
          club_member_id: s.member_id,
          old_position: s.current_position,
          new_position: s.suggested_position,
          reason: `Tournament handicap review (champ ${champId}, avg residual ${s.avg_residual.toFixed(1)} over ${s.sample_size} matches)`,
          applied_by: activeMember?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      toast.success(`Applied ${suggestions.length} ladder adjustments`);
      qc.invalidateQueries({ queryKey: ["champ-ladder-suggestions", champId] });
      qc.invalidateQueries({ queryKey: ["club-members"] });
      qc.invalidateQueries({ queryKey: ["ladder"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to apply adjustments"),
    onSettled: () => setApplying(false),
  });

  if (isLoading) return null;
  if (suggestions.length === 0) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Suggested Ladder Adjustments
          <Badge variant="secondary" className="ml-1 text-[10px]">{suggestions.length}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Based on average post-handicap margin in this tournament (target ≤ 3).
          Positive residual = overperformed → move up.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-1.5 font-medium">Player</th>
                <th className="pb-1.5 font-medium text-center">Now</th>
                <th className="pb-1.5 font-medium text-center">Suggested</th>
                <th className="pb-1.5 font-medium text-center">Δ</th>
                <th className="pb-1.5 font-medium text-center" title="Average post-handicap margin per match">Avg margin</th>
                <th className="pb-1.5 font-medium text-center">Matches</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s: LadderSuggestion) => {
                const up = s.delta < 0; // lower position number = higher rank
                return (
                  <tr key={s.member_id} className="border-b border-border/30">
                    <td className="py-1.5">{memberNames.get(s.member_id) || s.member_id.slice(0, 8)}</td>
                    <td className="py-1.5 text-center tabular-nums">#{s.current_position}</td>
                    <td className="py-1.5 text-center tabular-nums font-semibold">#{s.suggested_position}</td>
                    <td className="py-1.5 text-center">
                      <span className={`inline-flex items-center gap-0.5 tabular-nums font-medium ${up ? "text-emerald-600" : "text-rose-600"}`}>
                        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(s.delta)}
                      </span>
                    </td>
                    <td className="py-1.5 text-center tabular-nums">
                      {s.avg_residual > 0 ? "+" : ""}{s.avg_residual.toFixed(1)}
                    </td>
                    <td className="py-1.5 text-center tabular-nums text-muted-foreground">{s.sample_size}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              disabled={applying || applyMutation.isPending}
              onClick={() => {
                if (!confirm(`Apply ${suggestions.length} ladder adjustments? This will renumber those players and log an audit entry for each.`)) return;
                setApplying(true);
                applyMutation.mutate();
              }}
            >
              {applying || applyMutation.isPending ? "Applying…" : "Apply all"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
