import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, ChevronRight, Pencil, ArrowLeft, Lock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  LIFECYCLE, blockersFor, finalisePrereqs, isOutstanding, lifecycleIndex, loadHandover, loadLifecycle, loadRegistrations,
  nextAction, loadConfirmNeedsPay, paymentWarning, regLabel, saveHandover, saveLifecycle, type BetaLifecycle, type Handover, type LifecycleKey, type RegRow,
} from "@/lib/smart-builder/step-handover";
import { StepInformPanel } from "./StepInformPanel";
import { StepGenerateDrawPanel } from "./StepGenerateDrawPanel";
import { StepRunOverview } from "./StepRunOverview";
import { fromExt } from "@/lib/supabase-ext";
import { isDiamondTournament } from "@/lib/tournaments/diamond-guard";
import { Link } from "react-router-dom";
import { TournamentRegistrationsDialog } from "@/components/club-admin/TournamentRegistrationsDialog";

const money = (c: number) => `R${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

/**
 * Tournament Management (Beta) — where the tournament is, what's done, and ONE next action.
 * Completed stages stay clickable (revisiting never undoes later progress); future stages are locked.
 * Payment status comes from club_champs_registrations.status (the tournament's normal payment flow).
 */
export function StepTournamentManagement({ clubId, tournamentId, onEditSetup, onBack }: {
  clubId: string; tournamentId: string; onEditSetup: (at?: "Summary" | "Messaging") => void; onBack: () => void;
}) {
  const [h, setH] = useState<Handover | null>(() => loadHandover(clubId, tournamentId));
  const [diamond, setDiamond] = useState<boolean | null>(null);
  useEffect(() => { let active = true; isDiamondTournament(tournamentId).then((yes) => { if (active) setDiamond(yes); }).catch(() => { if (active) setDiamond(true); }); return () => { active = false; }; }, [tournamentId]);
  const [open, setOpen] = useState(false);
  const [regs, setRegs] = useState<{ rows: RegRow[]; feeCents: number } | null>(null);
  const [showRegs, setShowRegs] = useState(false);
  const [view, setView] = useState<LifecycleKey | null>(null);
  const [payDlg, setPayDlg] = useState<any>(null);
  const openPayments = async () => { const { data } = await fromExt("club_champs").select("*").eq("id", tournamentId).maybeSingle(); if (data) setPayDlg(data); };
  const [_unpaidOk, _setUnpaidOk] = useState(false);
  const [editWarn, setEditWarn] = useState<null | "Summary" | "Messaging" | "default">(null);
  const reloadRegs = () => loadRegistrations(tournamentId).then(setRegs).catch(() => setRegs({ rows: [], feeCents: 0 }));
  useEffect(() => {
    reloadRegs();
    const onFocus = () => { if (document.visibilityState === "visible") reloadRegs(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
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
  const [needPay, setNeedPay] = useState(false);
  useEffect(() => { if (h?.feeDue) loadConfirmNeedsPay(tournamentId).then(setNeedPay).catch(() => {}); }, [tournamentId, h?.feeDue]);
  if (diamond !== false) return diamond ? <div className="text-sm">Diamond League keeps its existing tournament view. <Link className="underline" to={`/club-champs/${tournamentId}`}>Open tournament</Link></div> : null;
  if (!h) return <div className="text-sm">This tournament's Beta management record isn't on this device. <Button variant="link" onClick={onBack}>Back</Button></div>;
  const advance = (from: LifecycleKey, to: LifecycleKey) => {
    const n = { ...h, stage: to, completed: [...new Set([...h.completed, from])] as LifecycleKey[] };
    saveHandover(n); setH(n); setView(null);
    if (life) setLifecycle({ ...life, stage: n.stage, completed: n.completed }).catch(() => {});
  };
  const cur = lifecycleIndex(h.stage);
  const shown: LifecycleKey = view ?? h.stage;
  const revisiting = shown !== h.stage;
  const next = nextAction(h);
  const blockers = blockersFor(h, shown);
  const later = h.deferred.filter((d) => lifecycleIndex(d.neededAt) > cur);
  const rows = regs?.rows ?? [];
  const owing = rows.filter((r) => isOutstanding(r.status, h.feeDue));
  const paid = rows.filter((r) => r.status === "paid" || r.status === "waived").length;
  const onAccount = rows.filter((r) => r.status === "on_account").length;
  const prereqs = finalisePrereqs(rows, h.feeDue, needPay);
  const payWarn = paymentWarning(rows, h.feeDue);
  const pairs = rows.filter((r) => r.partnerName).length;
  // Anything past Invite means real registrations / payments may depend on setup.
  const downstream = cur >= lifecycleIndex("registrations");
  const askEdit = (at?: "Summary" | "Messaging") => downstream ? setEditWarn(at ?? "default") : onEditSetup(at);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Tournament Beta</Button>
          <h2 className="text-lg font-semibold">{h.name}</h2>
          <p className="text-xs text-muted-foreground">Tournament management (Beta) · {h.kind === "period" ? "Club Championships" : "Once-off / weekend"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => askEdit()}><Pencil className="mr-1 h-4 w-4" />Edit tournament setup</Button>
      </div>

      <ol aria-label="Tournament lifecycle" className="flex flex-wrap gap-1.5 text-xs">
        {LIFECYCLE.map((l, i) => {
          const done = h.completed.includes(l.key);
          const reachable = (done || i === cur) && l.key !== "planning";
          return (
            <li key={l.key} aria-current={i === cur ? "step" : undefined}>
              <button type="button" disabled={!reachable} onClick={() => setView(i === cur ? null : l.key)}
                title={reachable ? (i === cur ? "Current stage" : "Revisit — nothing later is undone") : l.key === "planning" ? "Use Edit tournament setup" : "Locked until earlier stages are done"}
                className={cn("flex items-center gap-1 rounded-full border px-2.5 py-1",
                  i === cur ? "border-primary bg-primary font-semibold text-primary-foreground" : done ? "border-primary/50 text-primary hover:bg-primary/10" : "border-border text-muted-foreground",
                  shown === l.key && i !== cur && "ring-2 ring-primary/60")}>
                {done && <Check className="h-3 w-3" />}{!done && i > cur && <Lock className="h-3 w-3" />}{l.label}{done && i !== cur && l.key !== "planning" && <span className="ml-1 text-[10px] opacity-80">· Completed ✓ · View / manage</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <Card className="border-primary/50"><CardContent className="space-y-3 p-4">
        {revisiting ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-muted/40 p-2 text-xs">
            <span>Revisiting <b>{LIFECYCLE[lifecycleIndex(shown)].label}</b> (completed). The tournament stays at <b>{LIFECYCLE[cur].label}</b> — nothing later is undone.</span>
            <Button size="sm" variant="outline" onClick={() => setView(null)}><RotateCcw className="mr-1 h-3 w-3" />Back to current stage</Button>
          </div>
        ) : <>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Next action</div>
          <div className="text-base font-semibold">{next.title}</div>
          <p className="text-sm text-muted-foreground">{next.detail}</p>
        </>}
        {blockers.length > 0 && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs">
            <div className="font-medium">Decide these first (you chose "Decide later"):</div>
            <ul className="list-disc pl-4">{blockers.map((d) => <li key={d.id}>{d.label} — <span className="text-muted-foreground">{d.why}</span></li>)}</ul>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => askEdit()}>Decide now in setup</Button>
          </div>
        )}
        {shown === "invite" && h.mode === "inform" && life && blockersFor(h, "invite").length === 0 && (
          <StepInformPanel h={h} lifecycle={life} onLifecycle={setLifecycle} onAddGroup={() => askEdit("Messaging")} />
        )}
        {shown === "invite" && h.mode !== "inform" && (
          <>
            {!open
              ? <Button disabled={blockersFor(h, "invite").length > 0} onClick={() => setOpen(true)}>Invite players<ChevronRight className="ml-1 h-4 w-4" /></Button>
              : <div className="space-y-2">
                  <pre className="whitespace-pre-wrap rounded border border-border p-2 font-sans text-xs">{h.invitePreview}</pre>
                  <Button disabled title="Not connected yet">Send invitations</Button>
                  <p className="text-xs text-muted-foreground">Sending invitations from here isn't connected yet — nothing is sent by this page.</p>
                  {!h.completed.includes("invite") && <Button variant="outline" onClick={() => { if (confirm("Record that you invited players yourself, outside SquashHub? SquashHub sends NOTHING for this.")) advance("invite", "registrations"); }}>
                    Record: I invited them outside SquashHub (sends nothing)
                  </Button>}
                </div>}
          </>
        )}
        {shown === "registrations" && (
          <div className="space-y-2 text-xs">
            {life?.inform && <p className="text-muted-foreground">Players {life.inform.method === "sent" ? "notified through SquashHub" : "recorded as told outside SquashHub"} {new Date(life.inform.at).toLocaleString()}{life.inform.note ? ` · ${life.inform.note}` : ""}.</p>}
            {!revisiting && (prereqs.length
              ? <div className="rounded border border-destructive/50 bg-destructive/10 p-2 font-medium">Can't finalise yet: {prereqs.join(" · ")}</div>
              : payWarn
                ? <div className="rounded border border-destructive/50 bg-destructive/10 p-2">
                    <div className="font-medium">{payWarn}</div>
                    <div className="text-muted-foreground">This tournament confirms entries without payment (\"Must the fee be paid before the entry is confirmed?\" = No), so this doesn't block you. The fees stay genuinely outstanding. Players pay with the Pay button on their notification or on their tournament page; payments show here after Refresh.</div>
                  </div>
                : <div className="rounded border border-primary/50 bg-primary/10 p-2 font-medium">Every entry is {h.feeDue ? "paid or waived" : "in"} — you can finalise entries.</div>)}
            <div className="flex flex-wrap gap-2">
              {!revisiting && <Button disabled={prereqs.length > 0} title={prereqs.join(" · ")} onClick={() => { if (!payWarn || confirm(`${payWarn}. Finalise entries anyway? Unpaid players stay unpaid and can still pay later.`)) advance("registrations", "finalise"); }}>
                {prereqs.length ? <Lock className="mr-1 h-4 w-4" /> : null}Close registrations & finalise entries<ChevronRight className="ml-1 h-4 w-4" />
              </Button>}
              <Button variant="outline" size="sm" onClick={reloadRegs}>Refresh payments</Button>
              {h.feeDue && <Button variant="outline" size="sm" onClick={openPayments}>Record a payment / waive (admin)</Button>}
            </div>
          </div>
        )}
        {shown === "finalise" && (
          <div className="space-y-2 text-xs">
            <div className="font-medium">Actual entries vs your estimate</div>
            <ul className="space-y-0.5">
              {(h.expected ?? []).map((e) => <li key={e.label}>{e.label}: <span className="text-muted-foreground">expected {e.expected ?? "not estimated"}{e.doubles ? " pairs" : ""}</span></li>)}
              <li className="font-medium">Entered now: {regs ? `${Math.floor(pairs / 2) || pairs} pair${pairs === 1 ? "" : "s"} · ${rows.length} players${h.feeDue ? ` · ${owing.length} payment outstanding` : ""}` : "loading…"}</li>
            </ul>
            {(() => {
              const why = [...prereqs, ...blockers.map((d) => `"${d.label}" is still "Decide later"`)];
              return <>
                {payWarn && <p className="text-destructive">{payWarn} — this doesn't block the draw because entries are confirmed without payment.</p>}
                {why.length
                  ? <><Button disabled><Lock className="mr-1 h-4 w-4" />Generate draw & fixtures</Button><p className="text-destructive">Blocked because: {why.join(" · ")}. Decide {why.length === 1 ? "it" : "them"} in setup to unlock.</p></>
                  : <><Button onClick={() => { if (!payWarn || confirm(`${payWarn}. Continue anyway?`)) advance("finalise", "generate"); }}>Continue to Generate draw & fixtures<ChevronRight className="ml-1 h-4 w-4" /></Button>
                      <p className="text-muted-foreground">Prerequisites are met. Next you confirm the final format, preview the draw and generate it.</p></>}
              </>;
            })()}
          </div>
        )}
        {shown === "generate" && (
          <StepGenerateDrawPanel clubId={clubId} tournamentId={tournamentId} revisiting={revisiting}
            onGenerated={() => { if (h.stage === "generate") advance("generate", "activate"); }} />
        )}
        {!revisiting && (
          <StepRunOverview clubId={clubId} tournamentId={tournamentId} plan={life?.format_plan as any}
            onLifecycle={(to) => {
              if (!life || lifecycleIndex(to) <= cur) return;
              const done = LIFECYCLE.slice(0, lifecycleIndex(to)).map((l) => l.key) as LifecycleKey[];
              setLifecycle({ ...life, stage: to, completed: [...new Set([...life.completed, ...done])] as LifecycleKey[] }).catch(() => {});
            }} />
        )}
      </CardContent></Card>

      <div className="grid gap-3 md:grid-cols-2 text-xs">
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-semibold">Entries &amp; payment status</div>
          {regs ? <div>{rows.length} entered{h.feeDue ? ` · ${paid + onAccount} fee${paid + onAccount === 1 ? "" : "s"} settled (${paid} paid · ${onAccount} charged to member account) · ${owing.length} outstanding${owing.length ? ` (${money(owing.reduce((s, r) => s + r.owesCents, 0))} due)` : ""}` : ""}</div> : "Loading…"}
          <div className="text-muted-foreground">Entering a player never marks them as paid.</div>
          {rows.length > 0 && <button type="button" className="mt-1 text-primary underline" onClick={() => setShowRegs((v) => !v)}>{showRegs ? "Hide players" : "Show players"}</button>}
          {showRegs && <ul className="mt-1 divide-y divide-border rounded border border-border">{rows.map((r) => (
            <li key={r.memberId} className="flex flex-wrap justify-between gap-2 px-2 py-1">
              <span>{r.name}{r.partnerName ? <span className="text-muted-foreground"> + {r.partnerName}</span> : null}</span>
              <span className={isOutstanding(r.status, h.feeDue) ? "text-destructive" : "text-primary"}>{regLabel(r.status, h.feeDue, needPay)}{r.owesCents ? ` · ${money(r.owesCents)}` : ""}</span>
            </li>
          ))}</ul>}
        </div>
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-semibold">Decided later — coming up</div>
          {later.length ? <ul className="space-y-0.5">{later.map((d) => <li key={d.id}>{d.label} <span className="text-muted-foreground">· at {LIFECYCLE[lifecycleIndex(d.neededAt)].label}</span></li>)}</ul> : <div className="text-muted-foreground">Nothing outstanding.</div>}
        </div>
      </div>

      {payDlg && <TournamentRegistrationsDialog open onOpenChange={(v) => { if (!v) { setPayDlg(null); reloadRegs(); } }} champ={payDlg} clubId={clubId} />}
      <AlertDialog open={!!editWarn} onOpenChange={(o) => !o && setEditWarn(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Players are already entered</AlertDialogTitle>
            <AlertDialogDescription>
              This tournament is at "{LIFECYCLE[cur].label}". Changing players, pairs, categories or the entry fee can affect existing registrations and payments.
              Saving updates the same tournament (no duplicate) and never deletes registrations or payments already made — but players already informed won't be told about changes automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const at = editWarn; setEditWarn(null); onEditSetup(at === "default" ? undefined : at ?? undefined); }}>Edit anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
