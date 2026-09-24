import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fromExt } from "@/lib/supabase-ext";
import { supabaseDb } from "@/lib/tournaments/structured-db";
import { classifyEdit, serializeSpec, sourceStageOf, type TournamentSpec } from "@/lib/tournaments/engine-service";
import { progressionOf } from "@/lib/tournaments/contract";
import { TransitionEditor } from "./TransitionEditor";
import { d10, specDateIssues, stageWindow, windowChangeImpact, type DateWindow } from "@/lib/tournaments/date-window";
import { AUDIENCE_OPTIONS, type EventScope } from "@/lib/smart-builder/scope";
import { SCOPE_LABEL, courtRemovalImpact, tournamentCourts } from "@/lib/smart-builder/venues";
import { useHostClubs, useHostCourts, useTournamentVenues } from "@/hooks/use-tournaments";
import { useQueryClient } from "@tanstack/react-query";

/** Host clubs + selected courts, from the authoritative tournament_venues rows. Removal is impact-checked; history is never rewritten. */
function VenueCourtsEditor({ champId, matches }: { champId: string; matches: any[] }) {
  const qc = useQueryClient();
  const { data: venues = [] } = useTournamentVenues(champId);
  const { data: clubs = [] } = useHostClubs();
  const { data: courts = [] } = useHostCourts(venues.map((v: any) => v.club_id));
  const [picked, setPicked] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked(Object.fromEntries(venues.map((v: any) => [v.club_id, v.court_ids ?? []]))); }, [venues]);
  if (!venues.length) return <div className="rounded border p-2 text-xs text-muted-foreground">No host venues were recorded for this tournament.</div>;
  const removed = venues.flatMap((v: any) => (v.court_ids ?? []).filter((c: number) => !(picked[v.club_id] ?? []).includes(c)));
  const impact = courtRemovalImpact(removed, matches);
  const changed = venues.some((v: any) => JSON.stringify([...(v.court_ids ?? [])].sort()) !== JSON.stringify([...(picked[v.club_id] ?? [])].sort()));
  const name = (id: number) => courts.find((c) => c.court_id === id)?.name ?? `Court #${id}`;
  const save = async () => {
    setBusy(true);
    try {
      for (const v of venues as any[]) {
        const next = [...(picked[v.club_id] ?? [])].sort((a, b) => a - b);
        const { error } = await fromExt("tournament_venues").update({ court_ids: next }).eq("id", v.id);
        if (error) throw error;
      }
      await fromExt("tournaments").update({ court_ids: Object.values(picked).flat() }).eq("id", champId);
      toast.success("Courts saved");
      qc.invalidateQueries({ queryKey: ["tournament-venues", champId] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="rounded border p-2 text-xs space-y-2">
      <div className="font-semibold">Host venues &amp; courts</div>
      {venues.map((v: any) => {
        const list = tournamentCourts(courts, v.club_id);
        const extra = (v.court_ids ?? []).filter((id: number) => !list.some((c) => c.court_id === id)); // e.g. since deactivated — kept, never dropped silently
        return (
          <fieldset key={v.id} className="flex flex-wrap items-center gap-2">
            <legend className="text-muted-foreground">{clubs.find((c) => c.id === v.club_id)?.name ?? v.club_id}</legend>
            {[...list.map((c) => c.court_id), ...extra].map((id: number) => (
              <label key={id} className="flex items-center gap-1">
                <input type="checkbox" checked={(picked[v.club_id] ?? []).includes(id)}
                  onChange={() => setPicked((p) => ({ ...p, [v.club_id]: (p[v.club_id] ?? []).includes(id) ? p[v.club_id].filter((x) => x !== id) : [...(p[v.club_id] ?? []), id] }))} />
                {name(id)}{extra.includes(id) ? " (inactive)" : ""}
              </label>
            ))}
          </fieldset>
        );
      })}
      {impact.history.length > 0 && <p className="text-destructive">Played games used {impact.history.map(name).join(", ")} — they stay attached to those games and can't be removed.</p>}
      {impact.future.length > 0 && <p className="text-destructive">Unplayed games are on {impact.future.map(name).join(", ")}. Move those games to another court first.</p>}
      <Button size="sm" variant="outline" disabled={!changed || impact.blocked || busy} onClick={save}>Save courts</Button>
    </div>
  );
}

/** Owner / audience / venues saved with the tournament, so they aren't lost after creation. */
function EventSummary({ scope }: { scope?: { scope?: EventScope | null; ownerName?: string | null; audience?: string | null; noVenue?: boolean; venues?: { names?: string[] } } | null }) {
  if (!scope?.scope) return <div className="rounded border p-2 text-xs text-muted-foreground">Owner, audience and venues weren't recorded for this tournament.</div>;
  const aud = AUDIENCE_OPTIONS[scope.scope].find((o) => o.value === scope.audience)?.label;
  return (
    <div className="rounded border p-2 text-xs grid sm:grid-cols-3 gap-2">
      <div><div className="text-muted-foreground">Event level &amp; owner</div>{SCOPE_LABEL[scope.scope]} — {scope.ownerName ?? "not chosen"}</div>
      <div><div className="text-muted-foreground">Who may enter</div>{aud ?? "not decided"}</div>
      <div><div className="text-muted-foreground">Venue(s)</div>{scope.noVenue ? "No physical venue" : scope.venues?.names?.join(", ") || "not chosen"}</div>
      <p className="sm:col-span-3 text-muted-foreground">Fixed after creation, because entries and games depend on them.</p>
    </div>
  );
}

/**
 * Structured Tournament Editor: reopens the saved spec exactly as persisted.
 * Label and schedule edits are saved in place (no games change). Structural edits are
 * shown with their impact and blocked when results exist; entrant changes go through Rebuild.
 * Play-off mapping (qualification → method → pairing rule) can be changed only while the
 * destination stage has no games; completed play-offs are never remapped.
 */
export function StructuredEditorDialog({ champId, spec, matches, onSaved }: {
  champId: string; spec: TournamentSpec; matches: any[]; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TournamentSpec>(() => serializeSpec(spec));
  const [saving, setSaving] = useState(false);
  // Tournament dates: the ONE copy lives on the tournament row, never in the spec.
  const [savedWindow, setSavedWindow] = useState<DateWindow>({ start: null, end: null });
  const [win, setWin] = useState<DateWindow>({ start: null, end: null });
  useEffect(() => {
    if (!open) return;
    fromExt("tournaments").select("start_date, end_date").eq("id", champId).maybeSingle().then(({ data }: any) => {
      const w = { start: d10(data?.start_date), end: d10(data?.end_date) };
      setSavedWindow(w); setWin(w);
    });
  }, [open, champId]);
  const windowChanged = win.start !== savedWindow.start || win.end !== savedWindow.end;
  const dateFixtures = matches.map((m) => ({ divisionId: spec.divisions[(m.group_number ?? 1) - 1]?.divisionId ?? "", stageId: m.stage_key, date: m.scheduled_date ?? null }));
  const dateProblems = windowChangeImpact(draft, win, dateFixtures);
  void specDateIssues;
  const fixtures = useMemo(() => matches.map((m) => ({
    divisionId: spec.divisions[(m.group_number ?? 1) - 1]?.divisionId ?? "", stageId: m.stage_key, stageKind: "pools" as const,
    a: m.player_a_member_id, b: m.player_b_member_id, status: m.status, winner: m.winner_member_id,
  })), [matches, spec]);
  const hasGames = (divisionId: string, stageKey: string) => fixtures.some((f) => f.divisionId === divisionId && f.stageId === stageKey);

  /** Mapping edits are judged separately, so they don't read as a whole-structure change. */
  const withSavedTransitions = (d: TournamentSpec): TournamentSpec => {
    const n = serializeSpec(d);
    n.divisions.forEach((div) => div.stages.forEach((st) => {
      const old = spec.divisions.find((x) => x.divisionId === div.divisionId)?.stages.find((x) => x.id === st.id);
      if (st.qualify) st.qualify.transition = old?.qualify?.transition ?? null;
    }));
    return n;
  };
  const impact = classifyEdit(spec, withSavedTransitions(draft), fixtures);
  const changedTransitions = draft.divisions.flatMap((d) => d.stages
    .filter((st) => JSON.stringify(st.qualify?.transition ?? null) !== JSON.stringify(spec.divisions.find((x) => x.divisionId === d.divisionId)?.stages.find((x) => x.id === st.id)?.qualify?.transition ?? null))
    .map((st) => ({ divisionId: d.divisionId, label: d.label, stage: st })));
  const blockedTransitions = changedTransitions.filter((c) => hasGames(c.divisionId, c.stage.id));
  const set = (mut: (s: TournamentSpec) => void) => setDraft((d) => { const n = serializeSpec(d); mut(n); return n; });
  const canSave = !saving && impact.kind !== "structural" && !blockedTransitions.length && !dateProblems.length && (impact.kind !== "none" || changedTransitions.length > 0 || windowChanged);

  const save = async () => {
    if (impact.kind === "structural") { toast.error("Structure changes aren't saved here. Use Rebuild for entry changes."); return; }
    if (blockedTransitions.length) { toast.error("Those play-off games already exist and can't be remapped."); return; }
    setSaving(true);
    try {
      if (dateProblems.length) throw new Error(dateProblems[0]);
      const { error } = await fromExt("tournaments").update({ builder_spec: draft, builder_spec_version: (spec.version ?? 1), start_date: win.start, end_date: win.end }).eq("id", champId);
      if (error) throw error;
      const divs = await supabaseDb.select("tournament_divisions", { tournament_id: champId });
      for (const d of draft.divisions) {
        const row = divs.find((x) => x.spec_key === d.divisionId);
        if (!row) continue;
        await supabaseDb.update("tournament_divisions", { id: row.id }, { label: d.label });
        const stages = await supabaseDb.select("tournament_stages", { division_id: row.id });
        for (const st of stages) {
          const s = d.stages.find((x) => x.id === st.spec_key);
          if (s) await supabaseDb.update("tournament_stages", { id: st.id }, { label: s.name, config: { ...(st.config ?? {}), qualify: s.qualify, transition: s.qualify?.transition ?? null } });
          for (const [i, lbl] of (d.poolLabels ?? []).entries()) if (lbl) await supabaseDb.update("tournament_pools", { stage_id: st.id, pool_index: i }, { label: lbl });
        }
      }
      toast.success("Saved — no games were changed");
      setOpen(false); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setDraft(serializeSpec(spec)); setOpen(true); }}><Pencil className="w-4 h-4 mr-1" />Edit tournament</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit tournament</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <EventSummary scope={spec.scope as any} />
            <VenueCourtsEditor champId={champId} matches={matches} />
            <div className="rounded border p-2 space-y-1">
              <div className="text-xs font-medium">Tournament dates</div>
              <div className="grid grid-cols-2 gap-2 max-w-md">
                <label className="text-xs text-muted-foreground">First day<Input type="date" value={win.start ?? ""} onChange={(e) => setWin((w) => ({ ...w, start: e.target.value || null }))} /></label>
                <label className="text-xs text-muted-foreground">Last day<Input type="date" value={win.end ?? ""} onChange={(e) => setWin((w) => ({ ...w, end: e.target.value || null }))} /></label>
              </div>
              <p className="text-[11px] text-muted-foreground">Stages set to use the tournament dates follow these automatically.</p>
            </div>
            {draft.divisions.map((d, di) => (
              <div key={d.divisionId} className="rounded border p-2 space-y-2">
                <label className="block text-xs text-muted-foreground">Division name
                  <Input value={d.label} onChange={(e) => set((s) => { s.divisions[di].label = e.target.value; })} />
                </label>
                {d.stages.map((st, si) => (
                  <div key={st.id} className="grid sm:grid-cols-3 gap-2 items-end">
                    <label className="text-xs text-muted-foreground">Stage ({st.kind})
                      <Input value={st.name} onChange={(e) => set((s) => { s.divisions[di].stages[si].name = e.target.value; })} />
                    </label>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={stageWindow(st, win).inherits}
                        onChange={(e) => set((s) => { const sc = s.divisions[di].stages[si].schedule; if (e.target.checked) { sc.start = null; sc.end = null; } else { sc.start = win.start; sc.end = win.end; } })} />Use tournament dates</label>
                      {!stageWindow(st, win).inherits && (
                        <div className="grid grid-cols-2 gap-1">
                          <label>Stage window from<Input type="date" value={d10(st.schedule.start) ?? ""} onChange={(e) => set((s) => { s.divisions[di].stages[si].schedule.start = e.target.value || null; })} /></label>
                          <label>to<Input type="date" value={d10(st.schedule.end) ?? ""} onChange={(e) => set((s) => { s.divisions[di].stages[si].schedule.end = e.target.value || null; })} /></label>
                        </div>
                      )}
                      <label>{st.schedule.rule === "play_by" ? "Round play-by date" : "Round 1 date (fixed)"}
                        <Input type="date" value={d10(st.schedule.rule === "play_by" ? st.schedule.deadline : st.schedule.date) ?? ""}
                          onChange={(e) => set((s) => { const sc = s.divisions[di].stages[si].schedule; if (sc.rule === "play_by") sc.deadline = e.target.value || null; else sc.date = e.target.value || null; })} />
                      </label>
                    </div>
                    {st.kind === "pools" && (
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: st.pools ?? 1 }, (_, i) => (
                          <Input key={i} className="w-24" placeholder={`Pool ${String.fromCharCode(65 + i)}`} value={d.poolLabels?.[i] ?? ""}
                            onChange={(e) => set((s) => { const l = [...(s.divisions[di].poolLabels ?? [])]; l[i] = e.target.value; s.divisions[di].poolLabels = l; })} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {d.stages.filter((st) => st.order > 0 && progressionOf(st).mode === "qualifiers").map((st) => {
                  const source = sourceStageOf(d, st);
                  if (!source) return null;
                  const si = d.stages.findIndex((x) => x.id === st.id);
                  return (
                    <TransitionEditor key={`tr-${st.id}`} stage={st} source={source} poolLabels={d.poolLabels}
                      locked={hasGames(d.divisionId, st.id)} value={st.qualify?.transition ?? null}
                      onChange={(t) => set((s) => { const q = s.divisions[di].stages[si].qualify ?? { perPool: 0, mapping: null }; q.transition = t; q.perPool = Math.max(q.perPool ?? 0, ...t.positions); q.mapping = t.method === "cross_pool" ? "cross_pool" : "reseed"; s.divisions[di].stages[si].qualify = q; })} />
                  );
                })}
              </div>
            ))}
            <div className="rounded bg-muted p-2 text-xs">
              {impact.kind === "none" && !changedTransitions.length && !windowChanged && "No changes yet."}
              {windowChanged && !dateProblems.length && <div>Tournament dates changed. Every stage and game still fits.</div>}
              {dateProblems.map((m) => <div key={m} className="text-destructive">• {m}</div>)}
              {impact.kind === "safe" && "Safe change: names/dates only. No games are regenerated."}
              {impact.kind === "structural" && "Structure change — not allowed here."}
              {!!changedTransitions.length && !blockedTransitions.length && <div>Play-off mapping changed for {changedTransitions.map((c) => `${c.label} · ${c.stage.name}`).join(", ")}. No games exist there yet.</div>}
              {blockedTransitions.map((c) => <div key={c.stage.id} className="text-destructive">• {c.label} · {c.stage.name}: those games already exist and cannot be remapped.</div>)}
              {impact.lockedReasons.map((r) => <div key={r}>• {r}</div>)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!canSave} onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
