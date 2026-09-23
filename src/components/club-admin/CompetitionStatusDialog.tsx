import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompetitionStatus } from "@/hooks/use-competition-status";
import { toast } from "sonner";

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Not active" },
  { value: "unknown", label: "Not confirmed" },
];

/**
 * Lets a club admin set a player's league registration and Squash South Africa
 * membership status by hand. Anything set here is marked as entered by hand and
 * the automatic sync never overwrites it.
 */
export function CompetitionStatusDialog({
  memberId, memberName, onClose,
}: { memberId: string; memberName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const status = useCompetitionStatus(memberId);
  const affiliations = (status?.rows ?? []).filter((r) => r.association_id);
  const first = status?.rows?.[0];

  const [leagueByAssoc, setLeagueByAssoc] = useState<Record<string, string>>({});
  const [ssaNumber, setSsaNumber] = useState("");
  const [ssaStatus, setSsaStatus] = useState("unknown");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!status || loaded) return;
    const map: Record<string, string> = {};
    affiliations.forEach((r) => { map[r.association_id!] = r.league_status || "unknown"; });
    setLeagueByAssoc(map);
    setSsaNumber(first?.ssa_number || "");
    setSsaStatus((first?.ssa_status || "unknown").toLowerCase());
    setLoaded(true);
  }, [status, loaded, affiliations, first]);

  const save = async () => {
    setSaving(true);
    try {
      for (const r of affiliations) {
        const next = leagueByAssoc[r.association_id!];
        if (!next || next === (r.league_status || "unknown")) continue;
        const { error } = await (supabase as any).rpc("admin_set_competition_status", {
          _club_member_id: memberId,
          _association_id: r.association_id,
          _league_status: next,
        });
        if (error) throw error;
      }
      const ssaChanged =
        ssaNumber.trim() !== (first?.ssa_number || "") ||
        ssaStatus !== (first?.ssa_status || "unknown").toLowerCase();
      if (ssaChanged) {
        const { error } = await (supabase as any).rpc("admin_set_competition_status", {
          _club_member_id: memberId,
          _ssa_number: ssaNumber.trim() || null,
          _ssa_status: ssaStatus,
        });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["competition-status", memberId] });
      toast.success(`Status saved for ${memberName}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not save the status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Competition status — {memberName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!status && <p className="text-xs text-muted-foreground">Loading…</p>}
          {status && affiliations.length === 0 && (
            <p className="text-xs text-muted-foreground">This member is not affiliated to a league association yet.</p>
          )}
          {affiliations.map((r) => (
            <div key={r.association_id}>
              <Label className="text-xs">
                {r.association_name || "League"}{r.league_number ? ` · ${r.league_number}` : ""}
              </Label>
              <Select
                value={leagueByAssoc[r.association_id!] || "unknown"}
                onValueChange={(v) => setLeagueByAssoc((p) => ({ ...p, [r.association_id!]: v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {r.league_source && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Last set by {r.league_source === "manual" ? "hand" : r.league_source.replace(/_/g, " ")}
                  {r.league_checked_at ? ` · ${new Date(r.league_checked_at).toLocaleDateString()}` : ""}
                </p>
              )}
            </div>
          ))}
          <div>
            <Label className="text-xs">Squash South Africa number</Label>
            <Input className="mt-1" value={ssaNumber} onChange={(e) => setSsaNumber(e.target.value)} placeholder="e.g. 108189" />
          </div>
          <div>
            <Label className="text-xs">Squash South Africa membership</Label>
            <Select value={ssaStatus} onValueChange={setSsaStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Anything you set here stays as you set it — the automatic check from SportyHQ or the association site
            will not change it again.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving || !status}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
