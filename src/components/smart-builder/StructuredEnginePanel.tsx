import { allocateAllFixedStages } from "@/lib/tournaments/formal-stage-schedule";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commitStructured, supabaseDb } from "@/lib/tournaments/structured-db";
import { StructuredEditorDialog } from "./StructuredEditorDialog";
import { StageProgressPanel } from "./StageProgressPanel";
import { schedulePlannedPlayoffGames } from "@/lib/smart-builder/playoff-schedule";
import { assertNotDiamondTournament } from "@/lib/tournaments/diamond-guard";
import {
  atomically, startNextStructuredStage, toFixtureRow, confirmStructuredPlayoffs, generateStructuredTournament, rebuildStructured, withdrawStructured, insertFixtures, loadEntrants, nextKnockoutRound, persistStructure, previewStructuredPlayoffs,
} from "@/lib/tournaments/structured-persist";
import { progressionOf, type PlannedStage } from "@/lib/tournaments/contract";
import { buildReplacementStage, replaceUnplayedStage } from "@/lib/tournaments/replace-stage";
import { stageTable } from "@/lib/tournaments/engine-service";
import { pairingLabel, slotLabel } from "@/lib/tournaments/transition";
import { generateNextSwissRound } from "@/lib/tournaments/swiss-generate";
import { swissRoundGate } from "@/lib/tournaments/swiss-round-gate";
import { swissTable } from "@/lib/tournaments/swiss-standings";
import { nextSwissRound, type PlayoffPreview, type TournamentSpec } from "@/lib/tournaments/engine-service";

/** Operate panel for structured (Beta) tournaments. All actions go through the structured engine. */
export function StructuredEnginePanel({ champId, spec, matches, nameOf, collapsibleStageProgress = false }: {
  champId: string; spec: TournamentSpec; matches: any[]; nameOf: (id: string | null) => string; collapsibleStageProgress?: boolean;
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
    try { await assertNotDiamondTournament(champId); await fn(); toast.success(ok); refresh(); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };
  const [pairing, setPairing] = useState<{ div: string; stage: string; players: string[]; pairs: string[][]; pick: string | null } | null>(null);
  const [regen, setRegen] = useState<{ div: string; stage: PlannedStage; players: number; prevDone: boolean; games: number; choice: "knockout" | "pools"; qualifiers: number; pools: number } | null>(null);
  const startStage = (div: string, stage: string, pairs?: string[][]) => run(`st${stage}`, () =>
    atomically(supabaseDb, champId, commitStructured, (db) => startNextStructuredStage(db, champId, div, stage, { ownerConfirmed: true, pairs })).then(() => schedulePlannedPlayoffGames(champId)), "Next stage created");
  const unitName = (u: string | null) => (u ? u.split("+").map(nameOf).join(" & ") : "TBD");

  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /><span className="font-semibold">Structured tournament</span></div>
      {matches.length > 0 && <StageProgressPanel champId={champId} spec={spec} matches={matches} nameOf={nameOf} collapsible={collapsibleStageProgress} />}
      {matches.length === 0 && (
        <Button size="sm" disabled={!!busy} onClick={() => run("gen", () => atomically(supabaseDb, champId, commitStructured, (db) => generateStructuredTournament(db, champId)).then(async (r) => { await allocateAllFixedStages(champId); return r; }), "Games generated")}>
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
      {matches.length > 0 && spec.divisions.map((d, di) => d.stages.filter((s) => s.kind === "swiss").map((s) => {
        // One rule (swissRoundGate) for the button, the engine and the DB trigger: Round N+1 only after
        // every real Round N fixture is final; never skip, never exceed the configured rounds.
        const mineRows = matches.filter((m) => m.group_number === di + 1 && m.stage_key === s.id).map((m) => toFixtureRow(d.divisionId, m, "swiss"));
        const gate = swissRoundGate(mineRows, s.swissRounds);
        const nextN = gate.state === "ready" ? gate.nextRound : gate.state === "in_progress" ? gate.round + 1 : null;
        return (
          <div key={`sw-${d.divisionId}/${s.id}`} className="flex flex-col gap-1 rounded-md border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{d.label} · {s.name}</span>
              {gate.state === "finished"
                ? <span className="font-medium">Final standings — all {s.swissRounds} rounds complete</span>
                : nextN && (
                  <Button size="sm" variant="outline" disabled={!!busy || gate.state !== "ready"} onClick={() => {
                    if (gate.state !== "ready") return;
                    if (!confirm(`Generate Round ${gate.nextRound} for ${d.label}? Pairings use the latest results, Swiss score groups and tie-breaks, and avoid repeat opponents.`)) return;
                    run(`sw${s.id}`, () => generateNextSwissRound(champId, spec, di, s.id, matches), `Round ${gate.nextRound} generated — send it to players from Manage Tournament → Swiss rounds`);
                  }}>Generate Round {nextN}</Button>
                )}
            </div>
            <span className="text-xs text-muted-foreground">{gate.message}</span>
            {gate.state === "finished" && (() => {
              // Final Swiss ranking: same table the next stage is seeded from (wins, then Buchholz, then seed).
              // Player list comes from the games themselves (the panel's spec carries no entrants).
              const seedOrder = [...new Set(mineRows.flatMap((r) => [r.a, r.b]).filter(Boolean))] as string[];
              const table = swissTable(
                seedOrder,
                mineRows.map((r) => ({ a: r.a, b: r.b, winner: r.winner, round: r.round })),
              );
              return (
                <table className="mt-1 w-full text-xs" data-testid="swiss-final-standings">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-0.5 pr-2">#</th><th className="pr-2">Player</th><th className="pr-2">Won</th><th className="pr-2">Lost</th><th className="pr-2">Buchholz</th></tr></thead>
                  <tbody>
                    {table.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-0.5 pr-2 font-medium">{r.position}</td>
                        <td className="pr-2">{nameOf(r.id)}</td>
                        <td className="pr-2">{r.wins}</td>
                        <td className="pr-2">{r.losses}</td>
                        <td className="pr-2">{r.buchholz}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        );
      }))}
      {spec.divisions.map((d) => d.stages.filter((s) => s.order > 0).map((s) => {
        // Stage keys repeat across draws: a stage "exists" only when THIS draw's stage row has games.
        const gi0 = spec.divisions.indexOf(d) + 1;
        const exists = matches.some((m) => m.stage_key === s.id && m.group_number === gi0);
        const koRows = matches.filter((m) => m.stage_key === s.id && m.group_number === spec.divisions.indexOf(d) + 1);
        // Only actions the progression panel above can't do: manual doubles pairing, qualifier
        // preview, and a further knockout round inside the same stage. Status lives in the panel.
        const prevSt0 = d.stages.find((x) => x.order === s.order - 1);
        const src0 = matches.filter((m) => m.stage_key === prevSt0?.id && m.group_number === gi0);
        const srcDone0 = src0.length > 0 && src0.every((m) => m.winner_member_id || ["completed", "walkover", "bye"].includes(String(m.status ?? "").toLowerCase()));
        const pr0 = progressionOf(s);
        const lastRound = koRows.length ? Math.max(...koRows.map((m) => m.round_number ?? 1)) : 0;
        const lastRows = koRows.filter((m) => (m.round_number ?? 1) === lastRound && m.stage_label !== "3rd place");
        const needsNextKo = exists && s.kind === "knockout" && lastRows.length > 1 && lastRows.every((m) => m.winner_member_id);
        const needsStart = !exists && srcDone0 && (pr0.pairing === "manual" || pr0.mode === "qualifiers");
        if (!needsNextKo && !needsStart) return null;
        return (
          <div key={`${d.divisionId}/${s.id}`} className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{d.label} · {s.name}</span>
            {needsStart && progressionOf(s).mode !== "qualifiers" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => {
                const pr = progressionOf(s);
                if (pr.pairing === "manual") {
                  const prevSt = d.stages.find((x) => x.order === s.order - 1);
                  const prevId = prevSt?.id;
                  let players = [...new Set(matches.filter((m) => m.stage_key === prevId).flatMap((m) => [m.player_a_member_id, m.player_b_member_id]).filter(Boolean))] as string[];
                  if (pr.mode === "top_n" && pr.top && prevSt) {
                    const rows = matches.filter((m) => m.stage_key === prevId).map((m) => toFixtureRow(d.divisionId, m, prevSt.kind));
                    players = stageTable(prevSt.id, rows, d.entrants.map((e) => e.id)).map((x) => x.id).slice(0, pr.top);
                  }
                  setPairing({ div: d.divisionId, stage: s.id, players, pairs: [], pick: null });
                  return;
                }
                if (!confirm(`Start ${s.name}? Games are created from the finished previous stage.`)) return;
                startStage(d.divisionId, s.id);
              }}>Start {s.name}</Button>
            )}
            {needsStart && progressionOf(s).mode === "qualifiers" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`pv${s.id}`, async () => {
                const p = await previewStructuredPlayoffs(supabaseDb, champId, d.divisionId, s.id);
                setPreview({ div: d.divisionId, stage: s.id, p, labels: d.poolLabels });
              }, "Preview ready")}><Trophy className="w-4 h-4 mr-1" />Preview play-offs</Button>
            )}
            {needsNextKo && (
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
      {matches.length > 0 && spec.divisions.map((d, di) => {
        // Regenerate the LAST later stage while none of its games are played (server re-checks everything).
        const last = [...d.stages].sort((a, b) => b.order - a.order)[0];
        if (!last || last.order === 0) return null;
        const gi = di + 1;
        const mine = matches.filter((m) => m.group_number === gi && m.stage_key === last.id);
        const played = mine.some((m) => m.winner_member_id || ["completed", "confirmed", "in_progress", "walkover", "forfeit"].includes(String(m.status ?? "").toLowerCase()));
        if (played) return null;
        const prev = d.stages.find((x) => x.order === last.order - 1);
        const prevRows = matches.filter((m) => m.group_number === gi && m.stage_key === prev?.id);
        const players = new Set(prevRows.flatMap((m) => [m.player_a_member_id, m.player_b_member_id]).filter(Boolean)).size;
        const prevDone = prevRows.length > 0 && prevRows.every((m) => m.winner_member_id || ["completed", "walkover", "bye"].includes(String(m.status ?? "").toLowerCase()));
        return (
          <div key={`rs-${d.divisionId}`} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2" data-testid="regenerate-stage">
            <span className="text-muted-foreground">{d.label} · {last.name}{mine.length ? ` · ${mine.length} unplayed game(s)` : ""}</span>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setRegen({ div: d.divisionId, stage: last, players, prevDone, games: mine.length, choice: last.kind === "knockout" ? "pools" : "knockout", qualifiers: players >= 8 ? 8 : 4, pools: 2 })}>
              Regenerate {last.order === 1 ? "Stage 2" : "this stage"}
            </Button>
          </div>
        );
      })}
      <Dialog open={!!regen} onOpenChange={(o) => !o && setRegen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Regenerate {regen?.stage.name}</DialogTitle></DialogHeader>
          {regen && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {regen.games ? `The ${regen.games} unplayed game(s) of this stage will be removed. ` : ""}Earlier stages and all results stay exactly as they are. Nothing is sent to players.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant={regen.choice === "knockout" ? "default" : "outline"} onClick={() => setRegen({ ...regen, choice: "knockout" })}>Knockout play-offs</Button>
                <Button size="sm" variant={regen.choice === "pools" ? "default" : "outline"} onClick={() => setRegen({ ...regen, choice: "pools" })}>Round robin</Button>
              </div>
              {regen.choice === "knockout" ? (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">How many qualify from the final standings?</div>
                  <div className="flex gap-2">
                    {[2, 4, 8, 16].filter((q) => q <= regen.players).map((q) => (
                      <Button key={q} size="sm" variant={regen.qualifiers === q ? "default" : "outline"} onClick={() => setRegen({ ...regen, qualifiers: q })}>
                        {q === 2 ? "Top 2 · Final" : q === 4 ? "Top 4 · Semis" : q === 8 ? "Top 8 · Quarters" : "Top 16"}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">Seeded from the final standings: 1 v {regen.qualifiers}, 2 v {regen.qualifiers - 1} … winners go through to the next round.</div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Number of pools</div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].filter((p) => p * 2 <= regen.players).map((p) => (
                      <Button key={p} size="sm" variant={regen.pools === p ? "default" : "outline"} onClick={() => setRegen({ ...regen, pools: p })}>{p}</Button>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{regen.prevDone ? "The previous stage is finished, so the new games are created straight away." : "The new games are created once the previous stage is finished."}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegen(null)}>Cancel</Button>
            <Button disabled={!!busy || !regen} onClick={() => {
              const r = regen!; setRegen(null);
              run("regen", async () => {
                const next = buildReplacementStage(r.stage, r.choice === "knockout" ? { kind: "knockout", qualifiers: r.qualifiers } : { kind: "pools", pools: r.pools }, r.players);
                const res = await replaceUnplayedStage(champId, r.div, next);
                if (r.prevDone) {
                  await atomically(supabaseDb, champId, commitStructured, (db) => startNextStructuredStage(db, champId, r.div, next.id, { ownerConfirmed: true }));
                  await schedulePlannedPlayoffGames(champId);
                }
                toast.message(`Removed ${res.removed_games} unplayed game(s).`);
              }, r.prevDone ? "Stage regenerated" : "Stage changed");
            }}>Regenerate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              await atomically(supabaseDb, champId, commitStructured, (db) => confirmStructuredPlayoffs(db, champId, preview.div, preview.stage, true)); await schedulePlannedPlayoffGames(champId); setPreview(null);
            }, "Play-offs created")}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
