import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Undo2, RotateCcw, Flag, Clock } from "lucide-react";
import type { MarkerConfig, ScoringFormat } from "./MarkerSetup";

type ServeSide = "R" | "L";

interface GameScore {
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

function isGameWon(scoreA: number, scoreB: number, pointsToWin: number): "a" | "b" | null {
  const max = Math.max(scoreA, scoreB);
  const min = Math.min(scoreA, scoreB);
  if (max < pointsToWin) return null;
  // At deuce (e.g. 10-10 in PAR 11), need 2 clear
  if (min >= pointsToWin - 1) {
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

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [gamesA, setGamesA] = useState(0);
  const [gamesB, setGamesB] = useState(0);
  const [completedGames, setCompletedGames] = useState<GameScore[]>([]);
  const [server, setServer] = useState<"a" | "b">("a");
  const [serveSide, setServeSide] = useState<ServeSide>("R");
  const [history, setHistory] = useState<PointEvent[]>([]);
  const [matchOver, setMatchOver] = useState(false);
  const [matchWinner, setMatchWinner] = useState<"a" | "b" | null>(null);

  // Timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const awardPoint = useCallback(
    (scorer: "a" | "b") => {
      if (matchOver) return;

      // English scoring: only server can score
      if (isEnglish && scorer !== server) {
        // Handout - change serve, no point
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

      // Toggle serve side if server scored, else change server
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
      const gameWinner = isGameWon(newA, newB, pointsToWin);
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
        }
      }
    },
    [scoreA, scoreB, gamesA, gamesB, server, serveSide, matchOver, completedGames, pointsToWin, gamesToWin, isEnglish, elapsed, onMatchComplete]
  );

  const undo = useCallback(() => {
    if (history.length === 0 || matchOver) return;
    const prev = history.slice(0, -1);
    setHistory(prev);

    // Replay all points from scratch for current game
    let a = 0, b = 0, srv: "a" | "b" = "a", side: ServeSide = "R";
    // Find events after last game reset
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
  }, [history, matchOver]);

  const playerAName = config.playerA.name.split(" ")[0];
  const playerBName = config.playerB.name.split(" ")[0];

  return (
    <div className="space-y-3">
      {/* Timer & match info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-heading font-bold tabular-nums">{formatDuration(elapsed)}</span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {config.scoringFormat === "par11" ? "PAR 11" : config.scoringFormat === "par15" ? "PAR 15" : "English 9"}
          {" · "}Best of {config.bestOf}
        </Badge>
      </div>

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
          disabled={matchOver}
          className={cn(
            "rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 min-h-[180px] select-none",
            "bg-primary text-primary-foreground",
            matchOver && matchWinner === "a" && "ring-4 ring-[hsl(var(--win))]",
            matchOver && "opacity-80 cursor-default"
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
              <Badge className="text-[10px] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
                {serveSide}
              </Badge>
            )}
          </div>
        </button>

        {/* Player B */}
        <button
          type="button"
          disabled={matchOver}
          className={cn(
            "rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 min-h-[180px] select-none",
            "bg-secondary text-secondary-foreground",
            matchOver && matchWinner === "b" && "ring-4 ring-[hsl(var(--win))]",
            matchOver && "opacity-80 cursor-default"
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
              <Badge className="text-[10px] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
                {serveSide}
              </Badge>
            )}
          </div>
        </button>
      </div>

      {/* Server indicator */}
      <p className="text-center text-xs text-muted-foreground">
        {isEnglish ? "Hand-in/Hand-out · " : ""}Serving: <span className="font-semibold">{server === "a" ? playerAName : playerBName}</span> ({serveSide})
        {" · "}Tap the scoring player's side
      </p>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          disabled={history.length === 0 || matchOver}
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
              {matchWinner === "a" ? config.playerA.name : config.playerB.name} wins!
            </p>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-1">
            {completedGames.map((g, i) => `${g.a}-${g.b}`).join(", ")} in {formatDuration(elapsed)}
          </p>
        </Card>
      )}
    </div>
  );
}
