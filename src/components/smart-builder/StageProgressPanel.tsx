import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { atomically, loadEntrants, sourcePositions } from "@/lib/tournaments/structured-persist";
import { notifyRoundDraw, roundNotifySummary } from "@/lib/tournaments/round-notify";
import { divisionGroup } from "@/lib/tournaments/engine-service";
import { autoProgress, confirmNextStage, previewNextStage, checkDeferredSetup, decidePositionOrder, setupDeferredStage, setupOk, stageLifecycle, type DeferredSetup, type Exec, type SetupCheck, type StageStatus } from "@/lib/tournaments/progression";
import { parseMapping } from "@/lib/tournaments/mapping";
import { sourcePoolCount } from "@/lib/tournaments/contract";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";
import { attachPlannedPlayoffs } from "@/lib/smart-builder/step-draw";
import { fromExt } from "@/lib/supabase-ext";
import { schedulePlannedPlayoffGames, type ScheduleReport } from "@/lib/smart-builder/playoff-schedule";

const scheduleToast = (r: ScheduleReport) => {
  if (r.booked) toast.success(`${r.booked} game${r.booked === 1 ? "" : "s"} booked into the planned session.`);
  if (r.unplaced.length) toast.warning(`${r.unplaced.length} game(s) couldn't be placed: ${[...new Set(r.unplaced.map((u) => `${u.stage} — ${u.reason}`))].join("; ")}`);
};

const STATE_LABEL: Record<StageStatus["state"], string> = {
  completed: "Completed", active: "In play", waiting: "Waiting", ready: "Starting…", blocked: "Needs your decision",
  deferred: "Define later", needs_setup: "Set up next stage",
};

/** Draw notice for a newly created stage (opponents, partner, phones, play-by), unless the organiser turned draw notifications off. */
async function notifyStage(champId: string, spec: TournamentSpec, divisionKey: string, stageKey: string) {
  try {
    const { data } = await fromExt("tournaments").select("beta_lifecycle").eq("id", champId).maybeSingle();
    if ((data as any)?.beta_lifecycle?.draw_notify === false) return;
    const d = spec.divisions.find((x) => x.divisionId === divisionKey);
    const r = await notifyRoundDraw({ champId, roundNumber: 1, groupNumber: d ? divisionGroup(spec, d) : null, stageKey });
    toast.success(roundNotifySummary(r));
  } catch (e: any) { toast.error(`Stage created, but players weren't notified: ${e.message}`); }
}

/** Live stage lifecycle + automatic progression + "Set up next stage" for Define-later stages. */
export function StageProgressPanel({ champId, spec, matches, nameOf }: { champId: string; spec: TournamentSpec; matches: any[]; nameOf: (id: string | null) => string }) {
  const qc = useQueryClient();
  const exec: Exec = (fn) => atomically(supabaseDb, champId, commitStructured, fn);
  const sig = matches.map((m) => `${m.id}:${m.winner_member_id ?? ""}:${m.status ?? ""}`).join("|");
  const { data: states = [], refetch } = useQuery({ queryKey: ["stage-lifecycle", champId, sig], queryFn: () => stageLifecycle(supabaseDb, champId) });
  const refresh = () => { qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(champId) }); refetch(); };
  const running = useRef(false);
  // Draws generated before play-offs were bridged: attach the builder's planned play-offs (append-only,
  // no games written) so a finished stage is never a dead end. Idempotent — only fills divisions with none.
  const repaired = useRef(false);
  useEffect(() => {
    if (repaired.current) return;
    repaired.current = true;
    (async () => {
      const { data } = await fromExt("tournaments").select("beta_lifecycle").eq("id", champId).maybeSingle();
      const plan = (data as any)?.beta_lifecycle?.format_plan ?? null;
      if (!plan || !attachPlannedPlayoffs(spec, plan)) return;
      await exec(async (tx) => {
        const [t] = await tx.select("tournaments", { id: champId });
        const next = attachPlannedPlayoffs(t.builder_spec as TournamentSpec, plan);
        if (next) await tx.update("tournaments", { id: champId }, { builder_spec: next });
      });
      refresh();
    })().catch((e) => toast.error(`Couldn't attach the planned play-offs: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champId]);
  useEffect(() => {
    if (running.current || !states.some((s) => s.state === "ready" && s.automatic)) return;
    running.current = true;
    autoProgress(supabaseDb, champId, exec)
      .then(async (r) => {
        if (!r.started.length) return;
        toast.success(`Started automatically: ${r.started.map((s) => s.name).join(", ")}`);
        scheduleToast(await schedulePlannedPlayoffGames(champId));
        for (const st of r.started) await notifyStage(champId, spec, st.divisionKey, st.stageKey);
        refresh();
      })
      .catch((e) => toast.error(e.message))
      .finally(() => { running.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states]);

  const [setup, setSetup] = useState<StageStatus | null>(null);
  const [confirm, setConfirm] = useState<StageStatus | null>(null);
  const [tie, setTie] = useState<{ div: string; stage: string } | null>(null);
  const current = (div: string) => states.filter((s) => s.divisionKey === div);
  const tieSource = (divKey: string, stageKey: string) => {
    const d = spec.divisions.find((x) => x.divisionId === divKey);
    const st = d?.stages.find((x) => x.id === stageKey);
    return st?.kind === "mapped" && st.mapping?.source === "stage_standings" ? st.mapping.sourceStageId : d?.stages.find((x) => x.order === (st?.order ?? 0) - 1)?.id;
  };

  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm" data-testid="stage-progress">
      <div className="font-semibold">Stage progress</div>
      {states.filter((s) => s.state === "blocked" && /tied/i.test(s.detail)).map((s) => {
        const src = tieSource(s.divisionKey, s.stageKey);
        return (
          <div key={`tie-${s.divisionKey}-${s.stageKey}`} role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-2">
            <span className="font-medium">Action required · {s.divisionLabel}: {s.detail} (decides who plays {s.name})</span>
            {src && <Button size="sm" variant="destructive" onClick={() => setTie({ div: s.divisionKey, stage: src })}>Resolve tie</Button>}
          </div>
        );
      })}
      {states.filter((s) => s.state === "ready" && !s.automatic).map((s) => (
        <div key={`go-${s.divisionKey}-${s.stageKey}`} className="flex flex-wrap items-center gap-2 rounded-md border border-primary bg-primary/10 p-2">
          <span className="font-medium">{s.divisionLabel}: {s.detail}</span>
          <Button size="sm" onClick={() => setConfirm(s)}>Generate {s.name}</Button>
        </div>
      ))}
      {states.filter((s) => s.state === "needs_setup").map((s) => (
        <div key={`due-${s.divisionKey}-${s.stageKey}`} className="flex flex-wrap items-center gap-2 rounded-md border border-primary bg-primary/10 p-2">
          <span className="font-medium">{s.divisionLabel}: {s.detail}</span>
          <Button size="sm" onClick={() => setSetup(s)}><Settings2 className="w-4 h-4 mr-1" />Generate {s.name}</Button>
        </div>
      ))}
      {spec.divisions.map((d) => {
        const list = current(d.divisionId);
        const now = list.find((s) => s.state === "active") ?? list.find((s) => s.state !== "completed");
        return (
          <div key={d.divisionId} className="space-y-1">
            {spec.divisions.length > 1 && <div className="font-medium">{d.label}</div>}
            {now && <div className="text-muted-foreground">Current: {now.name} · {STATE_LABEL[now.state]}</div>}
            {list.map((s) => (
              <div key={s.stageKey} className="flex flex-wrap items-center gap-2">
                <Badge variant={s.state === "blocked" || s.state === "needs_setup" ? "destructive" : s.state === "completed" ? "secondary" : "outline"}>{s.state === "ready" && !s.automatic ? "Ready — confirm" : STATE_LABEL[s.state]}</Badge>
                <span>{s.name}</span>
                {s.total > 0 && <span className="text-muted-foreground">{s.played}/{s.total}</span>}
                <span className="text-muted-foreground">{s.detail}{s.plannedDate ? ` · planned ${s.plannedDate}` : ""}</span>
                {s.state === "needs_setup" && <Button size="sm" onClick={() => setSetup(s)}><Settings2 className="w-4 h-4 mr-1" />Generate {s.name}</Button>}
                {s.state === "blocked" && /tied/i.test(s.detail) && (() => {
                  const st = d.stages.find((x) => x.id === s.stageKey);
                  const srcId = st?.kind === "mapped" && st.mapping?.source === "stage_standings" ? st.mapping.sourceStageId : d.stages.find((x) => x.order === (st?.order ?? 0) - 1)?.id;
                  return srcId ? <Button size="sm" variant="outline" onClick={() => setTie({ div: d.divisionId, stage: srcId })}>Decide tied order</Button> : null;
                })()}
              </div>
            ))}
          </div>
        );
      })}
      {confirm && <ConfirmStageDialog champId={champId} spec={spec} status={confirm} nameOf={nameOf} exec={exec} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); refresh(); }} />}
      {setup && <SetupDialog champId={champId} spec={spec} status={setup} exec={exec} onClose={() => setSetup(null)} onDone={() => { setSetup(null); refresh(); }} />}
      {tie && <TieDialog champId={champId} spec={spec} matches={matches} nameOf={nameOf} div={tie.div} stage={tie.stage} exec={exec} onClose={() => setTie(null)} onDone={() => { setTie(null); refresh(); }} />}
    </div>
  );
}

function SetupDialog({ champId, spec, status, exec, onClose, onDone }: { champId: string; spec: TournamentSpec; status: StageStatus; exec: Exec; onClose: () => void; onDone: () => void }) {
  const d = spec.divisions.find((x) => x.divisionId === status.divisionKey)!;
  const src = [...d.stages].sort((a, b) => b.order - a.order)[0];
  const pools = sourcePoolCount(src);
  const poolSize = src.kind === "mapped" ? src.mapping?.poolSize ?? 0 : src.poolSize ?? 0;
  const [kind, setKind] = useState<"mapped" | "knockout">("mapped");
  const [discipline, setDiscipline] = useState<"singles" | "doubles">("singles");
  const plan = (d.deferredStages ?? []).find((x) => x.stageKey === status.stageKey)?.plan ?? null;
  // Pre-fill from the builder's plan: same_position = A1 v B1, crossover (default for two pools) = A1 v B2.
  const [text, setText] = useState(pools >= 2 ? (plan?.pairing === "same_position" ? "R1: A1 v B1\nR1: A2 v B2" : "R1: A1 v B2\nR1: B1 v A2") : "R1: A1 v A4\nR1: A2 v A3");
  const [perPool, setPerPool] = useState(2);
  const [method, setMethod] = useState<"cross_pool" | "reseed">(pools >= 2 ? "cross_pool" : "reseed");
  const [thirdPlace, setThirdPlace] = useState(false);
  const [format, setFormat] = useState("");
  const [date, setDate] = useState(status.plannedDate ?? "");
  const [check, setCheck] = useState<SetupCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = parseMapping(text, { source: "stage_standings", sourceStageId: src.id, pools, poolSize, discipline });
  const build = (): DeferredSetup => ({
    kind, matchFormat: format, discipline,
    ...(kind === "mapped" ? { mapping: parsed.mapping ?? undefined } : { qualify: { perPool, mapping: method, transition: null }, thirdPlace }),
    schedule: { rule: date ? "fixed" : "window", ...(date ? { date, roundDates: [date] } : {}) },
  });
  const run = async (create: boolean) => {
    setBusy(true);
    try {
      if (kind === "mapped" && parsed.errors.length) { setCheck({ structure: parsed.errors, engine: [], schedule: [], scoring: [] }); return; }
      const c = await checkDeferredSetup(supabaseDb, champId, status.divisionKey, status.stageKey, build());
      setCheck(c);
      if (create && setupOk(c)) {
        await setupDeferredStage(supabaseDb, champId, status.divisionKey, status.stageKey, build(), exec);
        toast.success(`${status.name} created`);
        await notifyStage(champId, spec, status.divisionKey, status.stageKey);
        onDone();
      }
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const row = (label: string, list: string[]) => (
    <div><span className="font-medium">{label}: </span>{list.length ? <span className="text-destructive">{list.join("; ")}</span> : <span className="text-muted-foreground">OK</span>}</div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg text-sm">
        <DialogHeader><DialogTitle>Set up {status.name}</DialogTitle></DialogHeader>
        <p className="text-muted-foreground">Players come from the final positions of {src.name} ({pools} pool{pools > 1 ? "s" : ""}{poolSize ? ` of ${poolSize}` : ""}). Earlier stages and results are not changed.</p>
        <label className="block">Format
          <select className="mt-1 w-full h-8 rounded-md border bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="mapped">Explicit matchups (e.g. A1 v B2)</option>
            <option value="knockout">Knockout from pool qualifiers</option>
          </select>
        </label>
        {kind === "mapped" ? (
          <>
            <label className="block">Singles or doubles
              <select className="mt-1 w-full h-8 rounded-md border bg-background px-2" value={discipline} onChange={(e) => setDiscipline(e.target.value as any)}>
                <option value="singles">Singles</option><option value="doubles">Doubles (pairs written as A1+B1)</option>
              </select>
            </label>
            <label className="block">Who plays whom (one game per line)
              <Textarea className="mt-1 font-mono" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label>Qualify per pool<Input type="number" min={1} value={perPool} onChange={(e) => setPerPool(Number(e.target.value))} /></label>
            <label>Draw
              <select className="mt-1 w-full h-8 rounded-md border bg-background px-2" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                {pools >= 2 && <option value="cross_pool">Cross-pool (winner v runner-up)</option>}
                <option value="reseed">Straight seeding</option>
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} />Also play 3rd/4th place</label>
          </div>
        )}
        <label className="block">How each game is scored<Input placeholder="e.g. PAR 11, best of 5" value={format} onChange={(e) => setFormat(e.target.value)} /></label>
        {plan && <p className="rounded border bg-muted/40 p-2 text-xs">From your setup: {plan.pairing === "crossover" ? "crossover pairing (winner of one group v runner-up of the other)" : plan.pairing === "same_position" ? "same-position pairing" : "pairing not chosen"}{plan.mode === "scheduled" && plan.date ? ` · scheduled ${plan.date}${plan.from ? ` ${plan.from}–${plan.to ?? ""}` : ""}` : plan.deadline ? ` · play by ${plan.deadline}` : ""}{plan.courtIds?.length ? ` · ${plan.courtIds.length} court${plan.courtIds.length > 1 ? "s" : ""} chosen` : ""}. Check it, then generate.</p>}
        <label className="block">Date (optional)<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {check && <div className="rounded border p-2 space-y-0.5">{row("Structure", check.structure)}{row("Engine support", check.engine)}{row("Schedule", check.schedule)}{row("Scoring", check.scoring)}</div>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => run(false)}>Check</Button>
          <Button disabled={busy} onClick={() => run(true)}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Create stage</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TieDialog({ champId, spec, matches, nameOf, div, stage, exec, onClose, onDone }: { champId: string; spec: TournamentSpec; matches: any[]; nameOf: (id: string | null) => string; div: string; stage: string; exec: Exec; onClose: () => void; onDone: () => void }) {
  const d = spec.divisions.find((x) => x.divisionId === div)!;
  const st = d.stages.find((x) => x.id === stage)!;
  const gi = spec.divisions.indexOf(d) + 1;
  const { data: pools = [] } = useQuery({
    queryKey: ["tie-pools", champId, div, stage, matches.length],
    queryFn: async () => {
      const full = (await loadEntrants(supabaseDb, champId, spec)).divisions.find((x) => x.divisionId === div)!;
      return sourcePositions(full, st, matches.filter((m) => m.group_number === gi), spec.positionOrders?.[`${div}/${stage}`], undefined, true);
    },
  });
  const [pi, setPi] = useState(0);
  const [order, setOrder] = useState<string[] | null>(null);
  const list = order ?? pools[pi] ?? [];
  const move = (i: number, dir: -1 | 1) => { const n = [...list]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; setOrder(n); };
  const unit = (u: string) => u.split("+").map(nameOf).join(" & ");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md text-sm">
        <DialogHeader><DialogTitle>Decide tied order — {st.name}</DialogTitle></DialogHeader>
        <p className="text-muted-foreground">Wins always decide first. Your order only separates players who are level on wins.</p>
        <select className="h-8 rounded-md border bg-background px-2" value={pi} onChange={(e) => { setPi(Number(e.target.value)); setOrder(null); }}>
          {pools.map((_, i) => <option key={i} value={i}>{d.poolLabels?.[i] || `Pool ${String.fromCharCode(65 + i)}`}</option>)}
        </select>
        <ol className="space-y-1">
          {list.map((u, i) => (
            <li key={u} className="flex items-center gap-2">
              <span className="w-5 text-muted-foreground">{i + 1}.</span><span className="flex-1">{unit(u)}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3 w-3" /></Button>
            </li>
          ))}
        </ol>
        <DialogFooter>
          <Button onClick={async () => {
            try { await decidePositionOrder(supabaseDb, champId, div, stage, pi, list, exec); toast.success("Order saved"); onDone(); } catch (e: any) { toast.error(e.message); }
          }}>Save order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Preview the calculated qualifiers/matchups of a confirmation stage, then create it once and book its planned session. */
function ConfirmStageDialog({ champId, spec, status, nameOf, exec, onClose, onDone }: { champId: string; spec: TournamentSpec; status: StageStatus; nameOf: (id: string | null) => string; exec: Exec; onClose: () => void; onDone: () => void }) {
  const st = spec.divisions.find((d) => d.divisionId === status.divisionKey)?.stages.find((x) => x.id === status.stageKey);
  const { data: rows, error, isLoading } = useQuery({ queryKey: ["stage-preview", champId, status.stageKey, status.divisionKey], queryFn: () => previewNextStage(supabaseDb, champId, status.divisionKey, status.stageKey) });
  const [busy, setBusy] = useState(false);
  const side = (p: string | null, q: string | null) => [p, q].filter(Boolean).map((x) => nameOf(x as string)).join(" & ");
  const sch = st?.schedule;
  const go = async () => {
    setBusy(true);
    try {
      await confirmNextStage(supabaseDb, champId, status.divisionKey, status.stageKey, exec);
      toast.success(`${status.name} created`);
      scheduleToast(await schedulePlannedPlayoffGames(champId));
      await notifyStage(champId, spec, status.divisionKey, status.stageKey);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Generate {status.name} — {status.divisionLabel}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          {isLoading && <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Calculating qualifiers…</div>}
          {error && <div className="text-destructive">{(error as Error).message}</div>}
          {rows && <ol className="list-decimal space-y-1 pl-5" data-testid="stage-preview">{rows.map((r) => <li key={r.id}>{side(r.player_a_member_id, r.partner_a_member_id)} <span className="text-muted-foreground">v</span> {side(r.player_b_member_id, r.partner_b_member_id)}</li>)}</ol>}
          {st?.mapping?.source === "stage_winners" && <p className="text-xs text-muted-foreground">Played by the winners of the previous stage, in game order.</p>}
          {sch && <p className="text-xs text-muted-foreground">{sch.rule === "fixed" ? `Scheduled ${sch.date}${sch.timeFrom ? ` · ${sch.timeFrom}–${sch.timeTo}` : ""}${sch.courtIds?.length ? ` · ${sch.courtIds.length} courts — games are booked into free court slots in this session` : ""}` : sch.rule === "play_by" ? `Play by ${sch.deadline}` : ""}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !rows?.length} onClick={go}>{busy ? "Creating…" : `Create ${status.name}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
