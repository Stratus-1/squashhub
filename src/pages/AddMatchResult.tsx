import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trophy, UserPlus, Users, ChevronLeft } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PlayerAvatar } from "@/components/PlayerAvatar";

import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useCreateMatch } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";

type MatchType = "friendly" | "league" | "ladder" | "club_champs" | "tournament";
type ScoringFormat = "par11" | "par15" | "english9";
type BestOf = 3 | 5;

type GameScore = { playerA: string; playerB: string };

const MATCH_TYPES: { value: MatchType; label: string; description: string }[] = [
  { value: "friendly", label: "Friendly", description: "Casual / social match" },
  { value: "ladder", label: "Ladder Challenge", description: "Club ladder match" },
  { value: "league", label: "League", description: "League or inter-club match" },
  { value: "club_champs", label: "Club Champs", description: "Club championship match" },
  { value: "tournament", label: "Tournament", description: "Tournament match" },
];

const SCORING_FORMATS: { value: ScoringFormat; label: string; maxScore: number; description: string }[] = [
  { value: "par11", label: "PAR 11", maxScore: 11, description: "Point-a-rally to 11 (standard)" },
  { value: "par15", label: "PAR 15", maxScore: 15, description: "Point-a-rally to 15" },
  { value: "english9", label: "English 9", maxScore: 9, description: "Hand-in/hand-out to 9" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getMaxScore(format: ScoringFormat) {
  return SCORING_FORMATS.find((f) => f.value === format)?.maxScore ?? 11;
}

function determineGameWinner(scoreA: number, scoreB: number, format: ScoringFormat): "a" | "b" | null {
  const target = getMaxScore(format);
  const minWin = target;
  // Must win by 2 if both are at target-1 or above
  if (scoreA >= minWin && scoreA - scoreB >= 2) return "a";
  if (scoreB >= minWin && scoreB - scoreA >= 2) return "b";
  return null;
}

function computeMatchResult(games: GameScore[], format: ScoringFormat) {
  let gamesA = 0;
  let gamesB = 0;
  const validGames: { a: number; b: number; winner: "a" | "b" }[] = [];

  for (const g of games) {
    const a = parseInt(g.playerA) || 0;
    const b = parseInt(g.playerB) || 0;
    const winner = determineGameWinner(a, b, format);
    if (winner) {
      validGames.push({ a, b, winner });
      if (winner === "a") gamesA++;
      else gamesB++;
    }
  }

  return { gamesA, gamesB, validGames };
}

export default function AddMatchResult() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  const { data: ladder } = useLadder(clubId);
  const createMatch = useCreateMatch();

  // Step tracking
  const [step, setStep] = useState(1);

  // Opponent selection
  const [opponentMode, setOpponentMode] = useState<"club" | "external">("club");
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [opponentSearch, setOpponentSearch] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalClub, setExternalClub] = useState("");

  // Match settings
  const [matchType, setMatchType] = useState<MatchType>("friendly");
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>("par11");
  const [bestOf, setBestOf] = useState<BestOf>(5);
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split("T")[0]);

  // Scores
  const [games, setGames] = useState<GameScore[]>(
    Array.from({ length: 5 }, () => ({ playerA: "", playerB: "" }))
  );

  const [submitting, setSubmitting] = useState(false);

  // Filter ladder for opponent selection (exclude self)
  const availableOpponents = useMemo(() => {
    if (!ladder || !user) return [];
    return ladder
      .filter((p) => p.id !== user.id && p.club_member_id !== user.id)
      .filter((p) => {
        if (!opponentSearch.trim()) return true;
        return p.name.toLowerCase().includes(opponentSearch.toLowerCase());
      });
  }, [ladder, user, opponentSearch]);

  const selectedOpponent = useMemo(() => {
    if (!selectedOpponentId || !ladder) return null;
    return ladder.find((p) => p.user_id === selectedOpponentId || p.club_member_id === selectedOpponentId) || null;
  }, [selectedOpponentId, ladder]);

  const myName = useMemo(() => {
    if (!user || !ladder) return "You";
    const me = ladder.find((p) => p.id === user.id);
    return me?.name || "You";
  }, [user, ladder]);

  const opponentDisplayName = opponentMode === "club"
    ? selectedOpponent?.name || "Opponent"
    : externalName || "Opponent";

  // Match result computation
  const { gamesA, gamesB, validGames } = useMemo(
    () => computeMatchResult(games.slice(0, bestOf), scoringFormat),
    [games, bestOf, scoringFormat]
  );

  const neededToWin = Math.ceil(bestOf / 2);
  const matchWinner = gamesA >= neededToWin ? "a" : gamesB >= neededToWin ? "b" : null;
  const matchComplete = matchWinner !== null;

  const scoreString = useMemo(() => {
    if (validGames.length === 0) return null;
    return `${gamesA}-${gamesB}`;
  }, [gamesA, gamesB, validGames]);

  const gameScoresJson = useMemo(() => {
    if (validGames.length === 0) return null;
    return JSON.stringify({
      format: scoringFormat,
      bestOf,
      sets: validGames.map((g) => ({ a: g.a, b: g.b })),
    });
  }, [validGames, scoringFormat, bestOf]);

  const updateGame = (idx: number, field: "playerA" | "playerB", value: string) => {
    // Only allow numbers
    const cleaned = value.replace(/\D/g, "").slice(0, 2);
    setGames((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: cleaned };
      return next;
    });
  };

  const canProceedStep1 = opponentMode === "club" ? !!selectedOpponentId : externalName.trim().length > 0;
  const canProceedStep2 = true; // always valid
  const canSubmit = matchComplete;

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    try {
      const playerA = user.id;

      if (opponentMode === "external") {
        await createMatch.mutateAsync({
          playerA,
          playerB: playerA,
          winnerId: matchWinner === "a" ? playerA : null,
          score: scoreString,
          matchDate,
          gameScores: gameScoresJson,
          notes: `External opponent: ${externalName}${externalClub ? ` (${externalClub})` : ""}. Match type: ${matchType}. Winner: ${matchWinner === "a" ? myName : externalName}`,
        });
      } else {
        // Use the user_id of the selected opponent (not club_member_id)
        const opponentUserId = selectedOpponent?.user_id;
        if (!opponentUserId) {
          throw new Error("This opponent hasn't linked their account yet. They need to sign up first.");
        }
        const winnerId = matchWinner === "a" ? playerA : opponentUserId;
        await createMatch.mutateAsync({
          playerA,
          playerB: opponentUserId,
          winnerId,
          score: scoreString,
          matchDate,
          gameScores: gameScoresJson,
          notes: `Match type: ${matchType}`,
        });
      }

      toast.success("Match result submitted! Awaiting opponent confirmation.");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit match result");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bottom-nav-safe">
      <PageHeader
        title="Add Match Result"
        subtitle="Record your match scores"
      />

      <div className="px-4 mt-3 space-y-4 mb-4 max-w-lg mx-auto">
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {s === 1 ? "Opponent" : s === 2 ? "Match Type" : "Scores"}
              </span>
              {s < 3 && <Separator className="flex-1" />}
            </div>
          ))}
        </div>

        {/* STEP 1: Select Opponent */}
        {step === 1 && (
          <Card className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold font-heading flex items-center gap-2">
                <Users className="w-4 h-4" /> Select Opponent
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Choose a club member or enter details for an external player.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant={opponentMode === "club" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => { setOpponentMode("club"); setSelectedOpponentId(null); }}
              >
                <Users className="w-4 h-4 mr-1" />
                Club Member
              </Button>
              <Button
                variant={opponentMode === "external" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => { setOpponentMode("external"); setSelectedOpponentId(null); }}
              >
                <UserPlus className="w-4 h-4 mr-1" />
                External Player
              </Button>
            </div>

            {opponentMode === "club" ? (
              <div className="space-y-3">
                <Input
                  placeholder="Search members…"
                  value={opponentSearch}
                  onChange={(e) => setOpponentSearch(e.target.value)}
                />
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {availableOpponents.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No members found</p>
                  ) : (
                    availableOpponents.map((p) => {
                      const hasAccount = !!p.user_id;
                      return (
                        <button
                          key={p.club_member_id}
                          type="button"
                          disabled={!hasAccount}
                          onClick={() => hasAccount && setSelectedOpponentId(p.user_id!)}
                          className={`w-full text-left rounded-lg border p-3 transition-colors flex items-center gap-3 ${
                            selectedOpponentId === p.user_id
                              ? "border-primary bg-primary/5"
                              : hasAccount
                                ? "border-border hover:bg-muted/40"
                                : "border-border opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <PlayerAvatar initials={initials(p.name)} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <div className="flex gap-2 mt-0.5">
                              {p.rank != null && (
                                <Badge variant="outline" className="text-[10px]">
                                  #{p.rank}
                                </Badge>
                              )}
                              {p.gender && (
                                <span className="text-[10px] text-muted-foreground">{p.gender}</span>
                              )}
                              {!hasAccount && (
                                <span className="text-[10px] text-destructive">No account</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Player Name *</Label>
                  <Input
                    placeholder="e.g. John Smith"
                    value={externalName}
                    onChange={(e) => setExternalName(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div>
                  <Label className="text-xs">Club / Organisation</Label>
                  <Input
                    placeholder="e.g. Wanderers Squash Club"
                    value={externalClub}
                    onChange={(e) => setExternalClub(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </Card>
        )}

        {/* STEP 2: Match Type & Format */}
        {step === 2 && (
          <Card className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold font-heading flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Match Settings
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                vs {opponentDisplayName}
              </p>
            </div>

            <div>
              <Label className="text-xs">Match Type</Label>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <span>{t.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">— {t.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Scoring Format</Label>
              <Select value={scoringFormat} onValueChange={(v) => setScoringFormat(v as ScoringFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORING_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <div>
                        <span>{f.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">— {f.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Best Of</Label>
              <div className="flex gap-2 mt-1">
                {([3, 5] as BestOf[]).map((n) => (
                  <Button
                    key={n}
                    variant={bestOf === n ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setBestOf(n);
                      setGames(Array.from({ length: 5 }, (_, i) => games[i] || { playerA: "", playerB: "" }));
                    }}
                  >
                    Best of {n}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Match Date</Label>
              <Input
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </Card>
        )}

        {/* STEP 3: Game Scores */}
        {step === 3 && (
          <Card className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold font-heading">Game Scores</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {SCORING_FORMATS.find((f) => f.value === scoringFormat)?.label} · Best of {bestOf} · vs {opponentDisplayName}
              </p>
            </div>

            {/* Score header */}
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="text-center">
                <p className="text-xs font-semibold truncate">{myName}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Game</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold truncate">{opponentDisplayName}</p>
              </div>
            </div>

            {/* Game rows */}
            {Array.from({ length: bestOf }).map((_, i) => {
              const game = games[i];
              const a = parseInt(game.playerA) || 0;
              const b = parseInt(game.playerB) || 0;
              const winner = determineGameWinner(a, b, scoringFormat);
              // Only show game if previous game is complete or it's game 1
              // Also stop showing after match is won
              const previousGamesComplete = i === 0 || games.slice(0, i).every((g) => {
                const ga = parseInt(g.playerA) || 0;
                const gb = parseInt(g.playerB) || 0;
                return determineGameWinner(ga, gb, scoringFormat) !== null;
              });

              // Check if match was already won before this game
              const gamesBeforeThis = games.slice(0, i);
              let winsA = 0, winsB = 0;
              for (const g of gamesBeforeThis) {
                const ga = parseInt(g.playerA) || 0;
                const gb = parseInt(g.playerB) || 0;
                const w = determineGameWinner(ga, gb, scoringFormat);
                if (w === "a") winsA++;
                if (w === "b") winsB++;
              }
              const matchAlreadyWon = winsA >= neededToWin || winsB >= neededToWin;

              if (matchAlreadyWon || !previousGamesComplete) {
                return null;
              }

              return (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_auto_1fr] gap-2 items-center ${
                    winner ? "opacity-80" : ""
                  }`}
                >
                  <Input
                    type="text"
                    inputMode="numeric"
                    className={`text-center text-lg font-bold h-12 ${
                      winner === "a" ? "border-primary bg-primary/5" : ""
                    }`}
                    value={game.playerA}
                    onChange={(e) => updateGame(i, "playerA", e.target.value)}
                    placeholder="0"
                  />
                  <div className="text-center">
                    <Badge
                      variant={winner ? "default" : "outline"}
                      className="text-xs tabular-nums w-8 justify-center"
                    >
                      {i + 1}
                    </Badge>
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    className={`text-center text-lg font-bold h-12 ${
                      winner === "b" ? "border-primary bg-primary/5" : ""
                    }`}
                    value={game.playerB}
                    onChange={(e) => updateGame(i, "playerB", e.target.value)}
                    placeholder="0"
                  />
                </div>
              );
            })}

            {/* Match summary */}
            <Separator />
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <p className={`text-2xl font-bold tabular-nums ${matchWinner === "a" ? "text-primary" : ""}`}>
                  {gamesA}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {matchWinner === "a" ? "WINNER" : ""}
                </p>
              </div>
              <div className="text-center px-4">
                <p className="text-xs text-muted-foreground font-semibold">GAMES</p>
              </div>
              <div className="text-center flex-1">
                <p className={`text-2xl font-bold tabular-nums ${matchWinner === "b" ? "text-primary" : ""}`}>
                  {gamesB}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {matchWinner === "b" ? "WINNER" : ""}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Submitting…" : "Submit Result"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
