import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { effectiveTournamentSettings, applyPlayoffSettings } from "@/lib/tournaments/effective-settings";
import { savedCorrectionGames, validateCorrectionGames } from "@/lib/tournaments/result-correction";
import type { GameScore } from "@/lib/tournaments/quick-result";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type CorrectionMatch = { id: string; champ_id: string; group_number?: number | null; stage?: string | null; updated_at: string; game_scores?: unknown; score?: string | null };
type Preview = { old_score: string; new_score: string; old_winner: string; new_winner: string; blockers: string[] };
export function CorrectResultDialog({ open, onOpenChange, match, playerAName, playerBName, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; match: CorrectionMatch | null;
  playerAName: string; playerBName: string; onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [games, setGames] = useState<GameScore[]>([]);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: ruleData, isLoading, isError } = useQuery({
    queryKey: ["correction-scoring", match?.champ_id], enabled: open && !!match,
    queryFn: async () => {
      if (!match) throw new Error("No match selected");
      const [{ data: tournament, error: tournamentError }, { data: base, error: rulesError }] = await Promise.all([
        fromExt("tournaments").select("id,league_scoring_modes,league_points_per_game,league_best_of,league_win_conditions,league_play_all_games,league_playoff_points_per_game,league_playoff_match_formats").eq("id", match.champ_id).single(),
        fromExt("tournament_rules").select("scoring_mode,points_per_game,best_of,play_all_games,win_condition").eq("tournament_id", match.champ_id).maybeSingle(),
      ]);
      if (tournamentError) throw tournamentError;
      if (rulesError) throw rulesError;
      return { ...base, ...tournament };
    },
  });
  useEffect(() => {
    if (!open || !match) return;
    setGames(savedCorrectionGames(match)); setReason(""); setPreview(null); setError("");
  }, [open, match?.id]);
  const baseRules = effectiveTournamentSettings(ruleData, match?.group_number);
  const rules = match?.stage?.startsWith("playoff") ? applyPlayoffSettings(baseRules, ruleData, match.group_number) : baseRules;
  const validation = validateCorrectionGames(games, rules);
  const changeGames = (next: GameScore[]) => { setGames(next); setPreview(null); setError(""); };
  async function reviewOrSave(save: boolean) {
    if (!match || busy) return;
    setBusy(true); setError("");
    try {
      const { data, error: failure } = await rpcExt("correct_tournament_result", {
        p_match_id: match.id, p_games: games, p_expected_updated_at: match.updated_at, p_preview: !save, p_reason: reason,
      });
      if (failure) throw failure;
      if (!save) { setPreview(data as Preview); return; }
      for (const key of ["tournaments-all-matches", "club-champ-matches", "matches", "my-champ-matches", "my-champ-matches-dashboard", "club-champs-all-entries"]) void qc.invalidateQueries({ queryKey: [key] });
      toast.success("Result corrected"); onSaved?.(); onOpenChange(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : (failure as { message?: string })?.message ?? "Could not correct this result."); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Edit result</DialogTitle>
        <DialogDescription className="break-words">{playerAName} v {playerBName} · {rules.playAllGames ? "Play all" : "Best of"} {rules.bestOf} · PAR {rules.pointsPerGame}</DialogDescription>
      </DialogHeader>
      {isLoading ? <p role="status">Loading match format…</p> : isError ? <p role="alert" className="text-sm text-destructive">Could not load the saved match format. Close and try again.</p> : <>
        <div className="grid grid-cols-[3rem_1fr_1fr_2rem] gap-2 text-xs text-muted-foreground"><span /><span className="break-words">{playerAName}</span><span className="break-words">{playerBName}</span><span /></div>
        <div className="space-y-2">{games.map((game, i) => <div key={i} className="grid grid-cols-[3rem_1fr_1fr_2rem] items-center gap-2">
          <span className="text-xs">Game {i + 1}</span>
          {(["a", "b"] as const).map(side => <Input key={side} type="number" min={0} inputMode="numeric" disabled={busy} className="min-w-0 h-10 text-center" aria-label={`Game ${i + 1} ${side === "a" ? playerAName : playerBName}`} value={game[side]} onFocus={event => event.target.select()} onChange={event => changeGames(games.map((g, n) => n === i ? { ...g, [side]: Number(event.target.value) } : g))} />)}
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy} aria-label={`Remove game ${i + 1}`} title={`Remove game ${i + 1}`} onClick={() => changeGames(games.filter((_, n) => n !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>)}</div>
        <Button variant="outline" size="sm" className="gap-1" disabled={busy || games.length >= rules.bestOf} onClick={() => changeGames([...games, { a: rules.pointsPerGame, b: 0 }])}><Plus className="h-3.5 w-3.5" />Add game</Button>
        {validation && <p className="text-xs text-destructive">{validation}</p>}
        <div className="space-y-1"><Label htmlFor="correction-reason">Reason for correction</Label><Input id="correction-reason" maxLength={500} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></div>
        {preview && <div className="space-y-2 border-t border-border pt-3 text-sm">
          <p>Previous: <strong>{preview.old_score}</strong></p><p>Corrected: <strong>{preview.new_score}</strong></p>
          <p>Winner: {preview.new_winner}</p>
          {preview.blockers?.map((blocker, i) => <p key={i} role="alert" className="text-destructive">{blocker.replace("by the assistant", "here")}</p>)}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !!validation || !reason.trim() || !!preview?.blockers?.length} onClick={() => reviewOrSave(!!preview)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{preview ? "Save correction" : "Review correction"}</Button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}