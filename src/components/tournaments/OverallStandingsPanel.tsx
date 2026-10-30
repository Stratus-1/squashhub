import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { type OverallRow } from "@/lib/tournaments/overall-standings";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import type { FinalLadderMove } from "@/lib/tournaments/final-ladder";

/** Final 1-to-last order for one category, with an organiser-confirmed "Apply to club ladder". */
export function OverallStandingsPanel({ title, rows, complete, names, clubId, canManage, tournamentId, groupNumber }: { title: string; rows: OverallRow[]; complete: boolean; names: Record<string, string>; clubId: string; canManage: boolean; tournamentId: string; groupNumber: number }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<null | { moves: FinalLadderMove[]; skipped: string[] }>(null);
  const [busy, setBusy] = useState(false);
  const modeKey = ["tournament-ladder-mode", clubId, tournamentId];
  const { data: finalMode = false } = useQuery({ queryKey: modeKey, enabled: canManage, queryFn: async () => {
    const { data, error } = await fromExt("tournaments").select("ladder_update_mode").eq("id", tournamentId).eq("club_id", clubId).single();
    if (error) throw error;
    return data?.ladder_update_mode === "final_standings";
  }});
  // Hidden until the category is finished (final played); provisional orders invite premature ladder changes.
  if (!rows.length || !complete) return null;

  const setFinalMode = async (enabled: boolean) => {
    setBusy(true);
    const { error } = await rpcExt("champ_set_final_ladder_mode", { p_club_id: clubId, p_champ_id: tournamentId, p_enabled: enabled });
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: modeKey });
    toast.success(enabled ? "Ladder changes will use final standings, not individual games" : "Previous per-game ladder settings restored");
  };

  const openPreview = async () => {
    setBusy(true);
    try {
      const { data, error } = await rpcExt("champ_final_ladder", { p_club_id: clubId, p_champ_id: tournamentId, p_group: groupNumber, p_order: rows.map((r) => r.id), p_apply: false });
      if (error) throw error;
      setPreview(data as { moves: FinalLadderMove[]; skipped: string[] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load the ladder");
    } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    const { error } = await rpcExt("champ_final_ladder", { p_club_id: clubId, p_champ_id: tournamentId, p_group: groupNumber, p_order: rows.map((r) => r.id), p_apply: true, p_expected: preview.moves });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Club ladder updated from the final standings");
    qc.invalidateQueries({ queryKey: ["ladder"] });
    qc.invalidateQueries({ queryKey: ["club-members"] });
    setPreview(null);
  };

  return (
    <div className="mt-4 border-t border-border pt-3" data-testid="overall-standings">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title} · Final standings</div>
        {canManage && <Button size="sm" variant="outline" disabled={!complete || busy} onClick={openPreview}>Apply to club ladder…</Button>}
      </div>
      {canManage && <label className="mb-2 flex items-center gap-2 text-xs"><Checkbox checked={finalMode} disabled={busy} onCheckedChange={(checked) => void setFinalMode(checked === true)} />Use final standings instead of per-game ladder changes</label>}
      {!complete && <p className="mb-2 text-xs text-muted-foreground">Provisional — tournament games or stages are still to be completed.</p>}
      <ol className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-baseline gap-2">
            <span className="w-6 text-right font-semibold tabular-nums">{r.place}</span>
            <span>{names[r.id] ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{r.how}</span>
          </li>
        ))}
      </ol>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply final standings to the club ladder?</DialogTitle>
            <DialogDescription>These players swap among the ladder places they already hold, in finishing order. Nobody else moves.</DialogDescription>
          </DialogHeader>
          {preview && (preview.moves.length ? (
            <ul className="space-y-0.5 text-sm">
              {preview.moves.map((m) => <li key={m.id}>{names[m.id] ?? "—"}: {m.from} → <span className="font-semibold">{m.to}</span></li>)}
            </ul>
          ) : <p className="text-sm">The ladder already matches the final standings.</p>)}
          {preview?.skipped.length ? <p className="text-xs text-muted-foreground">Not on the active club ladder, so not placed: {preview.skipped.map((id) => names[id] ?? "—").join(", ")}.</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button disabled={busy || !preview?.moves.length} onClick={apply}>Apply {preview?.moves.length ?? 0} move{preview?.moves.length === 1 ? "" : "s"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
