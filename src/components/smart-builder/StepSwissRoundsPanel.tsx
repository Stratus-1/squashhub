import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, Clock, Loader2, Shuffle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { toFixtureRow } from "@/lib/tournaments/structured-persist";
import type { TournamentSpec } from "@/lib/tournaments/engine-service";
import { swissDivisionProgress, type SwissDivisionProgress } from "@/lib/tournaments/swiss-progress";
import { generateNextSwissRound } from "@/lib/tournaments/swiss-generate";
import { applySetupSessions } from "@/lib/smart-builder/session-slots";

/**
 * Admin-guided Swiss progression in Manage Tournament, one card per division:
 * finish Round X → Set up Round X+1 (setup › Stages & scheduling) → Generate Round X+1 Draw (confirm).
 * A saved round schedule is detected so it never has to be set up twice.
 */
export function StepSwissRoundsPanel({ tournamentId, onSetupRound }: { tournamentId: string; onSetupRound: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<SwissDivisionProgress | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ["step-swiss-rounds", tournamentId],
    refetchInterval: 30000,
    queryFn: async () => {
      const [{ data: t }, { data: matches }] = await Promise.all([
        fromExt("tournaments").select("builder_spec, builder_architecture, beta_lifecycle").eq("id", tournamentId).maybeSingle(),
        fromExt("club_champs_matches").select("*").eq("champ_id", tournamentId),
      ]);
      const spec = (t as any)?.builder_architecture === "structured" ? ((t as any)?.builder_spec as TournamentSpec | null) : null;
      const bl = (t as any)?.beta_lifecycle ?? {};
      return { spec, matches: (matches ?? []) as any[], plan: (bl.answers?.stages ?? bl.format_plan?.stages ?? []) as any[] };
    },
  });
  if (!data?.spec || !data.matches.length) return null;
  const { spec, matches, plan } = data;
  const rows = swissDivisionProgress(spec.divisions as any, (di, sid) => {
    const d = spec.divisions[di];
    return matches.filter((m) => m.group_number === di + 1 && m.stage_key === sid).map((m) => toFixtureRow(d.divisionId, m, "swiss"));
  }, plan);
  if (!rows.length) return null;

  const generate = async (r: SwissDivisionProgress) => {
    if (r.gate.state !== "ready") return;
    setBusy(r.divisionId);
    try {
      // Re-read the latest results right before pairing (never pair from a stale screen).
      const fresh = (await fromExt("club_champs_matches").select("*").eq("champ_id", tournamentId)).data as any[] ?? [];
      await generateNextSwissRound(tournamentId, spec, r.divisionIndex, r.stageId, fresh);
      try {
        const rs = await applySetupSessions(supabase, tournamentId);
        const mine = rs.find((x) => x.round === (r.gate as any).nextRound);
        if (mine?.unplaced) toast.error(`${mine.unplaced} game(s) could not be given a court time in ${mine.name} — widen the times or add courts.`);
      } catch (e: any) { toast.error(`Games created but not placed on courts: ${e.message ?? e}`); }
      toast.success(`${r.label}: Round ${(r.gate as any).nextRound} draw generated. No messages were sent.`);
      await refetch();
      qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(tournamentId) });
    } catch (e: any) {
      toast.error(String(e.message ?? e));
      await refetch();
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/50 bg-primary/5 p-3 text-xs" data-testid="swiss-rounds-panel">
      <div className="text-sm font-semibold">Swiss rounds — next steps per category</div>
      <ul className="space-y-2">
        {rows.map((r) => {
          const next = r.gate.state === "ready" ? r.gate.nextRound : r.current.round + 1;
          return (
            <li key={`${r.divisionId}/${r.stageId}`} className="flex flex-col gap-1.5 rounded border border-border bg-background p-2" data-testid={`swiss-row-${r.divisionId}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.label}</span>
                <span className="text-muted-foreground">Round {Math.max(1, r.current.round)} of {r.swissRounds} · {r.current.done} of {r.current.total} matches final</span>
              </div>
              {r.action === "wait" && (
                <div className="flex items-start gap-1.5"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>{r.gate.message}{r.current.pending.length > 0 && r.current.pending.length <= 6 ? " Still open: " + r.current.pending.length + " match(es)." : ""}</span></div>
              )}
              {r.action === "final" && <div className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-3.5 w-3.5 text-primary" />Final standings — all {r.swissRounds} rounds complete</div>}
              {r.action === "setup_round" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>Round {r.current.round} is finished. Add Round {next}'s dates, times and courts first.</span>
                  <Button size="sm" onClick={onSetupRound}><CalendarPlus className="mr-1 h-4 w-4" />Set up Round {next}</Button>
                </div>
              )}
              {r.action === "generate" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>Round {r.current.round} is finished and Round {next} is scheduled ({r.schedule?.mode === "play_by" ? `play by ${r.schedule?.deadline}` : r.schedule?.date}).</span>
                  <Button size="sm" disabled={!!busy} onClick={() => setAsk(r)}>
                    {busy === r.divisionId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Shuffle className="mr-1 h-4 w-4" />}Generate Round {next} Draw
                  </Button>
                  <button type="button" className="text-primary underline" onClick={onSetupRound}>Change Round {next} schedule</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground">Each category moves on by itself. Only one round is ever created at a time; finished rounds and results are never changed. <Link className="text-primary underline" to={`/club-champs/${tournamentId}`}>Open draw & results</Link></p>
      <AlertDialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Round {ask?.gate.state === "ready" ? ask.gate.nextRound : ""} draw for {ask?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Players are paired by match wins and tie-breaks from the latest results, without repeat opponents, and games are placed into the saved round schedule. Nothing is sent to players.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const r = ask; setAsk(null); if (r) generate(r); }}>Generate draw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
