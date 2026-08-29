import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Wrench, ShieldCheck, AlertTriangle } from "lucide-react";

interface DriftRow {
  member_id: string;
  member_name: string;
  stored: number;
  computed: number;
  drift: number;
}

interface Props {
  clubId: string;
  members: { id: string; name: string | null; ranking_points?: number | null }[];
}

/**
 * Corrections & re-run safety.
 * - Rebuilds every balance from the recorded ledger so a re-run or an edited
 *   result can never leave silent drift behind.
 * - Manual, reason-required adjustments that are themselves written to the ledger.
 */
export function RankingCorrectionsCard({ clubId, members }: Props) {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [drift, setDrift] = useState<DriftRow[] | null>(null);

  const [memberId, setMemberId] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const runCheck = async (apply: boolean) => {
    apply ? setApplying(true) : setChecking(true);
    try {
      const { data, error } = await (supabase as any).rpc("recalc_club_ranking_points", {
        _club_id: clubId,
        _apply: apply,
      });
      if (error) throw error;
      const rows = (data || []) as DriftRow[];
      setDrift(apply ? [] : rows);
      if (apply) {
        toast.success(rows.length ? `Repaired ${rows.length} balance${rows.length === 1 ? "" : "s"}` : "Nothing to repair");
        queryClient.invalidateQueries({ queryKey: ["ranking-points-leaderboard", clubId] });
      } else {
        toast.success(rows.length ? `${rows.length} balance${rows.length === 1 ? "" : "s"} out of sync` : "All balances match the ledger");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Check failed");
    } finally {
      setApplying(false);
      setChecking(false);
    }
  };

  const adjust = async () => {
    if (!memberId) return toast.error("Pick a member");
    const n = Number(delta);
    if (!n) return toast.error("Enter a non-zero adjustment");
    if (reason.trim().length < 3) return toast.error("Give a reason for the audit trail");
    setAdjusting(true);
    try {
      const { error } = await (supabase as any).rpc("admin_adjust_ranking_points", {
        _member_id: memberId,
        _delta: n,
        _reason: reason.trim(),
      });
      if (error) throw error;
      toast.success("Adjustment recorded");
      setDelta("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["ranking-points-leaderboard", clubId] });
      queryClient.invalidateQueries({ queryKey: ["ranking-ledger", clubId, memberId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Adjustment failed");
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Wrench className="w-4 h-4" /> Corrections &amp; re-run safety
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every balance should equal the sum of that member's points history. Check after re-running or editing results.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => runCheck(false)} disabled={checking || applying}>
          {checking ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
          Check for drift
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (confirm("Rebuild every member's ranking balance from their recorded history?")) runCheck(true);
          }}
          disabled={checking || applying}
        >
          {applying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
          Repair balances
        </Button>
      </div>

      {drift !== null && (
        drift.length === 0 ? (
          <p className="text-xs text-emerald-600 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> All balances match the recorded history.
          </p>
        ) : (
          <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
            {drift.map((d) => (
              <div key={d.member_id} className="flex items-center justify-between gap-2 p-2 text-xs">
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  {d.member_name}
                </span>
                <span className="tabular-nums shrink-0">
                  {Number(d.stored).toFixed(2)} → {Number(d.computed).toFixed(2)}
                  <Badge variant="outline" className="ml-1.5 text-[10px]">
                    {Number(d.drift) > 0 ? "+" : ""}{Number(d.drift).toFixed(2)}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        )
      )}

      <div className="border-t pt-3 space-y-2">
        <Label className="text-xs">Manual adjustment</Label>
        <div className="grid gap-2 sm:grid-cols-[1fr_100px]">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">Select member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name ?? "Unnamed"}</option>
            ))}
          </select>
          <Input
            type="number"
            step="0.25"
            placeholder="+/- pts"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="h-8"
          />
        </div>
        <Input
          placeholder="Reason (recorded in the member's history)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-8"
        />
        <Button size="sm" variant="outline" onClick={adjust} disabled={adjusting}>
          {adjusting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Apply adjustment
        </Button>
      </div>
    </Card>
  );
}
