import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fromExt } from "@/lib/supabase-ext";
import { supabaseDb } from "@/lib/tournaments/structured-db";
import { classifyEdit, serializeSpec, type TournamentSpec } from "@/lib/tournaments/engine-service";

/**
 * Structured Tournament Editor: reopens the saved spec exactly as persisted.
 * Label and schedule edits are saved in place (no games change). Structural edits are
 * shown with their impact and blocked when results exist; entrant changes go through Rebuild.
 */
export function StructuredEditorDialog({ champId, spec, matches, onSaved }: {
  champId: string; spec: TournamentSpec; matches: any[]; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TournamentSpec>(() => serializeSpec(spec));
  const [saving, setSaving] = useState(false);
  const fixtures = useMemo(() => matches.map((m) => ({
    divisionId: spec.divisions[(m.group_number ?? 1) - 1]?.divisionId ?? "", stageId: m.stage_key, stageKind: "pools" as const,
    a: m.player_a_member_id, b: m.player_b_member_id, status: m.status, winner: m.winner_member_id,
  })), [matches, spec]);
  const impact = classifyEdit(spec, draft, fixtures);
  const set = (mut: (s: TournamentSpec) => void) => setDraft((d) => { const n = serializeSpec(d); mut(n); return n; });

  const save = async () => {
    if (impact.kind === "structural") { toast.error("Structure changes aren't saved here. Use Rebuild for entry changes."); return; }
    setSaving(true);
    try {
      const { error } = await fromExt("tournaments").update({ builder_spec: draft, builder_spec_version: (spec.version ?? 1) }).eq("id", champId);
      if (error) throw error;
      const divs = await supabaseDb.select("tournament_divisions", { tournament_id: champId });
      for (const d of draft.divisions) {
        const row = divs.find((x) => x.spec_key === d.divisionId);
        if (!row) continue;
        await supabaseDb.update("tournament_divisions", { id: row.id }, { label: d.label });
        const stages = await supabaseDb.select("tournament_stages", { division_id: row.id });
        for (const st of stages) {
          const s = d.stages.find((x) => x.id === st.spec_key);
          if (s) await supabaseDb.update("tournament_stages", { id: st.id }, { label: s.name });
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
                    <label className="text-xs text-muted-foreground">{st.schedule.rule === "play_by" ? "Play by" : "Date"}
                      <Input type="date" value={(st.schedule.rule === "play_by" ? st.schedule.deadline : st.schedule.date)?.slice(0, 10) ?? ""}
                        onChange={(e) => set((s) => { const sc = s.divisions[di].stages[si].schedule; if (sc.rule === "play_by") sc.deadline = e.target.value; else sc.date = e.target.value; })} />
                    </label>
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
              </div>
            ))}
            <div className="rounded bg-muted p-2 text-xs">
              {impact.kind === "none" && "No changes yet."}
              {impact.kind === "safe" && "Safe change: names/dates only. No games are regenerated."}
              {impact.kind === "structural" && "Structure change — not allowed here."}
              {impact.lockedReasons.map((r) => <div key={r}>• {r}</div>)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || impact.kind !== "safe"} onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
