import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type Row = {
  id: string;
  name: string | null;
  club_member_number: string | null;
  email: string | null;
  suspension_status: string;
  suspension_reason: string | null;
  suspension_outstanding: number | null;
  suspension_manual: boolean;
  suspended_at: string | null;
};

export function SuspendedMembersPanel({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["suspended-members", clubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, club_member_number, email, suspension_status, suspension_reason, suspension_outstanding, suspension_manual, suspended_at")
        .eq("club_id", clubId)
        .in("suspension_status", ["suspended", "warning", "manual_hold"])
        .order("suspended_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return data || [];
    return (data || []).filter((r) =>
      [r.name, r.email, r.club_member_number].some((v) => v && v.toLowerCase().includes(f))
    );
  }, [data, filter]);

  const setStatus = async (row: Row, action: "suspend" | "clear") => {
    setBusy(row.id);
    try {
      const nextStatus = action === "suspend" ? "manual_hold" : "active";
      const patch: any = {
        suspension_status: nextStatus,
        suspension_manual: action === "suspend",
        suspension_reason: action === "suspend" ? "Manually suspended by admin" : null,
        suspended_at: action === "suspend" ? new Date().toISOString() : row.suspended_at,
        suspension_cleared_at: action === "clear" ? new Date().toISOString() : null,
      };
      const { error } = await supabase.from("club_members").update(patch).eq("id", row.id);
      if (error) throw error;
      await supabase.from("member_suspension_log").insert({
        club_id: clubId,
        club_member_id: row.id,
        previous_status: row.suspension_status,
        new_status: nextStatus,
        reason: patch.suspension_reason,
        outstanding: row.suspension_outstanding,
        changed_by: user?.id,
        automatic: false,
      });
      toast.success(action === "suspend" ? "Member suspended" : "Access restored");
      qc.invalidateQueries({ queryKey: ["suspended-members", clubId] });
      qc.invalidateQueries({ queryKey: ["access-gate"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          <div>
            <h3 className="font-semibold text-base">Suspended & At-Risk Members</h3>
            <p className="text-xs text-muted-foreground">
              Members currently blocked from bookings, doors, or other club features.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      <Input
        placeholder="Search by name, email or member #"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-8 text-xs"
      />

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
          <Users className="w-5 h-5 opacity-50" />
          No members currently suspended or at risk.
        </div>
      ) : (
        <div className="divide-y border rounded">
          {rows.map((r) => {
            const isSusp = r.suspension_status === "suspended" || r.suspension_status === "manual_hold";
            return (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{r.name || "Unnamed"}</p>
                    {r.club_member_number && (
                      <span className="text-[11px] text-muted-foreground">#{r.club_member_number}</span>
                    )}
                    <Badge variant={isSusp ? "destructive" : "secondary"} className="text-[10px]">
                      {r.suspension_status}
                    </Badge>
                    {r.suspension_manual && (
                      <Badge variant="outline" className="text-[10px]">manual</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.suspension_reason || "—"}
                    {r.suspension_outstanding != null && Number(r.suspension_outstanding) > 0 && (
                      <> · R{Number(r.suspension_outstanding).toFixed(0)} outstanding</>
                    )}
                  </p>
                </div>
                {isSusp ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => setStatus(r, "clear")}
                    className="gap-1.5 h-7 text-xs"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" /> Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy === r.id}
                    onClick={() => setStatus(r, "suspend")}
                    className="gap-1.5 h-7 text-xs"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" /> Suspend
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
