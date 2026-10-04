import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { scheduleWithAssumptions } from "@/lib/tournaments/assumed-schedule";

type Champ = { id: string; name?: string | null };
type State =
  | { kind: "missing"; champ: Champ; items: string[] }
  | { kind: "confirm"; champ: Champ; total: number; relaxed: number }
  | { kind: "conflict"; champ: Champ; items: string[] }
  | null;

/** Opens Club Admin → Tournaments straight on this tournament's Courts & Dates step. */
export const courtsSetupHref = (champId: string) => `/club-admin?tab=champs&setup=${encodeURIComponent(champId)}&step=Courts`;

/**
 * Draft timetable from Courts & Dates (dates, courts, windows, restrictions, scheduling assumptions).
 * Never silent: missing settings and conflicts open a dialog with a route back to Courts & Dates.
 */
export function AssignCourtsTimesButton({ champs: all, className }: { champs: Champ[]; className?: string }) {
  // Only Step-by-Step weekend tournaments (their setup carries Courts & Dates days).
  const ids = all.map((c) => c.id).sort().join(",");
  const { data: eligible } = useQuery({
    queryKey: ["assign-courts-eligible", ids],
    enabled: !!ids,
    queryFn: async () => {
      const { data } = await fromExt("tournaments").select("id, beta_lifecycle").in("id", ids.split(","));
      return new Set(((data ?? []) as any[]).filter((t) => Array.isArray(t.beta_lifecycle?.format_plan?.days) && t.beta_lifecycle.format_plan.days.length && t.beta_lifecycle?.format_plan?.format?.kind !== undefined).map((t) => t.id as string));
    },
  });
  const champs = all.filter((c) => eligible?.has(c.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [state, setState] = useState<State>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (!champs.length) return null;

  const check = async (champ: Champ) => {
    setBusy(champ.id);
    try {
      const r = await scheduleWithAssumptions(champ.id, { dryRun: true });
      if (r.missing.length) setState({ kind: "missing", champ, items: r.missing });
      else if (r.total === 0) toast.info("There are no unplayed games to schedule.");
      else if (r.issues.length) setState({ kind: "conflict", champ, items: r.issues });
      else setState({ kind: "confirm", champ, total: r.total, relaxed: r.relaxed.length });
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setBusy(null); }
  };
  const apply = async (champ: Champ) => {
    setBusy(champ.id);
    try {
      const r = await scheduleWithAssumptions(champ.id);
      if (r.issues.length) { setState({ kind: "conflict", champ, items: r.issues }); return; }
      setState(null);
      toast.success(`Assigned ${r.scheduled} game${r.scheduled === 1 ? "" : "s"} to courts and times`);
      if (r.relaxed.length) toast.warning(`${r.relaxed.length} game${r.relaxed.length === 1 ? "" : "s"} needed less than the minimum rest to fit.`);
      qc.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
      qc.invalidateQueries({ queryKey: ["timed-round-capacity"] });
    } catch (e: any) { toast.error(e?.message ?? String(e)); } finally { setBusy(null); }
  };
  const goSetup = (id: string) => { setState(null); navigate(courtsSetupHref(id)); };

  return (
    <>
      {champs.map((c) => (
        <Button key={c.id} variant="outline" size="sm" className={className ?? "gap-1 h-7"} disabled={!!busy} onClick={() => check(c)}
          title="Draft a timetable from the Courts & Dates settings">
          {busy === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
          Assign courts &amp; times{champs.length > 1 ? ` · ${c.name ?? "Tournament"}` : ""}
        </Button>
      ))}
      <Dialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
        <DialogContent>
          {state?.kind === "missing" && <>
            <DialogHeader>
              <DialogTitle>Courts & Dates needs a few settings first</DialogTitle>
              <DialogDescription>Automatic scheduling uses the tournament's Courts & Dates setup. Still missing:</DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 text-sm space-y-1">{state.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setState(null)}>Close</Button>
              <Button onClick={() => goSetup(state.champ.id)}>Open Courts &amp; Dates</Button>
            </DialogFooter>
          </>}
          {state?.kind === "conflict" && <>
            <DialogHeader>
              <DialogTitle>The schedule doesn't fit</DialogTitle>
              <DialogDescription>No times or courts were changed.</DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 text-sm space-y-1">{state.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setState(null)}>Close</Button>
              <Button onClick={() => goSetup(state.champ.id)}>Open Courts &amp; Dates</Button>
            </DialogFooter>
          </>}
          {state?.kind === "confirm" && <>
            <DialogHeader>
              <DialogTitle>Assign courts & times?</DialogTitle>
              <DialogDescription>
                {state.total} unplayed game{state.total === 1 ? "" : "s"} will get a court and start time. Any times already set on these games are replaced. Played or court-booked games are not moved, and you can still change any single game afterwards.
              </DialogDescription>
            </DialogHeader>
            {state.relaxed > 0 && <p className="text-sm text-muted-foreground">{state.relaxed} game{state.relaxed === 1 ? "" : "s"} will have less than the minimum rest — there is no other free slot.</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setState(null)}>Cancel</Button>
              <Button disabled={!!busy} onClick={() => apply(state.champ)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}</Button>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </>
  );
}
