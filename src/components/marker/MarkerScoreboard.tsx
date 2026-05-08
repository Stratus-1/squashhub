import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Undo2, RotateCcw, Flag, Clock, Pause, Play, Cast, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MarkerConfig, ScoringFormat, DeuceRule } from "./MarkerSetup";
import { useMarkerCast, type MarkerCastState } from "@/hooks/use-marker-cast";
import { CastDialog } from "./CastDialog";
import { useClubContext } from "@/contexts/ClubContext";
import { toast } from "sonner";
import { MARKER_STATE_KEY } from "@/lib/marker-storage";

interface PersistedState {
  sessionKey: string;
  scoreA: number; scoreB: number;
  gamesA: number; gamesB: number;
  completedGames: GameScore[];
  server: "a" | "b"; serveSide: ServeSide;
  history: PointEvent[];
  matchOver: boolean; matchWinner: "a" | "b" | null;
  elapsed: number;
  tossDecided?: boolean;
  tossPromptVersion?: number;
}

/**
 * Derive a unique key for this scoring session so that persisted state
 * for a different rubber/match never bleeds into a new one.
 */
function getSessionKey(config: MarkerConfig): string {
  const a = config.playerA.clubMemberId || config.playerA.name || "?";
  const b = config.playerB.clubMemberId || config.playerB.name || "?";
  const pa = config.partnerA?.clubMemberId || config.partnerA?.name || "";
  const pb = config.partnerB?.clubMemberId || config.partnerB?.name || "";
  return [config.source, config.sourceId || "", a, b, pa, pb, config.scoringFormat, config.bestOf].join("|");
}

function loadPersisted(expectedKey: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(MARKER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    // Discard stale state from a previous match/rubber
    if (parsed.sessionKey !== expectedKey) {
      localStorage.removeItem(MARKER_STATE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

type ServeSide = "R" | "L";

export interface GameScore {
  a: number;
  b: number;
  winnerId: "a" | "b";
}

interface PointEvent {
  scorer: "a" | "b";
  scoreA: number;
  scoreB: number;
  server: "a" | "b";
  serveSide: ServeSide;
  decision?: "stroke" | "let" | "no-let" | "point";
}

function getPointsToWin(format: ScoringFormat): number {
  switch (format) {
    case "par11": return 11;
    case "par15": return 15;
    case "english9": return 9;
  }
}

function isGameWon(scoreA: number, scoreB: number, pointsToWin: number, deuceRule: DeuceRule = "win_by_2"): "a" | "b" | null {
  const max = Math.max(scoreA, scoreB);
  const min = Math.min(scoreA, scoreB);
  if (max < pointsToWin) return null;
  if (min >= pointsToWin - 1) {
    if (deuceRule === "sudden_death") {
      // At deuce (e.g. 10-10), next point wins
      if (max > min) return scoreA > scoreB ? "a" : "b";
      return null;
    }
    // Win by 2
    if (max - min >= 2) return scoreA > scoreB ? "a" : "b";
    return null;
  }
  return scoreA >= pointsToWin ? "a" : "b";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const REST_DURATION = 120; // seconds (90s warm-up + per-rules; using 2 minutes between games)
const TOSS_PROMPT_VERSION = 1;

function hasScoringStarted(state: PersistedState | null): boolean {
  if (!state) return false;
  return state.scoreA > 0 || state.scoreB > 0 || state.gamesA > 0 || state.gamesB > 0 || state.completedGames.length > 0 || state.history.length > 0;
}

interface Props {
  config: MarkerConfig;
  onMatchComplete: (result: {
    games: GameScore[];
    winnerId: "a" | "b";
    durationSeconds: number;
  }) => void;
  onReset: () => void;
}

export function MarkerScoreboard({ config, onMatchComplete, onReset }: Props) {
  const pointsToWin = getPointsToWin(config.scoringFormat);
  const gamesToWin = Math.ceil(config.bestOf / 2);
  const isEnglish = config.scoringFormat === "english9";
  const { club } = useClubContext();
  const cast = useMarkerCast(club?.id);
  const [castDialogOpen, setCastDialogOpen] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratchConfirmText, setScratchConfirmText] = useState("");

  const sessionKey = getSessionKey(config);
  const persisted = useRef<PersistedState | null>(loadPersisted(sessionKey)).current;

  const [scoreA, setScoreA] = useState(persisted?.scoreA ?? 0);
  const [scoreB, setScoreB] = useState(persisted?.scoreB ?? 0);
  const [gamesA, setGamesA] = useState(persisted?.gamesA ?? 0);
  const [gamesB, setGamesB] = useState(persisted?.gamesB ?? 0);
  const [completedGames, setCompletedGames] = useState<GameScore[]>(persisted?.completedGames ?? []);
  const [server, setServer] = useState<"a" | "b">(persisted?.server ?? "a");
  const [serveSide, setServeSide] = useState<ServeSide>(persisted?.serveSide ?? "R");
  const [history, setHistory] = useState<PointEvent[]>(persisted?.history ?? []);
  const [matchOver, setMatchOver] = useState(persisted?.matchOver ?? false);
  const [matchWinner, setMatchWinner] = useState<"a" | "b" | null>(persisted?.matchWinner ?? null);

  // Toss: must be explicitly decided before scoring starts. Old 0-0 saved sessions
  // did not include the prompt version, so force them to ask again instead of hiding it.
  const [tossDecided, setTossDecided] = useState<boolean>(
    hasScoringStarted(persisted) || (persisted?.tossDecided === true && persisted?.tossPromptVersion === TOSS_PROMPT_VERSION)
  );

  // Rest timer between games
  const [resting, setResting] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const restTimerRef = useRef<number | null>(null);

  // Match timer
  const [elapsed, setElapsed] = useState(persisted?.elapsed ?? 0);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());
  const pausedElapsedRef = useRef(persisted?.elapsed ?? 0);

  useEffect(() => {
    if (matchOver) return;
    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(pausedElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist scoreboard state so user can navigate away and resume
  useEffect(() => {
    if (matchOver) return;
    try {
      const snapshot: PersistedState = {
        sessionKey,
        scoreA, scoreB, gamesA, gamesB, completedGames,
        server, serveSide, history, matchOver, matchWinner, elapsed,
        tossDecided,
        tossPromptVersion: TOSS_PROMPT_VERSION,
      };
      localStorage.setItem(MARKER_STATE_KEY, JSON.stringify(snapshot));
    } catch {}
  }, [scoreA, scoreB, gamesA, gamesB, completedGames, server, serveSide, history, matchOver, matchWinner, elapsed, tossDecided]);

  // Pause match timer during rest
  const pauseMatchTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pausedElapsedRef.current = elapsed;
  }, [elapsed]);

  const resumeMatchTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(pausedElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const startRestTimer = useCallback(() => {
    setResting(true);
    setRestRemaining(REST_DURATION);
    pauseMatchTimer();

    restTimerRef.current = window.setInterval(() => {
      setRestRemaining((prev) => {
        if (prev <= 1) {
          if (restTimerRef.current) clearInterval(restTimerRef.current);
          restTimerRef.current = null;
          setResting(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [pauseMatchTimer]);

  const skipRest = useCallback(() => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = null;
    setResting(false);
    setRestRemaining(0);
    resumeMatchTimer();
  }, [resumeMatchTimer]);

  // Resume match timer when rest ends naturally
  useEffect(() => {
    if (!resting && restRemaining === 0 && !matchOver && timerRef.current === null && completedGames.length > 0) {
      resumeMatchTimer();
    }
  }, [resting, restRemaining, matchOver, completedGames.length, resumeMatchTimer]);

  // Cleanup rest timer
  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, []);

  const toggleServeSide = useCallback(() => {
    if (matchOver || resting || !tossDecided) return;
    setServeSide((s) => (s === "R" ? "L" : "R"));
  }, [matchOver, resting, tossDecided]);

  const awardPoint = useCallback(
    (scorer: "a" | "b") => {
      if (matchOver || resting || !tossDecided) return;

      // English scoring: only server can score
      if (isEnglish && scorer !== server) {
        setServer(scorer);
        setServeSide("R");
        setHistory((h) => [
          ...h,
          { scorer, scoreA, scoreB, server: scorer, serveSide: "R", decision: "point" },
        ]);
        return;
      }

      const newA = scorer === "a" ? scoreA + 1 : scoreA;
      const newB = scorer === "b" ? scoreB + 1 : scoreB;

      setScoreA(newA);
      setScoreB(newB);

      if (scorer === server) {
        setServeSide((s) => (s === "R" ? "L" : "R"));
      } else {
        setServer(scorer);
        setServeSide("R");
      }

      setHistory((h) => [
        ...h,
        { scorer, scoreA: newA, scoreB: newB, server: scorer === server ? server : scorer, serveSide: scorer === server ? (serveSide === "R" ? "L" : "R") : "R" },
      ]);

      // Check game won
      const gameWinner = isGameWon(newA, newB, pointsToWin, config.deuceRule);
      if (gameWinner) {
        const newGamesA = gameWinner === "a" ? gamesA + 1 : gamesA;
        const newGamesB = gameWinner === "b" ? gamesB + 1 : gamesB;

        const game: GameScore = { a: newA, b: newB, winnerId: gameWinner };
        const newCompleted = [...completedGames, game];

        setGamesA(newGamesA);
        setGamesB(newGamesB);
        setCompletedGames(newCompleted);
        setScoreA(0);
        setScoreB(0);

        // Alternate who serves first in next game
        setServer(gameWinner === "a" ? "b" : "a");
        setServeSide("R");

        // Check match won
        if (newGamesA >= gamesToWin || newGamesB >= gamesToWin) {
          const winner = newGamesA >= gamesToWin ? "a" : "b";
          setMatchOver(true);
          setMatchWinner(winner);
          if (timerRef.current) clearInterval(timerRef.current);
          onMatchComplete({ games: newCompleted, winnerId: winner, durationSeconds: elapsed });
        } else {
          // Start rest timer between games
          startRestTimer();
        }
      }
    },
    [scoreA, scoreB, gamesA, gamesB, server, serveSide, matchOver, resting, completedGames, pointsToWin, gamesToWin, isEnglish, elapsed, onMatchComplete, startRestTimer]
  );

  const undo = useCallback(() => {
    if (history.length === 0 || matchOver || resting) return;
    const prev = history.slice(0, -1);
    setHistory(prev);

    let a = 0, b = 0, srv: "a" | "b" = "a", side: ServeSide = "R";
    const lastGameEndIdx = (() => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].scoreA === 0 && prev[i].scoreB === 0) return i;
      }
      return -1;
    })();

    const relevantEvents = lastGameEndIdx >= 0 ? prev.slice(lastGameEndIdx) : prev;
    if (relevantEvents.length > 0) {
      const last = relevantEvents[relevantEvents.length - 1];
      a = last.scoreA;
      b = last.scoreB;
      srv = last.server;
      side = last.serveSide;
    }

    setScoreA(a);
    setScoreB(b);
    setServer(srv);
    setServeSide(side);
  }, [history, matchOver, resting]);

  const playerAFirst = config.playerA.name.split(" ")[0];
  const playerBFirst = config.playerB.name.split(" ")[0];
  const partnerAFirst = config.partnerA?.name?.split(" ")[0];
  const partnerBFirst = config.partnerB?.name?.split(" ")[0];
  const playerAName = config.isDoubles && partnerAFirst ? `${playerAFirst} & ${partnerAFirst}` : playerAFirst;
  const playerBName = config.isDoubles && partnerBFirst ? `${playerBFirst} & ${partnerBFirst}` : playerBFirst;

  // Push state to TV whenever something changes
  useEffect(() => {
    if (!cast.casting) return;
    const state: MarkerCastState = {
      playerAName,
      playerBName,
      playerANumber: config.playerA.number,
      playerBNumber: config.playerB.number,
      scoreA, scoreB, gamesA, gamesB,
      server, serveSide,
      completedGames,
      matchOver, matchWinner,
      scoringFormat: config.scoringFormat,
      bestOf: config.bestOf,
      elapsed,
      clubName: club?.name,
      clubLogoUrl: club?.logo_url ?? undefined,
    };
    cast.pushState(state);
  }, [cast, playerAName, playerBName, config.playerA.number, config.playerB.number, scoreA, scoreB, gamesA, gamesB, server, serveSide, completedGames, matchOver, matchWinner, config.scoringFormat, config.bestOf, elapsed, club]);

  const handleStartCast = useCallback(async () => {
    setCastDialogOpen(true);
    if (!cast.casting) {
      const code = await cast.start();
      if (!code) {
        toast.error("Couldn't start cast session");
        setCastDialogOpen(false);
      }
    }
  }, [cast]);

  const handleStopCast = useCallback(async () => {
    await cast.stop();
    setCastDialogOpen(false);
    toast.success("Stopped casting to TV");
  }, [cast]);

  return (
    <div className="space-y-3">
      {/* Timer & match info */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-heading font-bold tabular-nums">{formatDuration(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={cast.casting ? "default" : "outline"}
            className="h-7 gap-1.5 text-xs"
            onClick={handleStartCast}
          >
            <Cast className="w-3.5 h-3.5" />
            {cast.casting ? (cast.paired ? "Live on TV" : "Pairing…") : "Cast"}
          </Button>
          <Badge variant="outline" className="text-[10px]">
            {config.scoringFormat === "par11" ? "PAR 11" : config.scoringFormat === "par15" ? "PAR 15" : "English 9"}
            {" · "}Best of {config.bestOf}
          </Badge>
        </div>
      </div>

      <CastDialog
        open={castDialogOpen}
        onClose={() => setCastDialogOpen(false)}
        pairCode={cast.pairCode}
        paired={cast.paired}
        onStop={handleStopCast}
        courtNumber={cast.courtNumber}
        onCourtChange={cast.setCourtNumber}
      />

      {/* Toss overlay - must be set before the first point */}
      {!tossDecided && !matchOver && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <p className="text-sm font-heading font-bold text-center mb-1">Who won the toss?</p>
          <p className="text-xs text-center text-muted-foreground mb-3">
            The toss winner chooses to serve and which box (Right or Left).
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Button
              size="sm"
              variant={server === "a" ? "default" : "outline"}
              onClick={() => setServer("a")}
              className="truncate"
            >
              {playerAName} serves
            </Button>
            <Button
              size="sm"
              variant={server === "b" ? "default" : "outline"}
              onClick={() => setServer("b")}
              className="truncate"
            >
              {playerBName} serves
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground mb-2">Serve from which box?</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Button
              size="sm"
              variant={serveSide === "R" ? "default" : "outline"}
              onClick={() => setServeSide("R")}
            >
              Right (R)
            </Button>
            <Button
              size="sm"
              variant={serveSide === "L" ? "default" : "outline"}
              onClick={() => setServeSide("L")}
            >
              Left (L)
            </Button>
          </div>
          <Button size="sm" className="w-full" onClick={() => setTossDecided(true)}>
            Start match
          </Button>
        </Card>
      )}

      {/* Rest timer overlay */}
      {resting && (
        <Card className="p-4 bg-accent/10 border-accent/30">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Pause className="w-4 h-4 text-accent-foreground" />
              <p className="text-sm font-heading font-bold">Rest Period</p>
            </div>
            <p className="text-4xl font-heading font-bold tabular-nums text-accent-foreground">
              {formatDuration(restRemaining)}
            </p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={skipRest}>
              <Play className="w-3.5 h-3.5" />
              Resume Play
            </Button>
          </div>
        </Card>
      )}

      {/* Games summary */}
      {completedGames.length > 0 && (
        <Card className="p-2">
          <div className="flex items-center gap-2 flex-wrap">
            {completedGames.map((g, i) => (
              <Badge key={i} variant="secondary" className="text-xs tabular-nums">
                G{i + 1}: {g.a}-{g.b}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Main scoreboard */}
      <div className="grid grid-cols-2 gap-3">
        {/* Player A */}
        <button
          type="button"
          disabled={matchOver || resting || !tossDecided}
          className={cn(
            "rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 min-h-[180px] select-none",
            "bg-primary text-primary-foreground",
            matchOver && matchWinner === "a" && "ring-4 ring-[hsl(var(--win))]",
            (matchOver || resting || !tossDecided) && "opacity-60 cursor-default"
          )}
          onClick={() => awardPoint("a")}
        >
          <p className="text-xs font-medium opacity-80 truncate max-w-full">{playerAName}</p>
          {config.playerA.number && (
            <p className="text-[10px] opacity-60">#{config.playerA.number}</p>
          )}
          <p className="text-6xl font-heading font-bold tabular-nums leading-none">{scoreA}</p>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs bg-primary-foreground/15 text-primary-foreground">
              Games: {gamesA}
            </Badge>
            {server === "a" && (
              <Badge
                className="text-[10px] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] cursor-pointer hover:opacity-80 active:scale-95 transition-all"
                onClick={(e) => { e.stopPropagation(); toggleServeSide(); }}
              >
                {serveSide}
              </Badge>
            )}
          </div>
        </button>

        {/* Player B */}
        <button
          type="button"
          disabled={matchOver || resting || !tossDecided}
          className={cn(
            "rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 min-h-[180px] select-none",
            "bg-secondary text-secondary-foreground",
            matchOver && matchWinner === "b" && "ring-4 ring-[hsl(var(--win))]",
            (matchOver || resting || !tossDecided) && "opacity-60 cursor-default"
          )}
          onClick={() => awardPoint("b")}
        >
          <p className="text-xs font-medium opacity-80 truncate max-w-full">{playerBName}</p>
          {config.playerB.number && (
            <p className="text-[10px] opacity-60">#{config.playerB.number}</p>
          )}
          <p className="text-6xl font-heading font-bold tabular-nums leading-none">{scoreB}</p>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              Games: {gamesB}
            </Badge>
            {server === "b" && (
              <Badge
                className="text-[10px] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] cursor-pointer hover:opacity-80 active:scale-95 transition-all"
                onClick={(e) => { e.stopPropagation(); toggleServeSide(); }}
              >
                {serveSide}
              </Badge>
            )}
          </div>
        </button>
      </div>

      {/* Server indicator */}
      <p className="text-center text-xs text-muted-foreground">
        {isEnglish ? "Hand-in/Hand-out · " : ""}Serving: <span className="font-semibold">{server === "a" ? playerAName : playerBName}</span> ({serveSide})
      </p>
      <button
        type="button"
        onClick={toggleServeSide}
        disabled={!tossDecided || matchOver || resting}
        className="mx-auto flex items-center gap-1.5 rounded-full border-2 border-destructive bg-destructive/10 px-3 py-1.5 text-sm font-bold text-destructive shadow-sm transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50 animate-pulse"
        aria-label={`Switch serve to ${serveSide === "R" ? "Left" : "Right"} side`}
      >
        ⇄ Tap to switch to {serveSide === "R" ? "LEFT" : "RIGHT"} side
      </button>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          disabled={history.length === 0 || matchOver || resting}
          onClick={undo}
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={onReset}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          New Match
        </Button>
      </div>

      {/* Match over banner */}
      {matchOver && matchWinner && (
        <Card className="p-4 bg-[hsl(var(--win))]/10 border-[hsl(var(--win))]/30">
          <div className="flex items-center gap-2 justify-center">
            <Flag className="w-5 h-5 text-[hsl(var(--win))]" />
            <p className="text-sm font-heading font-bold">
              {matchWinner === "a" ? playerAName : playerBName} wins!
            </p>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-1">
            {completedGames.map((g) => `${g.a}-${g.b}`).join(", ")} in {formatDuration(elapsed)}
          </p>
        </Card>
      )}
    </div>
  );
}
