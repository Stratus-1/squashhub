import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabaseDb } from "@/lib/tournaments/structured-db";
import { loadEntrants, rankSourcePools } from "@/lib/tournaments/structured-persist";
import { divisionGroup, type SpecDivision, type TournamentSpec } from "@/lib/tournaments/engine-service";
import type { PlannedStage } from "@/lib/tournaments/contract";
import { inheritedStageScoring } from "@/lib/tournaments/stage-scoring";
import { seededOrder } from "@/lib/tournaments/seeded-bracket";
import { checkDeferredSetup, confirmNextStage, previewNextStage, setupDeferredStage, setupOk, type Exec, type SetupCheck, type StageStatus } from "@/lib/tournaments/progression";
import { savedSwissPlayoff } from "./swiss-playoff-setup";

export function SwissPlayoffSetupDialog({ champId, spec, status, tournament, division, source, exec, nameOf, onClose, onDone }: {
  champId: string; spec: TournamentSpec; status: StageStatus; tournament: any; division: SpecDivision; source: PlannedStage;
  exec: Exec; nameOf: (id: string | null) => string; onClose: () => void; onDone: () => void;
}) {
  const { data: order, error, isLoading } = useQuery({
    queryKey: ["setup-swiss-order", champId, status.divisionKey, source.id],
    queryFn: async () => {
      const full = await loadEntrants(supabaseDb, champId, spec);
      const d = full.divisions.find((x) => x.divisionId === status.divisionKey);
      if (!d) throw new Error("This category no longer exists.");
      const rows = (await supabaseDb.select("club_champs_matches", { champ_id: champId })).filter((m) => m.group_number === divisionGroup(full, d));
      return rankSourcePools(d, source, rows)[0]?.result.order ?? [];
    },
  });
  const saved = savedSwissPlayoff(division, source, status.stageKey, status.name, tournament.beta_lifecycle?.format_plan, order?.length ?? 0);
  const scoring = inheritedStageScoring(tournament, spec, status.divisionKey);
  const plan = division.deferredStages?.find((s) => s.stageKey === status.stageKey)?.plan;
  const [date, setDate] = useState(saved.existing?.schedule.date ?? plan?.date ?? status.plannedDate ?? "");
  const [check, setCheck] = useState<SetupCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const issues = [...saved.issues, ...("issue" in scoring ? [scoring.issue] : []), ...(error ? ["Could not read final Swiss standings. Try again before generating."] : [])];
  const setup = () => ({ kind: "mapped" as const, discipline: saved.discipline, mapping: saved.mapping ?? undefined,
    schedule: plan?.mode === "play_by" ? { rule: "play_by" as const, deadline: plan.deadline, courtIds: plan.courtIds }
      : { rule: "fixed" as const, date, roundDates: [date], timeFrom: plan?.from, timeTo: plan?.to, courtIds: plan?.courtIds } });
  const run = async (generate: boolean) => {
    if (issues.length || isLoading || !order?.length) return;
    setBusy(true);
    try {
      // Keep the saved stage ID. Existing stages are never appended or replaced.
      const c = saved.existing
        ? (await previewNextStage(supabaseDb, champId, status.divisionKey, status.stageKey), { structure: [], engine: [], schedule: [], scoring: [] })
        : await checkDeferredSetup(supabaseDb, champId, status.divisionKey, status.stageKey, setup());
      setCheck(c);
      if (generate && setupOk(c)) {
        if (saved.existing) await confirmNextStage(supabaseDb, champId, status.divisionKey, status.stageKey, exec);
        else await setupDeferredStage(supabaseDb, champId, status.divisionKey, status.stageKey, setup(), exec);
        toast.success(`${status.name} draw generated`);
        onDone();
      }
    } catch (e) { setCheck({ structure: [], schedule: [], scoring: [], engine: [e instanceof Error ? e.message : "Draw check failed."] }); }
    finally { setBusy(false); }
  };
  const unitName = (id: string) => id.split("+").map(nameOf).join(" & ");
  const bracket = saved.top >= 2 && (saved.top & (saved.top - 1)) === 0 && !issues.length ? seededOrder(saved.top) : [];
  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto text-sm">
      <DialogHeader><DialogTitle>Set up {status.name}</DialogTitle><DialogDescription>Review the saved qualification, match format and schedule before generating the draw.</DialogDescription></DialogHeader>
      <p className="font-medium" data-testid="swiss-transition-summary">{division.label.replace(/\s*·\s*(Singles|Doubles|Mixed).*$/i, "")} · {saved.discipline === "doubles" ? "Doubles" : "Singles"} · Swiss standings → seeded knockout {status.name.toLowerCase()}s</p>
      {isLoading ? <p className="text-muted-foreground">Reading final Swiss standings…</p> : issues.length > 0 ? <div role="alert" className="space-y-1 text-destructive">{issues.map((issue) => <p key={issue}>{issue}</p>)}</div> : <div data-testid="swiss-qualifier-preview" className="space-y-2">
        <p className="font-medium">Confirmed Top {saved.top} · {saved.top / 2} matches</p>
        <ol className="space-y-1">{bracket.filter((_, i) => i % 2 === 0).map((a, i) => {
          const b = bracket[i * 2 + 1];
          return <li key={a}>Game {i + 1}: #{a} {order?.[a - 1] ? unitName(order[a - 1]) : "…"} v #{b} {order?.[b - 1] ? unitName(order[b - 1]) : "…"}</li>;
        })}</ol>
        <p className="text-xs text-muted-foreground">Final Swiss standings: wins → Buchholz → Sonneborn-Berger → seed. Generation checks the latest results again.</p>
      </div>}
      <div data-testid="inherited-match-format" className="border-t border-border pt-2"><p>Match format: {scoring.ok ? scoring.text : "Not confirmed"} — inherited from {division.label}</p></div>
      <Link className="text-primary underline" to={`/club-admin?club=riverside&tab=champs&setup=${champId}`}>Edit Tournament Setup</Link>
      <p className="text-xs text-muted-foreground">To change the scoring format or confirm qualification, edit this category in Tournament Setup.</p>
      {saved.existing ? <p>Scheduled: {saved.existing.schedule.date ?? saved.existing.schedule.deadline ?? "Not set"}</p> : <label>Date<Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setCheck(null); }} /></label>}
      <p className="text-muted-foreground">{plan?.from ? `${plan.from}–${plan.to ?? ""} · ` : ""}{(saved.existing?.schedule.courtIds ?? plan?.courtIds)?.length ?? 0} saved courts</p>
      {check && <div role="status" className="space-y-1">{[...check.structure, ...check.engine, ...check.schedule, ...check.scoring].map((issue) => <p className="text-destructive" key={issue}>{issue}</p>)}{setupOk(check) && <p>Draw checks passed.</p>}</div>}
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy || isLoading || issues.length > 0} onClick={() => run(false)}>Check Draw</Button>
        <Button disabled={busy || isLoading || issues.length > 0 || !check || !setupOk(check)} onClick={() => run(true)}>Generate {status.name} Draw</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}