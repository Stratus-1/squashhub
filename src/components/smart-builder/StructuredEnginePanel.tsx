import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { StructuredEditorDialog } from "./StructuredEditorDialog";
import {
  atomically, startNextStructuredStage, toFixtureRow, confirmStructuredPlayoffs, generateStructuredTournament, rebuildStructured, withdrawStructured, insertFixtures, loadEntrants, nextKnockoutRound, persistStructure, previewStructuredPlayoffs,
} from "@/lib/tournaments/structured-persist";
import { progressionOf } from "@/lib/tournaments/contract";
import { pairingLabel, slotLabel } from "@/lib/tournaments/transition";
import { nextSwissRound, type PlayoffPreview, type TournamentSpec } from "@/lib/tournaments/engine-service";

/** Operate panel for structured (Beta) tournaments. All actions go through the structured engine. */
export function StructuredEnginePanel({ champId, spec, matches, nameOf }: {
  champId: string; spec: TournamentSpec; matches: any[]; nameOf: (id: string | null) => string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ div: string; stage: string; p: PlayoffPreview; labels?: string[] } | null>(null);
  const { data: stages = [] } = useQuery({
    queryKey: ["structured-stages", champId, matches.length],
    queryFn: () => supabaseDb.select("tournament_stages", { tournament_id: champId }),
  });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(champId) });
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); refresh(); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const [pairing, setPairing] = useState<{ div: string; stage: string; players: string[]; pairs: string[][]; pick: string | null } | null>(null);
  const startStage = (div: string, stage: string, pairs?: string[][]) => run(`st${stage}`, () =>
    atomically(supabaseDb, champId, commitStructured, (db) => startNextStructuredStage(db, champId, div, stage, { ownerConfirmed: true, pairs })), "Next stage created");
  const unitName = (u: string | null) => (u ? u.split("+").map(nameOf).join(" & ") : "TBD");

  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /><span className="font-semibold">Structured tournament</span><Badge variant="outline">BETA engine</Badge></div>
      {matches.length === 0 && (
        <Button size="sm" disabled={!!busy} onClick={() => run("gen", () => atomically(supabaseDb, champId, commitStructured, (db) => generateStructuredTournament(db, champId)), "Games generated")}>
          {busy === "gen" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Generate games
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <StructuredEditorDialog champId={champId} spec={spec} matches={matches} onSaved={refresh} />
        {matches.length > 0 && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => {
            if (!confirm("Rebuild unplayed games from the current entries? Played games and results are kept.")) return;
            run("rb", async () => {
              const r = await atomically(supabaseDb, champId, commitStructured, (db) => rebuildStructured(db, champId));
              toast.message(`Kept ${r.keptPlayed} played game(s); removed ${r.removedFuture} unplayed; created ${r.created}.`);
            }, "Rebuild saved");
          }}>Rebuild unplayed games</Button>
        )}
        {matches.length > 0 && (
          <select className="h-8 rounded-md border bg-background px-2 text-xs" value="" disabled={!!busy} onChange={(e) => {
            const id = e.target.value; if (!id) return;
            if (!confirm(`Withdraw ${nameOf(id)}? Their played results stay; only their unplayed games are removed.`)) return;
            run("wd", () => atomically(supabaseDb, champId, commitStructured, (db) => withdrawStructured(db, champId, id)), "Player withdrawn");
          }}>
            <option value="">Withdraw a player…</option>
            {[...new Set(matches.flatMap((m) => [m.player_a_member_id, m.player_b_member_id]).filter(Boolean))].map((id: string) => <option key={id} value={id}>{nameOf(id)}</option>)}
          </select>
        )}
      </div>
      {matches.length > 0 && spec.divisions.map((d, di) => d.stages.filter((s) => s.kind === "swiss").map((s) => (
        <div key={`sw-${d.divisionId}/${s.id}`} className="flex items-center gap-2">
          <span className="text-muted-foreground">{d.label} · {s.name}</span>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`sw${s.id}`, () => atomically(supabaseDb, champId, commitStructured, async (db) => {
            const full = await loadEntrants(db, champId, spec);
            const div = full.divisions[di];
            const rows = matches.filter((m) => m.group_number === di + 1).map((m) => toFixtureRow(d.divisionId, m, d.stages.find((x) => x.id === m.stage_key)?.kind ?? "swiss"));
            const next = nextSwissRound(champId, div, s.id, rows);
            await insertFixtures(db, champId, full, await persistStructure(db, champId, full), next, rows);
          }), "Next Swiss round created")}>Next Swiss round</Button>
        </div>
      )))}
      {spec.divisions.map((d) => d.stages.filter((s) => s.order > 0).map((s) => {
        const exists = stages.some((x: any) => x.spec_key === s.id && matches.some((m) => m.stage_id === x.id));
        const koRows = matches.filter((m) => m.stage_key === s.id && m.group_number === spec.divisions.indexOf(d) + 1);
        return (
          <div key={`${d.divisionId}/${s.id}`} className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{d.label} · {s.name}</span>
            {!exists && matches.length > 0 && progressionOf(s).mode !== "qualifiers" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => {
                const pr = progressionOf(s);
                if (pr.mode === "form_pairs" && pr.pairing === "manual") {
                  const prevId = d.stages.find((x) => x.order === s.order - 1)?.id;
                  const players = [...new Set(matches.filter((m) => m.stage_key === prevId).flatMap((m) => [m.player_a_member_id, m.player_b_member_id]).filter(Boolean))] as string[];
                  setPairing({ div: d.divisionId, stage: s.id, players, pairs: [], pick: null });
                  return;
                }
                if (!confirm(`Start ${s.name}? Games are created from the finished previous stage.`)) return;
                startStage(d.divisionId, s.id);
              }}>Start {s.name}</Button>
            )}
            {!exists && matches.length > 0 && progressionOf(s).mode === "qualifiers" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`pv${s.id}`, async () => {
                const p = await previewStructuredPlayoffs(supabaseDb, champId, d.divisionId, s.id);
                setPreview({ div: d.divisionId, stage: s.id, p, labels: d.poolLabels });
              }, "Preview ready")}><Trophy className="w-4 h-4 mr-1" />Preview play-offs</Button>
            )}
            {exists && s.kind === "knockout" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`nx${s.id}`, async () => {
                await atomically(supabaseDb, champId, commitStructured, async (db) => {
                const full = await loadEntrants(db, champId, spec);
                const rows = koRows.map((m) => ({ id: m.id, divisionId: d.divisionId, stageId: s.id, stageKind: "knockout" as const, round: m.round_number,
                  a: m.partner_a_member_id ? `${m.player_a_member_id}+${m.partner_a_member_id}` : m.player_a_member_id,
                  b: m.partner_b_member_id ? `${m.player_b_member_id}+${m.partner_b_member_id}` : m.player_b_member_id,
                  winner: !m.winner_member_id ? null : [m.player_a_member_id, m.partner_a_member_id].includes(m.winner_member_id)
                    ? (m.partner_a_member_id ? `${m.player_a_member_id}+${m.partner_a_member_id}` : m.player_a_member_id)
                    : (m.partner_b_member_id ? `${m.player_b_member_id}+${m.partner_b_member_id}` : m.player_b_member_id),
                  slot: m.bracket_position, thirdPlace: m.stage_label === "3rd place" || undefined }));
                const next = nextKnockoutRound(champId, d.divisionId, s.id, rows, { thirdPlace: !!s.thirdPlace });
                const ids = await persistStructure(db, champId, full);
                await insertFixtures(db, champId, full, ids, next, rows);
                });
              }, "Next round created")}>Next knockout round</Button>
            )}
          </div>
        );
      }))}
      <Dialog open={!!pairing} onOpenChange={(o) => !o && setPairing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set the doubles pairs</DialogTitle></DialogHeader>
          {pairing && (() => {
            const used = new Set(pairing.pairs.flat());
            return (
              <div className="space-y-2 text-sm">
                <div className="text-muted-foreground">Tap two players to pair them. Every player must be in one pair.</div>
                <div className="flex flex-wrap gap-1">
                  {pairing.players.filter((p) => !used.has(p)).map((p) => (
                    <Button key={p} size="sm" variant={pairing.pick === p ? "default" : "outline"} onClick={() => setPairing((x) => !x ? x
                      : !x.pick ? { ...x, pick: p } : x.pick === p ? { ...x, pick: null } : { ...x, pairs: [...x.pairs, [x.pick, p]], pick: null })}>{nameOf(p)}</Button>
                  ))}
                </div>
                {pairing.pairs.map((pr, i) => (
                  <div key={i} className="flex items-center gap-2">{nameOf(pr[0])} &amp; {nameOf(pr[1])}
                    <Button size="sm" variant="ghost" onClick={() => setPairing((x) => x && { ...x, pairs: x.pairs.filter((_, k) => k !== i) })}>Undo</Button></div>
                ))}
              </div>
            );
          })()}
          <DialogFooter>
            <Button disabled={!pairing || pairing.pairs.flat().length !== pairing.players.length || !!busy}
              onClick={() => { const p = pairing!; setPairing(null); startStage(p.div, p.stage, p.pairs); }}>Create doubles games</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{preview?.p.resolved ? "Confirm play-offs" : "Play-off mapping"}</DialogTitle></DialogHeader>
          {preview && (
            <p className="text-xs text-muted-foreground">
              {preview.p.transition?.method === "cross_pool"
                ? `Cross-pool: ${pairingLabel(preview.p.transition.poolPairs ?? [], preview.labels)}, ${preview.p.transition.pairing === "same_position" ? "same position vs same position" : "winner vs runner-up"}.`
                : preview.p.transition?.method === "manual" ? "Mapping set by you, place by place."
                  : "All qualifiers reseeded into one field."}
            </p>
          )}
          <ul className="text-sm space-y-1">
            {preview?.p.qualifiers.map((q) => (
              <li key={q.slot}>
                Match {q.slot}: {slotLabel(q.aSlot, preview.labels)} vs {slotLabel(q.bSlot, preview.labels)}
                {(q.a || q.b) && <span className="text-muted-foreground"> — {unitName(q.a)} vs {unitName(q.b)}</span>}
              </li>
            ))}
          </ul>
          {preview && !preview.p.ok && <p className="text-xs text-destructive">{preview.p.reason}</p>}
          <p className="text-xs text-muted-foreground">These games are created in the knockout stage, not in any pool. Nothing is sent to players.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button disabled={!!busy || !preview?.p.ok} onClick={() => preview && run("cf", async () => {
              await atomically(supabaseDb, champId, commitStructured, (db) => confirmStructuredPlayoffs(db, champId, preview.div, preview.stage, true)); setPreview(null);
            }, "Play-offs created")}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
