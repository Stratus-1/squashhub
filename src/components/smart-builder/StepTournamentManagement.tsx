import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronRight, Pencil, ArrowLeft, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import { LIFECYCLE, blockersFor, lifecycleIndex, loadHandover, loadLifecycle, nextAction, saveHandover, saveLifecycle, type BetaLifecycle, type Handover } from "@/lib/smart-builder/step-handover";
import { StepInformPanel } from "./StepInformPanel";

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
  const [regs, setRegs] = useState<{ total: number; outstanding: number; paid: number; pairs: number; singles: number } | null>(null);
  useEffect(() => {
    fromExt("club_champs_registrations").select("status, partner_member_id").eq("champ_id", tournamentId).then(({ data }: any) => {
      const rows = ((data ?? []) as { status: string; partner_member_id?: string | null }[]).filter((r) => r.status !== "cancelled");
      const paired = rows.filter((r) => r.partner_member_id).length;
      setRegs({ total: rows.length, outstanding: rows.filter((r) => r.status === "pending_payment" || r.status === "pending_eft").length, paid: rows.filter((r) => r.status === "paid" || r.status === "waived").length, pairs: Math.floor(paired / 2), singles: rows.length - paired });
    });
  }, [tournamentId]);
  const [life, setLife] = useState<BetaLifecycle | null>(null);
  useEffect(() => {
    loadLifecycle(tournamentId).then((l) => {
      const local = loadHandover(clubId, tournamentId);
      const v: BetaLifecycle = l ?? { stage: local?.stage ?? "invite", completed: local?.completed ?? ["planning"] };
      setLife(v);
      if (!l) saveLifecycle(tournamentId, v).catch(() => {});
      if (local) { const n = { ...local, stage: v.stage, completed: v.completed }; saveHandover(n); setH(n); }
    });
  }, [clubId, tournamentId]);
  const setLifecycle = async (l: BetaLifecycle) => {
    await saveLifecycle(tournamentId, l);
    setLife(l);
    setH((cur) => { if (!cur) return cur; const n = { ...cur, stage: l.stage, completed: l.completed, informedAt: l.inform?.at ?? cur.informedAt }; saveHandover(n); return n; });
  };
  if (!h) return <div className="text-sm">This tournament's Beta management record isn't on this device. <Button variant="link" onClick={onBack}>Back</Button></div>;
  const update = (p: Partial<Handover>) => {
    const n = { ...h, ...p }; saveHandover(n); setH(n);
    if (life && (p.stage || p.completed)) setLifecycle({ ...life, stage: n.stage, completed: n.completed }).catch(() => {});
  };
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
        {h.stage === "invite" && h.mode === "inform" && life && next.available && (
          <StepInformPanel h={h} lifecycle={life} onLifecycle={setLifecycle} />
        )}
        {h.stage === "invite" && h.mode !== "inform" && (
          <>
            {!open
              ? <Button disabled={!next.available} onClick={() => setOpen(true)}>{next.title}<ChevronRight className="ml-1 h-4 w-4" /></Button>
              : <div className="space-y-2">
                  <pre className="whitespace-pre-wrap rounded border border-border p-2 font-sans text-xs">{h.invitePreview}</pre>
                  <p className="text-xs text-muted-foreground">Beta: sending invitations from here isn't connected yet — nothing is sent by this page.</p>
                  <Button variant="outline" onClick={() => { if (confirm("Confirm you invited players yourself, outside this page?")) update({ stage: "registrations", completed: [...new Set([...h.completed, "invite" as const])], informedAt: new Date().toISOString() }); }}>
                    Mark as invited manually
                  </Button>
                </div>}
          </>
        )}
        {h.stage === "registrations" && (
          <div className="space-y-2">
            {life?.inform && <p className="text-xs text-muted-foreground">Players {life.inform.method === "sent" ? "notified through SquashHub" : "marked informed manually"} {new Date(life.inform.at).toLocaleString()}{life.inform.note ? ` · ${life.inform.note}` : ""}.</p>}
            <p className="text-xs text-muted-foreground">Payments are recorded through the tournament's normal payment screens. Detailed registration tracking here is the next Beta build.</p>
            <Button onClick={() => update({ stage: "finalise", completed: [...new Set([...h.completed, "registrations" as const])] })}>Close registrations & finalise entries<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        )}
        {h.stage === "finalise" && (
          <div className="space-y-2 text-xs">
            <div className="font-medium">Actual entries vs your estimate</div>
            <ul className="space-y-0.5">
              {(h.expected ?? []).map((e) => <li key={e.label}>{e.label}: <span className="text-muted-foreground">expected {e.expected ?? "not estimated"}{e.doubles ? " pairs" : ""}</span></li>)}
              <li className="font-medium">Entered now: {regs ? `${regs.pairs} pair${regs.pairs === 1 ? "" : "s"}${regs.singles ? ` + ${regs.singles} individual entr${regs.singles === 1 ? "y" : "ies"}` : ""}${h.feeDue ? ` · ${regs.outstanding} payment outstanding` : ""}` : "loading…"}</li>
            </ul>
            <Button disabled><Lock className="mr-1 h-4 w-4" />Generate draw & fixtures</Button>
            <p className="text-muted-foreground">{blockers.length ? "Locked until the decisions above are made." : "Locked: draw and fixture generation isn't built in the Beta yet."}</p>
          </div>
        )}
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
