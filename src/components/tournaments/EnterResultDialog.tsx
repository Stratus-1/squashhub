import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rpcExt } from "@/lib/supabase-ext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ClipboardCheck } from "lucide-react";
import {
  buildQuickResultPayload,
  defaultGameScores,
  gamesToWin,
  possibleGameTallies,
  validateQuickResult,
  type GameScore,
  type Side,
} from "@/lib/tournaments/quick-result";
import type { SelfScheduleMatchLike } from "@/lib/tournaments/self-schedule";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId?: string | null;
  match: (SelfScheduleMatchLike & { id: string }) | null;
  playerAName: string;
  playerBName: string;
  /** Tournament best-of rule (defaults to best of 5). */
  bestOf?: number | null;
  /** Points per game used to pre-fill the quick scores. */
  pointsTarget?: number | null;
  onSaved?: () => void;
}

/**
 * Quick capture of an ALREADY PLAYED tournament match.
 *
 * Deliberately separate from the live marker: the players report the finished
 * games, but the result is written through the very same authoritative RPC
 * (`save_marker_match_result`) the marker uses, so winner, completed status,
 * stats and knockout progression are identical.
 */
export function EnterResultDialog({
  open,
  onOpenChange,
  clubId,
  match,
  playerAName,
  playerBName,
  bestOf,
  pointsTarget,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const bo = bestOf && bestOf > 0 ? bestOf : 5;
  const target = pointsTarget && pointsTarget > 0 ? pointsTarget : 11;
  const [winner, setWinner] = useState<Side>("a");
  const [games, setGames] = useState<GameScore[]>(() => defaultGameScores("a", gamesToWin(bo), 0, target));
  const [saving, setSaving] = useState(false);
  // Generated once per submission attempt so a retry can never duplicate the row.
  const resultIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setWinner("a");
      setGames(defaultGameScores("a", gamesToWin(bo), 0, target));
      resultIdRef.current = null;
    }
  }, [open, bo, target]);

  const tallies = useMemo(() => possibleGameTallies(bo), [bo]);
  const validation = useMemo(() => validateQuickResult(games, bo), [games, bo]);

  const applyTally = (side: Side, won: number, lost: number) => {
    setWinner(side);
    setGames(defaultGameScores(side, won, lost, target));
    resultIdRef.current = null;
  };

  const setGameValue = (idx: number, key: Side, raw: string) => {
    const n = raw === "" ? 0 : parseInt(raw, 10);
    setGames((prev) => prev.map((g, i) => (i === idx ? { ...g, [key]: Number.isNaN(n) ? 0 : n } : g)));
    resultIdRef.current = null;
  };

  const submit = async () => {
    if (!match) return;
    let payload;
    try {
      payload = buildQuickResultPayload(games, bo);
    } catch (e: any) {
      toast.error(e?.message || "Invalid result");
      return;
    }

    const aId = match.player_a_member_id || null;
    const bId = match.player_b_member_id || null;
    if (!aId || !bId) {
      toast.error("Both players must be known before a result can be captured");
      return;
    }

    if (!resultIdRef.current) resultIdRef.current = crypto.randomUUID();
    setSaving(true);
    try {
      // Opponent confirmation mirrors the live marker: auto-confirm when the
      // opponent has no login to confirm with.
      const { data: members } = await supabase
        .from("club_members")
        .select("id, user_id")
        .in("id", [aId, bId]);
      const opponent = (members || []).find((m: any) => m.id === (payload.winner === "a" ? bId : aId));
      const autoConfirm = !opponent?.user_id;

      const { error } = await rpcExt("save_marker_match_result", {
        _match_id: resultIdRef.current,
        _club_id: clubId || null,
        _player_a_member_id: aId,
        _player_b_member_id: bId,
        _winner_member_id: payload.winner === "a" ? aId : bId,
        _score: payload.score,
        _game_scores: payload.gameScores,
        _duration_s: 0,
        _confirmed: autoConfirm,
        _notes: `Result entered after play. Best of ${bo}. Games ${payload.gamesA}-${payload.gamesB}.`,
        _tournament_match_id: match.id,
      });
      if (error) throw error;

      toast.success("Result saved");
      qc.invalidateQueries({ queryKey: ["club-champ-matches"] });
      qc.invalidateQueries({ queryKey: ["my-champ-matches"] });
      qc.invalidateQueries({ queryKey: ["my-champ-matches-dashboard"] });
      qc.invalidateQueries({ queryKey: ["my-champ-matches-events"] });
      qc.invalidateQueries({ queryKey: ["club-champs-all-entries"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the result — tap save to retry");
    } finally {
      setSaving(false);
    }
  };

  const names: Record<Side, string> = { a: playerAName || "Player 1", b: playerBName || "Player 2" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="w-4 h-4" /> Enter result
          </DialogTitle>
          <DialogDescription className="text-xs">
            {names.a} vs {names.b} · best of {bo}. For a match that has already been played.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Quick score</Label>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {(["a", "b"] as Side[]).map((side) => (
                <div key={side} className="space-y-1">
                  <p className="text-[11px] text-muted-foreground truncate">{names[side]} won</p>
                  <div className="flex flex-wrap gap-1">
                    {tallies.map((t) => (
                      <Button
                        key={`${side}-${t.won}-${t.lost}`}
                        type="button"
                        size="sm"
                        variant={
                          winner === side && validation.gamesA + validation.gamesB === t.won + t.lost
                            ? "default"
                            : "outline"
                        }
                        className="h-7 text-[11px] px-2"
                        onClick={() => applyTally(side, t.won, t.lost)}
                      >
                        {t.won}–{t.lost}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Game scores</Label>
            <div className="space-y-1 mt-1">
              {games.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-14">Game {i + 1}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="h-8 w-16 text-center"
                    aria-label={`Game ${i + 1} ${names.a}`}
                    value={String(g.a)}
                    onChange={(e) => setGameValue(i, "a", e.target.value)}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="h-8 w-16 text-center"
                    aria-label={`Game ${i + 1} ${names.b}`}
                    value={String(g.b)}
                    onChange={(e) => setGameValue(i, "b", e.target.value)}
                  />
                  {games.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        setGames((p) => p.filter((_, idx) => idx !== i));
                        resultIdRef.current = null;
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {games.length < bo && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    setGames((p) => [...p, { a: target, b: 0 }]);
                    resultIdRef.current = null;
                  }}
                >
                  Add game
                </Button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {validation.valid
              ? `Winner: ${names[validation.winner!]} (${Math.max(validation.gamesA, validation.gamesB)}–${Math.min(validation.gamesA, validation.gamesB)})`
              : validation.error}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={saving || !validation.valid}>
            {saving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Save result
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
