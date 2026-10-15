/**
 * Planned Format — compact stage planner (pilot, flag-gated).
 * Starting default → category summary → one expandable category stage planner → single Save plan.
 * Saving never changes games, bookings, results or messages: it stores the plan (and a version when the
 * tournament exists) and shows a display-only impact preview. Applying to draws is a separate, later approval.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Plus, Trash2, Loader2 } from "lucide-react";
import {
  STAGE_KINDS, stageKindLabel, resolveStagePlan, setCategoryStagePlan, setStartingDefault, deriveStageStatus,
  validateStagePlan, planImpact, recommendSwissRounds, newStageId, stageRounds,
  type StagePlanItem, type StageKind, type PlanAnswers, type StageGameRow, type ImpactFixture, type AdvanceMode,
} from "@/lib/smart-builder/stage-plan";

export interface StageUnit { key: string; base: string }

type Fixture = ImpactFixture & { unitKey: string | null };
const norm = (s: string) => s.toLowerCase().replace(/::|›|·/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

async function loadFixtures(tournamentId: string, units: StageUnit[]): Promise<Fixture[]> {
  const [{ data: m }, { data: st }, { data: dv }] = await Promise.all([
    (supabase as any).from("club_champs_matches").select("id,round_number,status,winner_member_id,score,is_bye,booking_id,scheduled_date,stage_id,division_id").eq("champ_id", tournamentId),
    (supabase as any).from("tournament_stages").select("id,division_id,stage_order").eq("tournament_id", tournamentId),
    (supabase as any).from("tournament_divisions").select("id,label,spec_key").eq("tournament_id", tournamentId),
  ]);
  const divUnit = new Map<string, string | null>();
  (dv ?? []).forEach((d: any) => { const u = units.find((x) => norm(x.key) === norm(d.label ?? "") || norm(x.base) === norm(d.label ?? "")); divUnit.set(d.id, u?.key ?? null); });
  const order = new Map<string, number>();
  const byDiv = new Map<string, any[]>();
  (st ?? []).forEach((s: any) => byDiv.set(s.division_id, [...(byDiv.get(s.division_id) ?? []), s]));
  byDiv.forEach((list) => list.sort((x, y) => (x.stage_order ?? 0) - (y.stage_order ?? 0)).forEach((s, i) => order.set(s.id, i)));
  const DONE = new Set(["completed", "confirmed", "walkover", "final", "played"]);
  return (m ?? []).map((f: any) => ({
    id: f.id, unitKey: f.division_id ? divUnit.get(f.division_id) ?? null : null,
    stageIndex: f.stage_id ? order.get(f.stage_id) ?? 0 : 0, round: f.round_number ?? null,
    decided: DONE.has(String(f.status ?? "")) || !!f.winner_member_id || !!f.score || !!f.is_bye,
    hasBooking: !!f.booking_id, scheduled: !!f.scheduled_date,
  }));
}

export function StagePlanPanel<A extends PlanAnswers>({ answers, onSave, units, entrants, tournamentId }: {
  answers: A; onSave: (next: A) => void; units: StageUnit[]; entrants: Record<string, number>; tournamentId?: string | null;
}) {
  const [draft, setDraft] = useState<A>(answers);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify({ f: draft.format, o: draft.formatOverrides, p: draft.stagePlans }) !== JSON.stringify({ f: answers.format, o: answers.formatOverrides, p: answers.stagePlans });
  useEffect(() => { if (!dirty) setDraft(answers); }, [answers]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const { data: fixtures = [] } = useQuery({ queryKey: ["stage-plan-fixtures", tournamentId], enabled: !!tournamentId, queryFn: () => loadFixtures(tournamentId!, units) });
  const { data: version = 0, refetch: refetchVersion } = useQuery({
    queryKey: ["stage-plan-version", tournamentId], enabled: !!tournamentId,
    queryFn: async () => { const { data } = await (supabase as any).from("tournament_plan_versions").select("version").eq("tournament_id", tournamentId).order("version", { ascending: false }).limit(1).maybeSingle(); return (data?.version as number) ?? 0; },
  });

  const gamesFor = (key: string): Fixture[] => fixtures.filter((f) => f.unitKey === key);
  const def = draft.format ?? {};
  const defKind = (STAGE_KINDS.find((k) => k.kind === def.kind)?.kind ?? null) as StageKind | null;
  const defRounds = Number(def.swissRoundsConfirmed || def.swissRounds) || null;
  const totalEntrants = Math.max(0, ...Object.values(entrants));

  const rows = useMemo(() => units.map((u) => {
    const r = resolveStagePlan(draft, u.key);
    const games = gamesFor(u.key);
    const statuses = r.stages.map((s, i) => deriveStageStatus(s, i, games));
    const ci = Math.max(0, statuses.findIndex((s) => s.state !== "completed"));
    return { u, ...r, statuses, ci, cur: r.stages[ci] ?? r.stages[0], next: r.stages[ci + 1] ?? null, games };
  }), [draft, units, fixtures]); // eslint-disable-line react-hooks/exhaustive-deps

  const setStages = (key: string, stages: StagePlanItem[]) => setDraft((d) => setCategoryStagePlan(d, key, stages));
  const allIssues = rows.flatMap((r) => validateStagePlan(r.stages, { entrants: entrants[r.u.key] || null, generated: generatedFor(r) }).map((i) => ({ ...i, unit: r.u.base })));
  const errors = allIssues.filter((i) => i.level === "error");

  async function save() {
    if (errors.length) return toast.error("Fix the highlighted stage issues before saving.");
    setSaving(true);
    try {
      if (tournamentId) {
        const { error } = await (supabase as any).rpc("save_tournament_plan_version", {
          _tournament_id: tournamentId, _expected_version: version, _stage_plans: draft.stagePlans ?? {}, _starting_default: draft.format ?? null, _note: null,
        });
        if (error) throw error;
        await refetchVersion();
      }
      onSave(draft);
      toast.success(tournamentId ? "Plan saved as a new version. No games, bookings or results were changed." : "Plan saved.");
    } catch (e: any) { toast.error(e.message ?? "Could not save the plan"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3 text-[13px]">
      <section className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center justify-between"><div className="font-semibold">Starting format for every category</div>{dirty && <Badge variant="secondary">Unsaved changes</Badge>}</div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Starting format" className="h-9 rounded-md border border-input bg-background px-2" value={defKind ?? ""} onChange={(e) => setDraft((d) => setStartingDefault(d, (e.target.value || null) as StageKind | null, defRounds))}>
            <option value="">Not set</option>
            {STAGE_KINDS.filter((k) => k.kind !== "cross_league").map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          {defKind === "swiss" && <><span>Rounds</span><Input aria-label="Starting rounds" type="number" min={1} max={15} className="h-9 w-20" value={defRounds ?? ""} onChange={(e) => setDraft((d) => setStartingDefault(d, "swiss", Number(e.target.value) || null))} /></>}
          {defKind === "swiss" && recommendSwissRounds(totalEntrants) && <span className="text-xs text-muted-foreground">Suggested for {totalEntrants} entrants: {recommendSwissRounds(totalEntrants)} (advice only)</span>}
        </div>
      </section>

      <section className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground"><tr>
            <th className="p-2">Category</th><th className="p-2">Entr.</th><th className="p-2">Current stage</th><th className="p-2">Rnds</th><th className="p-2">Source</th><th className="p-2">Next stage</th><th className="p-2">Status</th><th className="p-2" />
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const st = r.statuses[r.ci];
              return <tr key={r.u.key} className="border-t border-border">
                <td className="p-2 font-medium">{r.u.base}</td>
                <td className="p-2 tabular-nums">{entrants[r.u.key] || "—"}</td>
                <td className="p-2">{stageKindLabel(r.cur?.kind)}</td>
                <td className="p-2 tabular-nums">{r.cur ? stageRounds(r.cur) ?? "—" : "—"}</td>
                <td className="p-2"><Badge variant="outline">{r.source === "default" ? "Default" : r.source === "category" ? "Category" : r.source === "override" ? "Own" : "Not set"}</Badge></td>
                <td className="p-2">{r.next ? (r.next.kind ? stageKindLabel(r.next.kind) + (r.next.advance?.mode === "top_n" && r.next.advance.topN ? ` (top ${r.next.advance.topN})` : "") : "Undecided") : "—"}</td>
                <td className="p-2">{st?.state === "active" ? `Active R${st.currentRound}` : st?.state === "completed" ? "Completed" : "Planned"}</td>
                <td className="p-2"><Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setOpen(open === r.u.key ? null : r.u.key)} aria-expanded={open === r.u.key}>{open === r.u.key ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Edit stage plan</Button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </section>

      {open && (() => {
        const r = rows.find((x) => x.u.key === open)!;
        if (!r) return null;
        const saved = resolveStagePlan(answers, r.u.key).stages;
        const imp = planImpact(saved, r.stages, r.games);
        const issues = validateStagePlan(r.stages, { entrants: entrants[r.u.key] || null, generated: generatedFor(r) });
        const upd = (i: number, patch: Partial<StagePlanItem>) => setStages(r.u.key, r.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)));
        return <section className="rounded-lg border border-border p-3 space-y-2">
          <div className="font-semibold">{r.u.base} — stage plan</div>
          {r.stages.map((s, i) => {
            const st = r.statuses[i];
            const locked = st.state === "completed";
            const drawn = st.state !== "planned";
            return <div key={s.id} className="rounded-md border border-border p-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold w-16">Stage {i + 1}</span>
                <select aria-label={`Stage ${i + 1} format`} disabled={drawn} className="h-8 rounded-md border border-input bg-background px-2" value={s.kind ?? ""} onChange={(e) => upd(i, { kind: (e.target.value || null) as StageKind | null })}>
                  <option value="">Undecided</option>
                  {STAGE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                </select>
                {s.kind === "swiss" && <><span>Rounds</span><Input aria-label={`Stage ${i + 1} rounds`} type="number" min={1} max={15} disabled={drawn} className="h-8 w-16" value={s.rounds ?? ""} onChange={(e) => upd(i, { rounds: Number(e.target.value) || null })} /></>}
                {s.kind === "swiss" && drawn && !locked && <><span>End after round</span><Input aria-label={`Stage ${i + 1} end after round`} type="number" min={1} className="h-8 w-16" value={s.endAfterRound ?? ""} placeholder={String(s.rounds ?? "")} onChange={(e) => upd(i, { endAfterRound: Number(e.target.value) || null })} /></>}
                {s.kind === "pools" && <><span>Pools</span><Input aria-label={`Stage ${i + 1} pools`} type="number" min={1} disabled={drawn} className="h-8 w-16" value={s.pools ?? ""} onChange={(e) => upd(i, { pools: Number(e.target.value) || null })} /></>}
                <Badge variant={st.state === "active" ? "default" : "outline"}>{st.state === "active" ? `Active · R${st.currentRound}` : st.state === "completed" ? "Completed" : "Planned"}</Badge>
                {!drawn && i > 0 && <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto" aria-label={`Remove stage ${i + 1}`} onClick={() => setStages(r.u.key, r.stages.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>}
              </div>
              {i < r.stages.length - 1 || s.advance?.mode !== "all_continue" ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span>Advances:</span>
                  <select aria-label={`Stage ${i + 1} advancement`} disabled={locked} className="h-7 rounded-md border border-input bg-background px-2" value={s.advance?.mode ?? "all_continue"} onChange={(e) => upd(i, { advance: { ...(s.advance ?? {}), mode: e.target.value as AdvanceMode } })}>
                    <option value="all_continue">Everyone continues</option><option value="top_n">Top N qualify</option><option value="per_pool">Top N per pool</option><option value="shared_playoff">Feeds shared playoff</option><option value="none">Final stage</option>
                  </select>
                  {(s.advance?.mode === "top_n" || s.advance?.mode === "per_pool") && <Input aria-label={`Stage ${i + 1} qualifiers`} type="number" min={1} disabled={locked} className="h-7 w-16" value={(s.advance.mode === "top_n" ? s.advance.topN : s.advance.perPool) ?? ""} onChange={(e) => upd(i, { advance: { ...s.advance!, [s.advance!.mode === "top_n" ? "topN" : "perPool"]: Number(e.target.value) || null } })} />}
                </div>
              ) : null}
            </div>;
          })}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setStages(r.u.key, [...r.stages, { id: newStageId(), kind: null, advance: { mode: "all_continue" } }])}><Plus className="h-3 w-3" /> Add future stage</Button>
          {issues.length > 0 && <ul className="text-xs space-y-0.5">{issues.map((x, k) => <li key={k} className={x.level === "error" ? "text-destructive" : "text-muted-foreground"}>{x.message}</li>)}</ul>}
          {imp.changed && <div className="rounded-md border border-dashed border-border p-2 text-xs space-y-1">
            <div className="font-semibold">Impact preview (nothing changes until a separate approval)</div>
            <div>Played games kept: {imp.protectedPlayed}</div>
            <div>Unplayed games a later approval would withdraw: {imp.withdraw.length}{imp.keepBookings ? ` — their ${imp.keepBookings} court booking(s) are kept by default` : ""}</div>
            {imp.drawLater.map((t) => <div key={t}>{t}</div>)}
            {!tournamentId && <div className="text-muted-foreground">No games exist yet — this is planning only.</div>}
          </div>}
        </section>;
      })()}

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-background py-2">
        {tournamentId && <span className="mr-auto text-xs text-muted-foreground">Saved version: {version || "none yet"}</span>}
        <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => setDraft(answers)}>Discard</Button>
        <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save plan"}</Button>
      </div>
    </div>
  );
}

function generatedFor(r: { stages: StagePlanItem[]; statuses: { state: string }[]; games: StageGameRow[] }) {
  return r.stages.map((s, i) => ({ s, i })).filter(({ i }) => r.statuses[i].state !== "planned").map(({ s, i }) => {
    const g = r.games.filter((x) => x.stageIndex === i);
    const played = g.filter((x) => x.decided).map((x) => x.round ?? 1);
    return { index: i, kind: s.kind, maxPlayedRound: played.length ? Math.max(...played) : 0, maxGeneratedRound: Math.max(0, ...g.map((x) => x.round ?? 1)) };
  });
}
