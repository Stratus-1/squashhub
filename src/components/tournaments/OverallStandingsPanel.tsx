import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { ladderAfterStandings, type OverallRow } from "@/lib/tournaments/overall-standings";

const isLadies = (g?: string | null) => ["female", "ladies", "f"].includes(String(g ?? "").toLowerCase());

/** Final 1-to-last order for one category, with an organiser-confirmed "Apply to club ladder". */
export function OverallStandingsPanel({ title, rows, complete, names, clubId, canManage }: { title: string; rows: OverallRow[]; complete: boolean; names: Record<string, string>; clubId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<null | { gender: "male" | "female"; next: string[]; moves: Array<{ id: string; from: number; to: number }>; notOnLadder: string[] }>(null);
  const [busy, setBusy] = useState(false);
  if (!rows.length) return null;

  const openPreview = async () => {
    setBusy(true);
    try {
      const ids = rows.map((r) => r.id);
      const { data: mine } = await fromExt("club_members").select("id, gender").eq("club_id", clubId).in("id", ids);
      const ladies = ((mine ?? []) as any[]).filter((m) => isLadies(m.gender)).length;
      const gender: "male" | "female" = ladies * 2 > (mine ?? []).length ? "female" : "male";
      const { data: all } = await fromExt("club_members").select("id, gender, ladder_position").eq("club_id", clubId).not("ladder_position", "is", null).order("ladder_position");
      const ladder = ((all ?? []) as any[]).filter((m) => (gender === "female") === isLadies(m.gender)).map((m) => m.id as string);
      const next = ladderAfterStandings(ladder, ids);
      const moves = next.map((id, i) => ({ id, from: ladder.indexOf(id) + 1, to: i + 1 })).filter((m) => m.from !== m.to);
      setPreview({ gender, next, moves, notOnLadder: ids.filter((id) => !ladder.includes(id)) });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load the ladder");
    } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    const { error } = await rpcExt("admin_reorder_ladder", { player_ids: preview.next, gender_filter: preview.gender });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Club ladder updated from the final standings");
    qc.invalidateQueries({ queryKey: ["ladder"] });
    qc.invalidateQueries({ queryKey: ["club-members"] });
    setPreview(null);
  };

  return (
    <div className="mt-6 rounded-md border border-border p-3" data-testid="overall-standings">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title} · Final standings</div>
        {canManage && <Button size="sm" variant="outline" disabled={!complete || busy} onClick={openPreview}>Apply to club ladder…</Button>}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {complete ? "Play-off places first, then everyone else by their rounds finish. Players who lost in the same round are split by the better seed." : "Provisional — play-off games are still to be played."}
      </p>
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
            <DialogTitle>Apply final standings to the {preview?.gender === "female" ? "ladies'" : "men's"} ladder?</DialogTitle>
            <DialogDescription>These players swap among the ladder places they already hold, in finishing order. Nobody else moves.</DialogDescription>
          </DialogHeader>
          {preview && (preview.moves.length ? (
            <ul className="space-y-0.5 text-sm">
              {preview.moves.map((m) => <li key={m.id}>{names[m.id] ?? "—"}: {m.from} → <span className="font-semibold">{m.to}</span></li>)}
            </ul>
          ) : <p className="text-sm">The ladder already matches the final standings.</p>)}
          {preview?.notOnLadder.length ? <p className="text-xs text-muted-foreground">Not on the ladder, so not placed: {preview.notOnLadder.map((id) => names[id] ?? "—").join(", ")}.</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button disabled={busy || !preview?.moves.length} onClick={apply}>Apply {preview?.moves.length ?? 0} move{preview?.moves.length === 1 ? "" : "s"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
