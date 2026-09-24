import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabaseDb } from "@/lib/tournaments/structured-db";
import {
  confirmStructuredPlayoffs, generateStructuredTournament, insertFixtures, loadEntrants, nextKnockoutRound, persistStructure, previewStructuredPlayoffs,
} from "@/lib/tournaments/structured-persist";
import type { PlayoffPreview, TournamentSpec } from "@/lib/tournaments/engine-service";

/** Operate panel for structured (Beta) tournaments. All actions go through the structured engine. */
export function StructuredEnginePanel({ champId, spec, matches, nameOf }: {
  champId: string; spec: TournamentSpec; matches: any[]; nameOf: (id: string | null) => string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ div: string; stage: string; p: PlayoffPreview } | null>(null);
  const { data: stages = [] } = useQuery({
    queryKey: ["structured-stages", champId, matches.length],
    queryFn: () => supabaseDb.select("tournament_stages", { tournament_id: champId }),
  });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(champId) });
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); refresh(); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const unitName = (u: string | null) => (u ? u.split("+").map(nameOf).join(" & ") : "TBD");

  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /><span className="font-semibold">Structured tournament</span><Badge variant="outline">BETA engine</Badge></div>
      {matches.length === 0 && (
        <Button size="sm" disabled={!!busy} onClick={() => run("gen", () => generateStructuredTournament(supabaseDb, champId), "Games generated")}>
          {busy === "gen" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Generate games
        </Button>
      )}
      {spec.divisions.map((d) => d.stages.filter((s) => s.order > 0).map((s) => {
        const exists = stages.some((x: any) => x.spec_key === s.id && matches.some((m) => m.stage_id === x.id));
        const koRows = matches.filter((m) => m.stage_key === s.id && m.group_number === spec.divisions.indexOf(d) + 1);
        return (
          <div key={`${d.divisionId}/${s.id}`} className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{d.label} · {s.name}</span>
            {!exists && matches.length > 0 && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`pv${s.id}`, async () => {
                const p = await previewStructuredPlayoffs(supabaseDb, champId, d.divisionId, s.id);
                if (!p.ok) throw new Error(p.reason || "Not ready");
                setPreview({ div: d.divisionId, stage: s.id, p });
              }, "Preview ready")}><Trophy className="w-4 h-4 mr-1" />Preview play-offs</Button>
            )}
            {exists && s.kind === "knockout" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`nx${s.id}`, async () => {
                const full = await loadEntrants(supabaseDb, champId, spec);
                const rows = koRows.map((m) => ({ id: m.id, divisionId: d.divisionId, stageId: s.id, stageKind: "knockout" as const, round: m.round_number,
                  a: m.partner_a_member_id ? `${m.player_a_member_id}+${m.partner_a_member_id}` : m.player_a_member_id,
                  b: m.partner_b_member_id ? `${m.player_b_member_id}+${m.partner_b_member_id}` : m.player_b_member_id,
                  winner: !m.winner_member_id ? null : [m.player_a_member_id, m.partner_a_member_id].includes(m.winner_member_id)
                    ? (m.partner_a_member_id ? `${m.player_a_member_id}+${m.partner_a_member_id}` : m.player_a_member_id)
                    : (m.partner_b_member_id ? `${m.player_b_member_id}+${m.partner_b_member_id}` : m.player_b_member_id),
                  slot: m.bracket_position }));
                const next = nextKnockoutRound(champId, d.divisionId, s.id, rows);
                const ids = await persistStructure(supabaseDb, champId, full);
                await insertFixtures(supabaseDb, champId, full, ids, next, rows);
              }, "Next round created")}>Next knockout round</Button>
            )}
          </div>
        );
      }))}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm play-offs</DialogTitle></DialogHeader>
          <ul className="text-sm space-y-1">
            {preview?.p.qualifiers.map((q) => <li key={q.slot}>Match {q.slot}: {unitName(q.a)} vs {unitName(q.b)}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">These games are created in the knockout stage, not in any pool. Nothing is sent to players.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button disabled={!!busy} onClick={() => preview && run("cf", async () => {
              await confirmStructuredPlayoffs(supabaseDb, champId, preview.div, preview.stage, true); setPreview(null);
            }, "Play-offs created")}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
