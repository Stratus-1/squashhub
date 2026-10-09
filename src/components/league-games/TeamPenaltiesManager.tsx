import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useIsAssociationAdmin } from "@/hooks/use-association-admin";
import { usePenaltyRules, useReverseTeamPenalty, useSavePenaltyRule, useTeamPenalties, type PenaltyRule } from "@/hooks/use-league-penalties";
import { ApplyTeamPenaltyDialog } from "./ApplyTeamPenaltyDialog";

/** League Settings → Rules & Penalties: team penalty rules, season penalties, history. */
export function TeamPenaltiesManager({ associationId }: { associationId: string }) {
  const isAdmin = useIsAssociationAdmin(associationId);
  const { data: rules = [] } = usePenaltyRules(associationId);
  const { data: history = [] } = useTeamPenalties(associationId);
  const save = useSavePenaltyRule();
  const reverse = useReverseTeamPenalty();
  const [edit, setEdit] = useState<Partial<PenaltyRule> | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [rev, setRev] = useState<{ id: string; reason: string } | null>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["penalty-teams", associationId],
    queryFn: async () => {
      const { data } = await supabase.from("leagues").select("code, name, archived_at").eq("association_id", associationId);
      const m = new Map<string, string>();
      (data ?? []).forEach((l: any) => { if (l.code && !l.archived_at) m.set(l.code.toUpperCase(), l.name); });
      return [...m].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
    },
  });
  const nameOf = useMemo(() => new Map(teams.map((t) => [t.code, t.name])), [teams]);

  const saveRule = async () => {
    if (!edit) return;
    try {
      await save.mutateAsync({ associationId, id: edit.id, name: edit.name ?? "", description: edit.description ?? "",
        defaultPoints: Math.abs(Math.round(Number(edit.default_points) || 0)), isActive: edit.is_active ?? true });
      toast.success("Penalty rule saved"); setEdit(null);
    } catch (e: any) { toast.error(e?.message || "Could not save rule"); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Team penalty rules (standings points)</h3>
          {isAdmin && <Button size="sm" onClick={() => setEdit({ is_active: true })}>Add rule</Button>}
        </div>
        {rules.length === 0 && <p className="text-xs text-muted-foreground">No rules yet.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-2 border-t pt-2 text-sm">
            <div>
              <div className="font-medium">{r.name} <span className="text-destructive font-mono">−{r.default_points}</span>
                {!r.is_active && <Badge variant="outline" className="ml-2 text-[10px]">Inactive</Badge>}</div>
              {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
            </div>
            {isAdmin && <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>Edit</Button>}
          </div>
        ))}
      </Card>

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Penalty history</h3>
          {isAdmin && <Button size="sm" variant="outline" onClick={() => setApplyOpen(true)}>Season penalty</Button>}
        </div>
        {history.length === 0 && <p className="text-xs text-muted-foreground">No team penalties applied.</p>}
        {history.map((p) => (
          <div key={p.id} className={`border-t pt-2 text-xs flex justify-between gap-2 ${p.reversed_at ? "opacity-60" : ""}`}>
            <div className="space-y-0.5">
              <div className="text-sm">
                <span className={p.reversed_at ? "line-through" : "text-destructive font-semibold"}>−{p.points}</span>{" "}
                <b>{nameOf.get(p.team_code) || p.team_code}</b> · {p.rule_name}
              </div>
              <div className="text-muted-foreground">
                {format(parseISO(p.effective_date), "d MMM yyyy")} · {p.fixture_id ? "Fixture penalty" : "Season penalty"} · applied {format(parseISO(p.applied_at), "d MMM yyyy HH:mm")}
              </div>
              {p.reason && <div>{p.reason}</div>}
              {p.reversed_at && <div>Reversed {format(parseISO(p.reversed_at), "d MMM yyyy")}: {p.reversal_reason}</div>}
            </div>
            {isAdmin && !p.reversed_at && (
              <Button size="sm" variant="ghost" onClick={() => setRev({ id: p.id, reason: "" })}>Reverse</Button>
            )}
          </div>
        ))}
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit penalty rule" : "New penalty rule"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="pr-name">Name</Label>
              <Input id="pr-name" value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="pr-desc">Description</Label>
              <Textarea id="pr-desc" rows={2} value={edit?.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="pr-pts">Default points deducted</Label>
              <Input id="pr-pts" type="number" min={1} value={edit?.default_points ?? ""}
                onChange={(e) => setEdit({ ...edit, default_points: Number(e.target.value.replace("-", "")) })} /></div>
            <div className="flex items-center gap-2"><Switch id="pr-active" checked={edit?.is_active ?? true}
              onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} /><Label htmlFor="pr-active">Active</Label></div>
          </div>
          <DialogFooter><Button onClick={saveRule} disabled={save.isPending || !edit?.name || !(Number(edit?.default_points) > 0)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rev} onOpenChange={(o) => !o && setRev(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reverse penalty</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">The points are restored to the team's standings. The record stays in history.</p>
          <Label htmlFor="rev-reason">Reason</Label>
          <Textarea id="rev-reason" rows={2} value={rev?.reason ?? ""} onChange={(e) => rev && setRev({ ...rev, reason: e.target.value })} />
          <DialogFooter>
            <Button variant="destructive" disabled={!rev?.reason.trim() || reverse.isPending} onClick={async () => {
              try { await reverse.mutateAsync(rev!); toast.success("Penalty reversed"); setRev(null); }
              catch (e: any) { toast.error(e?.message || "Could not reverse"); }
            }}>Reverse penalty</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApplyTeamPenaltyDialog open={applyOpen} onOpenChange={setApplyOpen} associationId={associationId} teams={teams} />
    </div>
  );
}
