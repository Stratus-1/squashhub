import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Camera, History, Loader2, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";

const OFFICE_ROLES = ["Chairman", "Vice-Chairman", "Treasurer", "Secretary", "Club Captain", "Bar Manager"] as const;

interface ReviewRow {
  club_member_id: string;
  name: string;
  member_role: string;
  offices: string[];
  current: { is_full_admin: boolean; role_name: string | null; role_permissions: string[]; custom_permissions: string[] };
  proposed_role: string | null;
  used_90d: { finance_changes: number; comms_campaigns: number; cash_ups: number };
}

interface SnapshotRow {
  id: string;
  club_member_id: string;
  member_name?: string;
  taken_at: string;
  reason: string | null;
}

/**
 * Safe move away from "Full Admin": review each person's current rights against
 * the office-bearer defaults, snapshot first, apply per person, restore if needed.
 */
export function OfficeRoleReview({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [roleChoice, setRoleChoice] = useState<Record<string, string>>({});
  const [keepAdmin, setKeepAdmin] = useState<Record<string, boolean>>({});

  const { data: review = [], isLoading } = useQuery({
    queryKey: ["office-role-review", clubId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("club_permission_review", { p_club_id: clubId });
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["permission-snapshots", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_permission_snapshots")
        .select("id, club_member_id, taken_at, reason, club_members(name)")
        .eq("club_id", clubId)
        .order("taken_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((s: any) => ({ ...s, member_name: s.club_members?.name })) as SnapshotRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["office-role-review", clubId] });
    qc.invalidateQueries({ queryKey: ["permission-snapshots", clubId] });
    qc.invalidateQueries({ queryKey: ["all-member-permissions"] });
    qc.invalidateQueries({ queryKey: ["permission-roles", clubId] });
  };

  const snapshotAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("snapshot_club_permissions", { p_club_id: clubId, p_reason: "manual review snapshot" });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => { toast.success(`Saved the current rights of ${n} ${n === 1 ? "person" : "people"}`); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not save snapshot"),
  });

  const applyRole = useMutation({
    mutationFn: async (p: { memberId: string; role: string; keep: boolean }) => {
      const { error } = await (supabase.rpc as any)("apply_office_role", {
        p_club_member_id: p.memberId, p_role_name: p.role, p_keep_club_admin: p.keep,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role applied — their previous rights were saved first"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not apply role"),
  });

  const restore = useMutation({
    mutationFn: async (snapshotId: string) => {
      const { error } = await (supabase.rpc as any)("restore_permission_snapshot", { p_snapshot_id: snapshotId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Previous rights restored"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Could not restore"),
  });

  const usedLabel = (u: ReviewRow["used_90d"]) => {
    const parts: string[] = [];
    if (u.finance_changes > 0) parts.push(`${u.finance_changes} finance`);
    if (u.comms_campaigns > 0) parts.push(`${u.comms_campaigns} messages`);
    if (u.cash_ups > 0) parts.push(`${u.cash_ups} cash-ups`);
    return parts.length ? parts.join(", ") : "—";
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2"><UserCheck className="w-4 h-4" /> Move from Full Admin to office roles</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Review each person below, then move them onto the role that matches their office. Their current rights are
            saved automatically before every change and can be restored with one click. Nothing changes until you press Apply.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => snapshotAll.mutate()} disabled={snapshotAll.isPending}>
          {snapshotAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          Save everyone's current rights
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : review.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nobody in this club has admin access or permissions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Now</TableHead>
                <TableHead>Used in last 90 days</TableHead>
                <TableHead>Move to role</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.map((r) => {
                const chosen = roleChoice[r.club_member_id] ?? r.proposed_role ?? "";
                return (
                  <TableRow key={r.club_member_id}>
                    <TableCell>
                      <div className="text-[13px] font-medium">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.offices.length > 0 ? r.offices.join(", ") : r.member_role === "admin" ? "club admin" : r.member_role}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.current.is_full_admin && <Badge variant="destructive" className="text-[10px]">Full admin</Badge>}
                        {r.current.role_name && <Badge variant="secondary" className="text-[10px]">{r.current.role_name}</Badge>}
                        {r.current.custom_permissions.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">+{r.current.custom_permissions.length} extra</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">{usedLabel(r.used_90d)}</TableCell>
                    <TableCell>
                      <Select value={chosen} onValueChange={(v) => setRoleChoice((s) => ({ ...s, [r.club_member_id]: v }))}>
                        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Choose role…" /></SelectTrigger>
                        <SelectContent>
                          {OFFICE_ROLES.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <label className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Checkbox
                          checked={!!keepAdmin[r.club_member_id]}
                          onCheckedChange={(v) => setKeepAdmin((s) => ({ ...s, [r.club_member_id]: v === true }))}
                        />
                        Keep club admin status
                      </label>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!chosen || applyRole.isPending}
                        onClick={() => applyRole.mutate({ memberId: r.club_member_id, role: chosen, keep: !!keepAdmin[r.club_member_id] })}
                      >
                        Apply
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {snapshots.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          <h4 className="text-xs font-semibold flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Saved snapshots</h4>
          <ul className="divide-y divide-border">
            {snapshots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-[11px]">
                  <span className="font-medium">{s.member_name ?? "Member"}</span>
                  <span className="text-muted-foreground"> · {new Date(s.taken_at).toLocaleString("en-ZA")}{s.reason ? ` · ${s.reason}` : ""}</span>
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={restore.isPending} onClick={() => restore.mutate(s.id)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
