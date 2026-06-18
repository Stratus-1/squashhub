import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, Plus, Minus, RotateCcw, Pause, Play, ArrowLeft, Check, Info, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BellsFormat, getTournamentFormat } from "@/lib/tournament-formats";
import { getGroupLabel } from "@/lib/tournament-formats/group-labels";
import { setScoringActive } from "@/lib/scoring-lock";

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
          "id, champ_id, group_number, status, scheduled_date, scheduled_time, side_a_points, side_b_points, score, bell_ends_at, bell_paused_seconds, handicap_a, handicap_b, player_a_member_id, player_b_member_id, partner_a_member_id, partner_b_member_id, player_a:player_a_member_id(id,name), player_b:player_b_member_id(id,name), partner_a:partner_a_member_id(id,name), partner_b:partner_b_member_id(id,name), champ:champ_id(id, name, scoring_mode, match_duration_minutes, group_durations, group_break_minutes, default_break_minutes, handicap_mode)",
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
  const [serveSide, setServeSide] = useState<"L" | "R">("R");
  const tickRef = useRef<number | null>(null);
  const liveSyncRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  // Initialise / hydrate from existing match (admin can re-open and adjust)
  useEffect(() => {
    if (!match) return;
    // Seed from saved live points if present; otherwise from the league-rank
    // handicap so the scoreboard opens at e.g. −3 / 0 instead of 0 / 0.
    const hcA = Number(match.handicap_a) || 0;
    const hcB = Number(match.handicap_b) || 0;
    const liveA = match.side_a_points;
    const liveB = match.side_b_points;
    const hasLive = (liveA != null && liveA !== 0) || (liveB != null && liveB !== 0);
    setPointsA(hasLive ? (liveA ?? 0) : hcA);
    setPointsB(hasLive ? (liveB ?? 0) : hcB);
    setFinished(match.status === "completed");

    // Resume timer from persisted state so a second marker continues from
    // where the first left off (don't reset to the full cap).
    if (match.status === "completed") {
      setRemaining(0);
      setRunning(false);
    } else if (match.bell_ends_at) {
      const endMs = new Date(match.bell_ends_at).getTime();
      const r = Math.max(0, Math.round((endMs - Date.now()) / 1000));
      setRemaining(r);
      setRunning(r > 0);
    } else if (typeof match.bell_paused_seconds === "number" && match.bell_paused_seconds > 0) {
      setRemaining(match.bell_paused_seconds);
      setRunning(false);
    } else {
      setRemaining(capMinutes * 60);
      setRunning(false);
    }
    hydratedRef.current = true;
  }, [match, capMinutes]);


  // Hold the PWA update poller while a Bells match is live (not finished).
  useEffect(() => {
    if (finished) return;
    setScoringActive(true);
    return () => setScoringActive(false);
  }, [finished]);

  // Persist live score to DB (debounced) so spectators can follow along.
  useEffect(() => {
    if (!hydratedRef.current || !match || finished) return;
    if (liveSyncRef.current) window.clearTimeout(liveSyncRef.current);
    liveSyncRef.current = window.setTimeout(() => {
      rpcExt("sync_bells_match_state", {
        _match_id: match.id,
        _side_a_points: pointsA,
        _side_b_points: pointsB,
        _bell_ends_at: match.bell_ends_at ?? null,
        _bell_paused_seconds: match.bell_paused_seconds ?? null,
        _status: "in_progress",
        _patch_timer: false,
      })
        .then(({ error }) => {
          if (error) console.warn("Live score sync failed:", error.message);
        });
    }, 500);
    return () => {
      if (liveSyncRef.current) window.clearTimeout(liveSyncRef.current);
    };
  }, [pointsA, pointsB, match, finished]);


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
          ringBellSound(3);
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
  const hcA = Number(match?.handicap_a) || 0;
  const hcB = Number(match?.handicap_b) || 0;
  const hcSuffix = (h: number) => (h !== 0 ? ` · HCP ${h > 0 ? "+" : ""}${h}` : "");
  const pairAName = `${getName(match?.player_a)}${match?.partner_a ? " & " + getName(match.partner_a) : ""}${hcSuffix(hcA)}`;
  const pairBName = `${getName(match?.player_b)}${match?.partner_b ? " & " + getName(match.partner_b) : ""}${hcSuffix(hcB)}`;

  // Ring the boxing-bell sound (also vibrates on mobile). Used at start of
  // play, when "Ring bell now" is pressed, and when the countdown expires.
  const ringBellSound = (times = 3) => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      const ctx = new Ctx();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const ringAt = (t0: number) => {
        const partials = [
          { f: 880, g: 0.35 },
          { f: 1320, g: 0.22 },
          { f: 1760, g: 0.15 },
          { f: 2640, g: 0.08 },
        ];
        partials.forEach(({ f, g }) => {
          const o = ctx.createOscillator();
          const gn = ctx.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(f, t0);
          gn.gain.setValueAtTime(0.0001, t0);
          gn.gain.exponentialRampToValueAtTime(g, t0 + 0.01);
          gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
          o.connect(gn);
          gn.connect(ctx.destination);
          o.start(t0);
          o.stop(t0 + 1.9);
        });
      };
      const t = ctx.currentTime;
      for (let i = 0; i < times; i++) ringAt(t + i * 0.6);
      setTimeout(() => ctx.close().catch(() => {}), 1000 + times * 700);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate([400, 150, 400]); } catch { /* noop */ }
      }
    } catch { /* noop */ }
  };

  // ----- Timer persistence helpers -----
  const persistTimer = (patch: { bell_ends_at?: string | null; bell_paused_seconds?: number | null; status?: string }) => {
    if (!match) return;
    rpcExt("sync_bells_match_state", {
      _match_id: match.id,
      _side_a_points: pointsA,
      _side_b_points: pointsB,
      _bell_ends_at: patch.bell_ends_at ?? match.bell_ends_at ?? null,
      _bell_paused_seconds: patch.bell_paused_seconds ?? null,
      _status: patch.status ?? "in_progress",
      _patch_timer: true,
    }).then(({ error }) => {
      if (error) console.warn("Timer sync failed:", error.message);
    });
  };

  const startTimer = () => {
    if (finished || remaining <= 0) return;
    const end = new Date(Date.now() + remaining * 1000).toISOString();
    setRunning(true);
    // Ring the bell to signal "play starts now" (single ring).
    ringBellSound(1);
    persistTimer({ bell_ends_at: end, bell_paused_seconds: null, status: "in_progress" });
  };

  const pauseTimer = () => {
    setRunning(false);
    persistTimer({ bell_ends_at: null, bell_paused_seconds: remaining });
  };

  const toggleStart = () => (running ? pauseTimer() : startTimer());

  const handleIncrement = (side: "a" | "b") => {
    if (finished) return;
    // Auto-start timer if marker forgot to press Start
    if (!running && remaining > 0) startTimer();
    if (side === "a") setPointsA((v) => v + 1);
    else setPointsB((v) => v + 1);
  };

  const ringBellNow = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    setRunning(false);
    setFinished(true);
    ringBellSound(3);
    persistTimer({ bell_ends_at: null, bell_paused_seconds: null, status: "in_progress" });
  };


  const resetAll = () => {
    const hcA = Number(match?.handicap_a) || 0;
    const hcB = Number(match?.handicap_b) || 0;
    setPointsA(hcA);
    setPointsB(hcB);
    setRemaining(capMinutes * 60);
    setRunning(false);
    setFinished(false);
    persistTimer({ bell_ends_at: null, bell_paused_seconds: null, status: "scheduled" });
  };

  // When marker leaves the page (Back to tournament/dashboard), clear the LIVE
  // flag so another marker can take over. Keep points + paused remaining so
  // the next marker resumes exactly where this one stopped.
  const handleLeave = (to: string) => {
    // Cancel any pending debounced live-score sync so it can't re-set the
    // match to "in_progress" after we exit.
    if (liveSyncRef.current) {
      window.clearTimeout(liveSyncRef.current);
      liveSyncRef.current = null;
    }
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (!finished && match) {
      // Stop the local timer and persist current state as "paused / scheduled"
      // so the match is no longer shown as LIVE on the tournaments list and
      // another marker can pick it up. Keep current points + remaining seconds
      // so play resumes exactly where we left off.
      setRunning(false);
      const pausedRemaining = Math.max(0, remaining);
      rpcExt("sync_bells_match_state", {
        _match_id: match.id,
        _side_a_points: pointsA,
        _side_b_points: pointsB,
        _bell_ends_at: null,
        _bell_paused_seconds: pausedRemaining > 0 ? pausedRemaining : null,
        _status: "scheduled",
        _patch_timer: true,
      }).then(({ error }) => {
        if (error) console.warn("Bells exit sync failed:", error.message);
      });
    }
    navigate(to);
  };



  const saveResult = async () => {
    if (!match) return;
    // Cancel any pending live-score sync so it cannot overwrite status back to in_progress
    if (liveSyncRef.current) window.clearTimeout(liveSyncRef.current);
    setSaving(true);
    try {
      // Winner + score string come from the format strategy
      const winnerMemberId = BellsFormat.resolveWinnerMemberId(match, pointsA, pointsB);
      const scoreStr = BellsFormat.formatScore(pointsA, pointsB);
      const { data: auth } = await supabase.auth.getUser();

      const { error } = await rpcExt("save_bells_match_result", {
        _match_id: match.id,
        _side_a_points: pointsA,
        _side_b_points: pointsB,
      });
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
        subtitle={`${champ?.name} · ${getGroupLabel(champ, match.group_number)} · ${capMinutes} min cap`}
      />

      <div className="px-4 mt-3 mb-20 max-w-2xl mx-auto space-y-4">
        <button
          onClick={() => handleLeave("/tournaments")}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to tournaments
        </button>


        {/* How-to */}
        <div className="rounded-lg border border-primary/30 bg-card shadow-sm p-3 text-xs text-foreground flex gap-2">
          <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div className="space-y-0.5">
            <p><b>Start</b> — begin the {capMinutes}-minute countdown.</p>
            <p>Tap each pair's big number (or <b>+</b>) to add a point during play.</p>
            <p>The <b>bell</b> rings automatically when time is up. Use <b>Ring bell now</b> to end early (e.g. to test or stop a match), then <b>Save result</b> to post the score and move on to the next match.</p>
          </div>
        </div>



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
                  onClick={toggleStart}
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
            onPlus={() => handleIncrement("a")}
            onMinus={() => setPointsA((v) => Math.max(0, v - 1))}
            side="a"
          />
          <Counter
            label={pairBName}
            value={pointsB}
            onPlus={() => handleIncrement("b")}
            onMinus={() => setPointsB((v) => Math.max(0, v - 1))}
            side="b"
          />
        </div>


        {/* Save */}
        <Button
          className="w-full h-12 gap-2 text-base"
          disabled={saving || !finished || (pointsA === 0 && pointsB === 0)}
          onClick={saveResult}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save result · {pointsA}-{pointsB}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          Tap each pair's number (or +) to add a point. Ring the bell, then confirm the score to save.
        </p>
      </div>
      <div className="px-4 py-4 mt-4">
        <Button variant="outline" className="w-full h-10 text-sm" onClick={() => handleLeave("/dashboard")}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Dashboard
        </Button>
      </div>

    </div>
  );
}
