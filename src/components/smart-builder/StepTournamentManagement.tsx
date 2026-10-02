import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronRight, Pencil, ArrowLeft, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import { LIFECYCLE, blockersFor, lifecycleIndex, loadHandover, nextAction, saveHandover, type Handover } from "@/lib/smart-builder/step-handover";

/**
 * Tournament Management (Beta) — where the tournament is, what's done, and ONE next action.
 * Only the Invite / Inform step is active in this Beta; later stages are shown, not built.
 * Setup stays reachable secondarily via "Edit tournament setup".
 */
export function StepTournamentManagement({ clubId, tournamentId, onEditSetup, onBack }: {
  clubId: string; tournamentId: string; onEditSetup: () => void; onBack: () => void;
}) {
  const [h, setH] = useState<Handover | null>(() => loadHandover(clubId, tournamentId));
  const [open, setOpen] = useState(false);
  const [regs, setRegs] = useState<{ total: number; outstanding: number; paid: number } | null>(null);
  useEffect(() => {
    fromExt("club_champs_registrations").select("status").eq("champ_id", tournamentId).then(({ data }: any) => {
      const rows = (data ?? []) as { status: string }[];
      setRegs({ total: rows.length, outstanding: rows.filter((r) => r.status === "pending_payment" || r.status === "pending_eft").length, paid: rows.filter((r) => r.status === "paid" || r.status === "waived").length });
    });
  }, [tournamentId]);
  if (!h) return <div className="text-sm">This tournament's Beta management record isn't on this device. <Button variant="link" onClick={onBack}>Back</Button></div>;
  const update = (p: Partial<Handover>) => { const n = { ...h, ...p }; saveHandover(n); setH(n); };
  const cur = lifecycleIndex(h.stage);
  const next = nextAction(h);
  const blockers = blockersFor(h, h.stage);
  const later = h.deferred.filter((d) => lifecycleIndex(d.neededAt) > cur);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Tournament Beta</Button>
          <h2 className="text-lg font-semibold">{h.name}</h2>
          <p className="text-xs text-muted-foreground">Tournament management (Beta) · {h.kind === "period" ? "Club Championships" : "Once-off / weekend"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onEditSetup}><Pencil className="mr-1 h-4 w-4" />Edit tournament setup</Button>
      </div>

      <ol aria-label="Tournament lifecycle" className="flex flex-wrap gap-1.5 text-xs">
        {LIFECYCLE.map((l, i) => (
          <li key={l.key} aria-current={i === cur ? "step" : undefined} className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1",
            h.completed.includes(l.key) ? "border-primary/50 text-primary" : i === cur ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-muted-foreground")}>
            {h.completed.includes(l.key) && <Check className="h-3 w-3" />}{l.label}
          </li>
        ))}
      </ol>

      <Card className="border-primary/50"><CardContent className="space-y-3 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Next action</div>
        <div className="text-base font-semibold">{next.title}</div>
        <p className="text-sm text-muted-foreground">{next.detail}</p>
        {blockers.length > 0 && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">
            <div className="font-medium">Decide these first (you chose "Decide later"):</div>
            <ul className="list-disc pl-4">{blockers.map((d) => <li key={d.id}>{d.label} — <span className="text-muted-foreground">{d.why}</span></li>)}</ul>
            <Button size="sm" variant="outline" className="mt-2" onClick={onEditSetup}>Decide now in setup</Button>
          </div>
        )}
        {h.stage === "invite" && (
          <>
            {!open
              ? <Button disabled={!next.available} onClick={() => setOpen(true)}>{next.title}<ChevronRight className="ml-1 h-4 w-4" /></Button>
              : <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Channels: {h.channels.join(", ") || "none chosen"} · wording from setup (shared Messaging step)</div>
                  {h.mode === "inform"
                    ? <ul className="space-y-2">{h.entrantMessages.map((m) => (
                        <li key={m.memberId} className="rounded border border-border p-2 text-xs">
                          <div className="mb-1 flex justify-between font-semibold"><span>{m.name}</span><span className={h.feeDue ? "text-destructive" : "text-primary"}>{m.status}</span></div>
                          <pre className="whitespace-pre-wrap font-sans">{m.text}</pre>
                        </li>))}</ul>
                    : <pre className="whitespace-pre-wrap rounded border border-border p-2 font-sans text-xs">{h.invitePreview}</pre>}
                  <p className="text-xs text-muted-foreground">Beta: sending isn't connected yet, so nothing is sent. Pay now links are added once payment collection is switched on.</p>
                  <Button onClick={() => update({ stage: "registrations", completed: [...new Set([...h.completed, "invite" as const])], informedAt: new Date().toISOString() })}>
                    Mark as {h.mode === "inform" ? "informed" : "invited"} & continue
                  </Button>
                </div>}
          </>
        )}
        {h.stage === "registrations" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />{h.informedAt ? `Players marked ${h.mode === "inform" ? "informed" : "invited"} ${new Date(h.informedAt).toLocaleString()}. ` : ""}This stage is not built yet.</div>}
      </CardContent></Card>

      <div className="grid gap-3 md:grid-cols-2 text-xs">
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-semibold">Entries</div>
          {regs ? <div>{regs.total} entered{h.feeDue ? ` · ${regs.outstanding} payment outstanding · ${regs.paid} paid` : ""}</div> : "Loading…"}
          <div className="text-muted-foreground">Entering a player never marks them as paid.</div>
        </div>
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-semibold">Decided later — coming up</div>
          {later.length ? <ul className="space-y-0.5">{later.map((d) => <li key={d.id}>{d.label} <span className="text-muted-foreground">· at {LIFECYCLE[lifecycleIndex(d.neededAt)].label}</span></li>)}</ul> : <div className="text-muted-foreground">Nothing outstanding.</div>}
        </div>
      </div>
    </div>
  );
}
