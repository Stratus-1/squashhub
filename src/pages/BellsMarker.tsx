import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, Plus, Minus, RotateCcw, Pause, Play, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BellsFormat, getTournamentFormat } from "@/lib/tournament-formats";

/**
 * Bells doubles scorer.
 *
 * - Loads one club_champs_matches row whose tournament has
 *   scoring_mode = 'time_capped_points'.
 * - Picks the time cap from champ.group_durations[group_number] OR
 *   champ.match_duration_minutes.
 * - Two big point counters (Pair A / Pair B), a countdown, a "Bell" button
 *   that freezes the score and saves it as the result.
 * - Standings on ClubChampsView read side_a_points / side_b_points to
 *   rank pairs by total points scored.
 */
export default function BellsMarker() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: match, isLoading } = useQuery({
    queryKey: ["bells-match", matchId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs_matches")
        .select(
          "id, champ_id, group_number, status, scheduled_date, scheduled_time, side_a_points, side_b_points, score, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, player_a:player_a_member_id(id,name), player_b:player_b_member_id(id,name), partner_a:partner_a_member_id(id,name), partner_b:partner_b_member_id(id,name), champ:champ_id(id, name, scoring_mode, match_duration_minutes, group_durations)",
        )
        .eq("id", matchId!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!matchId,
  });

  const champ = match?.champ;
  const format = getTournamentFormat(champ?.scoring_mode);
  const isBells = format?.key === BellsFormat.key;

  // Per-league time cap fallback (delegated to format strategy)
  const capMinutes = useMemo(() => {
    if (!champ) return 30;
    return BellsFormat.getTimeCapMinutes(champ, match?.group_number) ?? 30;
  }, [champ, match?.group_number]);

  const [pointsA, setPointsA] = useState(0);
  const [pointsB, setPointsB] = useState(0);
  const [remaining, setRemaining] = useState(capMinutes * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const tickRef = useRef<number | null>(null);

  // Initialise / hydrate from existing match (admin can re-open and adjust)
  useEffect(() => {
    if (!match) return;
    setPointsA(match.side_a_points ?? 0);
    setPointsB(match.side_b_points ?? 0);
    setRemaining(capMinutes * 60);
    setFinished(match.status === "completed");
    setRunning(false);
  }, [match, capMinutes]);

  // Countdown
  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // Ring the bell
          window.clearInterval(tickRef.current!);
          setRunning(false);
          setFinished(true);
          try {
            // Best-effort audio ping
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.frequency.value = 880;
            o.connect(g);
            g.connect(ctx.destination);
            g.gain.setValueAtTime(0.001, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
            o.start();
            o.stop(ctx.currentTime + 1.3);
          } catch { /* noop */ }
          toast.success("Bell! Time's up — confirm the score.");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [running]);

  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const getName = (p: any) => p?.name || "—";
  const pairAName = `${getName(match?.player_a)}${match?.partner_a ? " & " + getName(match.partner_a) : ""}`;
  const pairBName = `${getName(match?.player_b)}${match?.partner_b ? " & " + getName(match.partner_b) : ""}`;

  const ringBellNow = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    setRunning(false);
    setFinished(true);
  };

  const resetAll = () => {
    setPointsA(0);
    setPointsB(0);
    setRemaining(capMinutes * 60);
    setRunning(false);
    setFinished(false);
  };

  const saveResult = async () => {
    if (!match) return;
    setSaving(true);
    try {
      // Winner + score string come from the format strategy
      const winnerMemberId = BellsFormat.resolveWinnerMemberId(match, pointsA, pointsB);
      const scoreStr = BellsFormat.formatScore(pointsA, pointsB);
      const { data: auth } = await supabase.auth.getUser();

      const { error } = await fromExt("club_champs_matches")
        .update({
          side_a_points: pointsA,
          side_b_points: pointsB,
          score: scoreStr,
          winner_member_id: winnerMemberId,
          status: "completed",
        })
        .eq("id", match.id);
      if (error) throw error;

      // Best-effort: also drop a row into matches so it shows up in players' history
      try {
        const memberIds = [
          match.player_a_member_id,
          match.player_b_member_id,
          match.partner_a_member_id,
          match.partner_b_member_id,
        ].filter(Boolean) as string[];
        const { data: members } = await supabase
          .from("club_members")
          .select("id, user_id, club_id")
          .in("id", memberIds);
        const memberMap = new Map((members || []).map((m: any) => [m.id, m]));
        const aUser = (memberMap.get(match.player_a_member_id) as any)?.user_id || null;
        const bUser = (memberMap.get(match.player_b_member_id) as any)?.user_id || null;
        const clubIdResolved = (memberMap.values().next().value as any)?.club_id || null;
        await supabase.from("matches").insert({
          player_a: aUser,
          player_b: bUser,
          player_a_member_id: match.player_a_member_id,
          player_b_member_id: match.player_b_member_id,
          winner_id: winnerMemberId === match.player_a_member_id ? aUser : winnerMemberId === match.player_b_member_id ? bUser : null,
          winner_member_id: winnerMemberId,
          score: scoreStr,
          duration_s: capMinutes * 60 - remaining,
          submitted_by: auth.user?.id || null,
          submitted_by_member_id: null,
          confirmed: true,
          notes: `Bells doubles tournament: ${champ?.name || ""} (League ${match.group_number}). ${pairAName} vs ${pairBName}. Final ${scoreStr}.`,
          club_id: clubIdResolved,
        } as any);
      } catch (e) {
        console.warn("Could not mirror to matches table:", e);
      }

      qc.invalidateQueries({ queryKey: ["bells-match", matchId] });
      qc.invalidateQueries({ queryKey: ["club-champ-matches", match.champ_id] });
      qc.invalidateQueries({ queryKey: ["tournaments-upcoming-matches"] });
      toast.success(`Result saved · ${pairAName} ${scoreStr} ${pairBName}`);
      navigate(`/club-champs/${match.champ_id}`);
    } catch (e: any) {
      toast.error(e.message || "Could not save result");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Match not found.
      </div>
    );
  }

  if (!isBells) {
    // Wrong tool for this match — kick back to standard marker
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          This match isn't a Bells (time-capped) tournament match. Use the standard match marker instead.
        </p>
        <Button onClick={() => navigate(getTournamentFormat(champ?.scoring_mode).markerRoute(match.id))}>
          Open Match Marker
        </Button>
      </div>
    );
  }

  const Counter = ({
    label,
    value,
    onPlus,
    onMinus,
    side,
  }: {
    label: string;
    value: number;
    onPlus: () => void;
    onMinus: () => void;
    side: "a" | "b";
  }) => (
    <div
      className={cn(
        "flex flex-col items-center justify-between rounded-2xl border p-4 sm:p-6",
        side === "a" ? "bg-primary/5 border-primary/30" : "bg-amber-500/5 border-amber-500/30",
      )}
    >
      <p className="text-sm font-medium text-center line-clamp-2 min-h-[2.5rem]">{label}</p>
      <button
        onClick={onPlus}
        disabled={finished}
        className={cn(
          "my-3 w-full rounded-xl text-7xl sm:text-8xl font-bold tabular-nums py-6 active:scale-95 transition disabled:opacity-60",
          side === "a" ? "bg-primary text-primary-foreground" : "bg-amber-500 text-white",
        )}
        aria-label={`Add point to ${label}`}
      >
        {value}
      </button>
      <div className="flex gap-2 w-full">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onMinus}
          disabled={finished || value === 0}
        >
          <Minus className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onPlus}
          disabled={finished}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="bottom-nav-safe">
      <SEO title="Bells Marker" description="Time-capped doubles tournament scorer" noIndex />
      <PageHeader
        title="Bells Scorer"
        subtitle={`${champ?.name} · League ${match.group_number} · ${capMinutes} min cap`}
      />

      <div className="px-4 mt-3 mb-20 max-w-2xl mx-auto space-y-4">
        <button
          onClick={() => navigate(`/club-champs/${match.champ_id}`)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to tournament
        </button>

        {/* Timer */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Bell className="w-4 h-4" /> Bell timer
              </span>
              {finished && <Badge variant="secondary">Bell rung</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={cn(
                "text-center font-bold tabular-nums text-6xl sm:text-7xl",
                remaining <= 60 && !finished && "text-destructive animate-pulse",
                finished && "text-muted-foreground line-through",
              )}
            >
              {mmss(remaining)}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {!finished && (
                <Button
                  onClick={() => setRunning((r) => !r)}
                  variant={running ? "outline" : "default"}
                  className="gap-1"
                >
                  {running ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Start</>}
                </Button>
              )}
              {!finished && (
                <Button onClick={ringBellNow} variant="destructive" className="gap-1">
                  <Bell className="w-4 h-4" /> Ring bell now
                </Button>
              )}
              <Button onClick={resetAll} variant="outline" className="gap-1">
                <RotateCcw className="w-4 h-4" /> Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Counters */}
        <div className="grid grid-cols-2 gap-3">
          <Counter
            label={pairAName}
            value={pointsA}
            onPlus={() => setPointsA((v) => v + 1)}
            onMinus={() => setPointsA((v) => Math.max(0, v - 1))}
            side="a"
          />
          <Counter
            label={pairBName}
            value={pointsB}
            onPlus={() => setPointsB((v) => v + 1)}
            onMinus={() => setPointsB((v) => Math.max(0, v - 1))}
            side="b"
          />
        </div>

        {/* Save */}
        <Button
          className="w-full h-12 gap-2 text-base"
          disabled={saving || (pointsA === 0 && pointsB === 0)}
          onClick={saveResult}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save result · {pointsA}-{pointsB}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          Tap each pair's number (or +) to add a point. When the bell rings, confirm the score to save.
        </p>
      </div>
      <BackToDashboard />
    </div>
  );
}
