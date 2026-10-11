import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applyStageSlotAssignments, planStageSlotAssignments, type StageAssignPlan } from "@/lib/tournaments/stage-slot-assign";

/**
 * Preview → confirm for organiser-scheduled stages. Reads the saved stage session (date, window,
 * courts, slot length), shows every proposed court/time and every reason a game can't be placed.
 * Writes only on "Assign", never silently.
 */
export function AssignStageSlotsDialog({ open, champId, matchIds, nameOf, onClose, onDone }: {
  open: boolean; champId: string | null; matchIds?: string[]; nameOf?: (id: string) => string; onClose: () => void; onDone?: () => void;
}) {
  const [plan, setPlan] = useState<StageAssignPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const key = (matchIds ?? []).join(",");
  useEffect(() => {
    if (!open || !champId) return;
    setPlan(null); setErr(null);
    planStageSlotAssignments(champId, matchIds).then(setPlan).catch((e) => setErr(String(e?.message ?? e)));
  }, [open, champId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!plan) return;
    import("@/lib/supabase-ext").then(async ({ fromExt }) => {
      const ids = [...new Set([...plan.stages.flatMap((s) => [...s.slots.map((x) => x.matchId), ...s.unplaced]), ...plan.diagnostics.map((d) => d.matchId).filter(Boolean) as string[]])];
      if (!ids.length) return;
      const { data } = await fromExt("club_champs_matches").select("id, player_a_member_id, player_b_member_id").in("id", ids);
      const ms = (data ?? []) as any[];
      let nm = nameOf;
      if (!nm) {
        const pids = [...new Set(ms.flatMap((m) => [m.player_a_member_id, m.player_b_member_id]).filter(Boolean))];
        const { data: people } = pids.length ? await fromExt("club_members").select("id, name").in("id", pids) : { data: [] };
        const map = new Map(((people ?? []) as any[]).map((p) => [p.id, p.name as string]));
        nm = (id: string) => map.get(id) ?? "TBD";
      }
      setLabels(Object.fromEntries(ms.map((m) => [m.id, `${nm!(m.player_a_member_id)} v ${nm!(m.player_b_member_id)}`])));
    });
  }, [plan, nameOf]);
  const placed = plan?.stages.reduce((n, s) => n + s.slots.length, 0) ?? 0;
  const unplaced = plan?.stages.reduce((n, s) => n + s.unplaced.length, 0) ?? 0;
  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await applyStageSlotAssignments(plan, matchIds);
      toast.success(`Assigned ${r.scheduled} game${r.scheduled === 1 ? "" : "s"} to courts and times${r.skipped ? ` (${r.skipped} already changed — left as is)` : ""}.`);
      onDone?.(); onClose();
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto text-sm">
        <DialogHeader>
          <DialogTitle>Assign courts & times</DialogTitle>
          <DialogDescription>From the saved Stages & Scheduling session. Nothing is saved until you press Assign. No court bookings are made and no one is notified.</DialogDescription>
        </DialogHeader>
        {err && <p role="alert" className="text-destructive">{err}</p>}
        {!plan && !err && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking courts and existing bookings…</p>}
        {plan && <div className="space-y-3" data-testid="assign-stage-preview">
          {plan.stages.map((s) => (
            <div key={s.stageId} className="rounded-md border border-border p-2 space-y-1">
              <p className="font-medium">{s.name} · {s.date} · {s.from}–{s.to}</p>
              <p className="text-xs text-muted-foreground">Courts {s.courtIds.join(", ")} · {s.minutes} min per game · {s.capacity} free slot{s.capacity === 1 ? "" : "s"}</p>
              <ul className="text-xs space-y-0.5">
                {s.slots.map((sl) => <li key={sl.matchId}>{sl.time} · Court {sl.courtId} · {labels[sl.matchId] ?? "Game"}</li>)}
                {s.unplaced.map((id) => <li key={id} className="text-destructive">Not placed · {labels[id] ?? "Game"}</li>)}
              </ul>
            </div>
          ))}
          {plan.diagnostics.length > 0 && <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs space-y-0.5">
            <p className="font-medium">Needs attention</p>
            {plan.diagnostics.map((d, i) => <p key={i}>{d.stage ? `${d.stage}: ` : ""}{d.matchId && labels[d.matchId] ? `${labels[d.matchId]} — ` : ""}{d.reason}</p>)}
          </div>}
          {plan.total === 0 && !plan.diagnostics.length && <p className="text-muted-foreground">Every game here already has a court and time.</p>}
          {unplaced > 0 && <p className="text-destructive text-xs">{unplaced} game{unplaced === 1 ? "" : "s"} won't fit. Widen the time window or add courts in Stages & Scheduling, or assign them one by one. Assign saves only the games that fit.</p>}
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={apply} disabled={busy || !plan || placed === 0}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Assign {placed || ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
