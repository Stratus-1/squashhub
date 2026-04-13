import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Calendar, MapPin, Check, X, Loader2, Trophy, Pen, Play, Edit3, ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import type { MarkerConfig } from "@/components/marker/MarkerSetup";

interface PositionEntry {
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  scores: { home: number; away: number }[];
  completed: boolean;
}

type Phase = "setup" | "scoring" | "submitted";

function emptyPositions(): PositionEntry[] {
  return [1, 2, 3, 4].map(() => ({
    homeCode: "", homeName: "", awayCode: "", awayName: "",
    scores: [], completed: false,
  }));
}

/* ---- Signature pad ---- */
function SignaturePad({ onSave, label }: { onSave: (data: string) => void; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); setDrawing(true); setHasContent(true);
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  };
  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing) return; e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e); ctx.lineWidth = 2; ctx.strokeStyle = "#000";
    ctx.lineTo(pos.x, pos.y); ctx.stroke();
  };
  const endDraw = () => { setDrawing(false); if (hasContent) onSave(canvasRef.current!.toDataURL()); };
  const clear = () => {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    setHasContent(false); onSave("");
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {hasContent && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clear}>Clear</Button>}
      </div>
      <canvas ref={canvasRef} width={300} height={100}
        className="border rounded-md bg-white w-full touch-none"
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
    </div>
  );
}

export default function LeagueGameDetail() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [positions, setPositions] = useState<PositionEntry[]>(emptyPositions());
  const [phase, setPhase] = useState<Phase>("setup");
  const [activeMarker, setActiveMarker] = useState<number | null>(null); // position index being marked
  const [manualEntry, setManualEntry] = useState<number | null>(null); // position index for manual scores
  const [homeSig, setHomeSig] = useState("");
  const [awaySig, setAwaySig] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: fixture } = useQuery({
    queryKey: ["league-fixture", fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .eq("id", fixtureId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!fixtureId,
  });

  const { data: existingResult } = useQuery({
    queryKey: ["league-fixture-result", fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_fixture_results" as any)
        .select("*")
        .eq("fixture_id", fixtureId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!fixtureId,
  });

  const { data: existingMatches } = useQuery({
    queryKey: ["league-match-results", fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_match_results" as any)
        .select("*")
        .eq("fixture_id", fixtureId!)
        .order("position");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!fixtureId && !!existingResult,
  });

  useEffect(() => {
    if (existingMatches && existingMatches.length > 0) {
      const loaded = [1, 2, 3, 4].map((pos) => {
        const m = existingMatches.find((r: any) => r.position === pos);
        if (!m) return { homeCode: "", homeName: "", awayCode: "", awayName: "", scores: [], completed: false };
        return {
          homeCode: m.home_player_code || "",
          homeName: m.home_player_name || "",
          awayCode: m.away_player_code || "",
          awayName: m.away_player_name || "",
          scores: (m.game_scores as any[]) || [],
          completed: (m.game_scores as any[])?.length > 0,
        };
      });
      setPositions(loaded);
      const isSubmitted = existingResult?.status === "submitted" || existingResult?.status === "confirmed";
      setPhase(isSubmitted ? "submitted" : "scoring");
    }
  }, [existingMatches, existingResult]);

  // NSF lookup
  const lookupPlayer = useCallback(async (code: string): Promise<string> => {
    if (!code || code.length < 3) return "";
    const { data } = await supabase
      .from("platform_league_members" as any)
      .select("first_name, surname")
      .eq("user_code", code.toUpperCase())
      .maybeSingle();
    if (data) return `${(data as any).first_name} ${(data as any).surname}`;
    return "";
  }, []);

  const updatePosition = (idx: number, field: keyof PositionEntry, value: any) => {
    setPositions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleCodeBlur = async (idx: number, side: "home" | "away") => {
    const code = side === "home" ? positions[idx].homeCode : positions[idx].awayCode;
    const name = await lookupPlayer(code);
    updatePosition(idx, side === "home" ? "homeName" : "awayName", name);
  };

  // Setup validation: at least 1 position must have both players
  const setupValid = positions.some((p) => p.homeCode && p.awayCode && p.homeName && p.awayName);

  const completeSetup = () => {
    if (!setupValid) {
      toast.error("Enter at least one complete position (both home & away NSF numbers)");
      return;
    }
    setPhase("scoring");
  };

  // ---- Live marker integration ----
  const startMarking = (posIdx: number) => {
    const pos = positions[posIdx];
    if (!pos.homeCode || !pos.awayCode) {
      toast.error("Both players must be set for this position");
      return;
    }
    setActiveMarker(posIdx);
  };

  const markerConfig = useMemo((): MarkerConfig | null => {
    if (activeMarker === null) return null;
    const pos = positions[activeMarker];
    return {
      playerA: { name: pos.homeName || pos.homeCode, number: pos.homeCode, club: fixture?.home_team_code || "" },
      playerB: { name: pos.awayName || pos.awayCode, number: pos.awayCode, club: fixture?.away_team_code || "" },
      isDoubles: false,
      matchType: "league",
      scoringFormat: "par11",
      bestOf: 5,
      deuceRule: "win_by_2",
      source: "league",
      sourceId: fixtureId,
    };
  }, [activeMarker, positions, fixture, fixtureId]);

  const handleMarkerComplete = useCallback((result: { games: GameScore[]; winnerId: "a" | "b"; durationSeconds: number }) => {
    if (activeMarker === null) return;
    // Convert GameScore[] to league format
    const scores = result.games.map((g) => ({ home: g.a, away: g.b }));
    setPositions((prev) => {
      const next = [...prev];
      next[activeMarker] = { ...next[activeMarker], scores, completed: true };
      return next;
    });
    toast.success(`Position ${activeMarker + 1} complete!`);
    setActiveMarker(null);
  }, [activeMarker]);

  // ---- Manual score entry ----
  const addGame = (posIdx: number) => {
    setPositions((prev) => {
      const next = [...prev];
      next[posIdx] = { ...next[posIdx], scores: [...next[posIdx].scores, { home: 0, away: 0 }] };
      return next;
    });
  };

  const updateScore = (posIdx: number, gameIdx: number, side: "home" | "away", val: number) => {
    setPositions((prev) => {
      const next = [...prev];
      const scores = [...next[posIdx].scores];
      scores[gameIdx] = { ...scores[gameIdx], [side]: val };
      next[posIdx] = { ...next[posIdx], scores };
      return next;
    });
  };

  const removeGame = (posIdx: number, gameIdx: number) => {
    setPositions((prev) => {
      const next = [...prev];
      const scores = next[posIdx].scores.filter((_, i) => i !== gameIdx);
      next[posIdx] = { ...next[posIdx], scores };
      return next;
    });
  };

  const finishManualEntry = (posIdx: number) => {
    setPositions((prev) => {
      const next = [...prev];
      next[posIdx] = { ...next[posIdx], completed: next[posIdx].scores.length > 0 };
      return next;
    });
    setManualEntry(null);
  };

  // ---- Summary calculation ----
  const summary = useMemo(() => {
    let homeTotalGames = 0, awayTotalGames = 0, homeBonusPoints = 0, awayBonusPoints = 0;
    for (const pos of positions) {
      let posHomeWins = 0, posAwayWins = 0;
      for (const s of pos.scores) {
        if (s.home > s.away) posHomeWins++;
        else if (s.away > s.home) posAwayWins++;
      }
      homeTotalGames += posHomeWins;
      awayTotalGames += posAwayWins;
      if (posHomeWins > posAwayWins) homeBonusPoints++;
      else if (posAwayWins > posHomeWins) awayBonusPoints++;
    }
    const homeTotal = homeTotalGames + homeBonusPoints;
    const awayTotal = awayTotalGames + awayBonusPoints;
    const winner = homeTotal > awayTotal ? "home" : awayTotal > homeTotal ? "away" : "draw";
    return { homeTotalGames, awayTotalGames, homeBonusPoints, awayBonusPoints, homeTotal, awayTotal, winner };
  }, [positions]);

  // ---- Submit ----
  const handleSubmit = async () => {
    if (!fixtureId || !user) return;
    setSubmitting(true);
    try {
      for (let i = 0; i < 4; i++) {
        const pos = positions[i];
        if (!pos.homeCode && !pos.awayCode) continue;
        let homeGamesWon = 0, awayGamesWon = 0;
        for (const s of pos.scores) {
          if (s.home > s.away) homeGamesWon++;
          else if (s.away > s.home) awayGamesWon++;
        }
        const matchWinner = homeGamesWon > awayGamesWon ? "home" : awayGamesWon > homeGamesWon ? "away" : null;
        const { error } = await supabase.from("league_match_results" as any).upsert({
          fixture_id: fixtureId, position: i + 1,
          home_player_code: pos.homeCode.toUpperCase(), away_player_code: pos.awayCode.toUpperCase(),
          home_player_name: pos.homeName, away_player_name: pos.awayName,
          game_scores: pos.scores, home_games_won: homeGamesWon, away_games_won: awayGamesWon,
          winner: matchWinner,
        } as any, { onConflict: "fixture_id,position" });
        if (error) throw error;
      }
      const { error: sumErr } = await supabase.from("league_fixture_results" as any).upsert({
        fixture_id: fixtureId,
        home_total_games: summary.homeTotalGames, away_total_games: summary.awayTotalGames,
        home_bonus_points: summary.homeBonusPoints, away_bonus_points: summary.awayBonusPoints,
        home_total_points: summary.homeTotal, away_total_points: summary.awayTotal,
        winner: summary.winner, status: homeSig && awaySig ? "submitted" : "draft",
        home_captain_signature: homeSig || null, away_captain_signature: awaySig || null,
        submitted_by: user.id, submitted_at: new Date().toISOString(),
      } as any, { onConflict: "fixture_id" });
      if (sumErr) throw sumErr;
      toast.success("League results submitted!");
      queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
      queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
      navigate("/league-games");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (!fixture) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const isSubmitted = phase === "submitted";

  // ---- Active marker view ----
  if (activeMarker !== null && markerConfig) {
    return (
      <div className="bottom-nav-safe">
        <SEO title="Marking Game" description="Live scoring" path={`/league-games/${fixtureId}`} noIndex />
        <div className="px-4 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setActiveMarker(null)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Badge variant="outline" className="text-xs">
              Position {activeMarker + 1} · {fixture.home_team_code} vs {fixture.away_team_code}
            </Badge>
          </div>
          <MarkerScoreboard
            config={markerConfig}
            onMatchComplete={handleMarkerComplete}
            onReset={() => setActiveMarker(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <SEO title="League Game" description="Score league fixture" path={`/league-games/${fixtureId}`} noIndex />
      <PageHeader title="League Game" subtitle={`${fixture.home_team_code} vs ${fixture.away_team_code}`} />

      <div className="px-4 space-y-4 pb-8">
        {/* Fixture info */}
        <Card className="p-4">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{format(parseISO(fixture.fixture_date), "EEEE, dd MMM yyyy")}</span>
            <Badge variant="outline" className="text-xs">{fixture.division}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" /> {fixture.venue_name}
          </div>
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="text-center">
              <p className="text-lg font-bold">{fixture.home_team_code}</p>
              <p className="text-xs text-muted-foreground">Home</p>
            </div>
            <span className="text-xl font-bold text-muted-foreground">vs</span>
            <div className="text-center">
              <p className="text-lg font-bold">{fixture.away_team_code}</p>
              <p className="text-xs text-muted-foreground">Away</p>
            </div>
          </div>
        </Card>

        {/* ---- SETUP PHASE ---- */}
        {phase === "setup" && (
          <>
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-1">Player Setup</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Enter NSF numbers for each position. Names will auto-fill.
              </p>
              {positions.map((pos, idx) => (
                <div key={idx} className="mb-4 last:mb-0">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Position {idx + 1}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Home NSF #</Label>
                      <Input
                        value={pos.homeCode}
                        onChange={(e) => updatePosition(idx, "homeCode", e.target.value.toUpperCase())}
                        onBlur={() => handleCodeBlur(idx, "home")}
                        placeholder="NSF0000"
                        className="font-mono text-sm"
                      />
                      {pos.homeName && <p className="text-xs text-green-600 mt-0.5">{pos.homeName}</p>}
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Away NSF #</Label>
                      <Input
                        value={pos.awayCode}
                        onChange={(e) => updatePosition(idx, "awayCode", e.target.value.toUpperCase())}
                        onBlur={() => handleCodeBlur(idx, "away")}
                        placeholder="NSF0000"
                        className="font-mono text-sm"
                      />
                      {pos.awayName && <p className="text-xs text-green-600 mt-0.5">{pos.awayName}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </Card>
            <Button className="w-full" size="lg" onClick={completeSetup} disabled={!setupValid}>
              <Check className="w-4 h-4 mr-2" /> Complete Setup
            </Button>
          </>
        )}

        {/* ---- SCORING PHASE ---- */}
        {phase === "scoring" && (
          <>
            {positions.map((pos, idx) => {
              const hasPlayers = pos.homeCode && pos.awayCode;
              const isManual = manualEntry === idx;

              return (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Position {idx + 1}</CardTitle>
                      {pos.completed && (
                        <Badge className="bg-green-500/15 text-green-700 text-[10px]">
                          <Check className="w-3 h-3 mr-0.5" /> Done
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Player names */}
                    {hasPlayers ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Home</p>
                          <p className="font-medium truncate">{pos.homeName || pos.homeCode}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{pos.homeCode}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Away</p>
                          <p className="font-medium truncate">{pos.awayName || pos.awayCode}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{pos.awayCode}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No players assigned</p>
                    )}

                    {/* Completed scores display */}
                    {pos.completed && pos.scores.length > 0 && !isManual && (
                      <div className="space-y-1">
                        {pos.scores.map((s, gi) => (
                          <div key={gi} className="flex items-center gap-2 text-sm">
                            <span className="text-xs text-muted-foreground w-14">Game {gi + 1}</span>
                            <span className={s.home > s.away ? "font-bold text-green-600" : ""}>{s.home}</span>
                            <span className="text-muted-foreground">-</span>
                            <span className={s.away > s.home ? "font-bold text-green-600" : ""}>{s.away}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Manual score entry */}
                    {isManual && (
                      <div className="space-y-1.5 border-t pt-2">
                        {pos.scores.map((s, gi) => (
                          <div key={gi} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-14 shrink-0">Game {gi + 1}</span>
                            <Input type="number" min={0} value={s.home}
                              onChange={(e) => updateScore(idx, gi, "home", parseInt(e.target.value) || 0)}
                              className="w-16 text-center text-sm" />
                            <span className="text-xs text-muted-foreground">-</span>
                            <Input type="number" min={0} value={s.away}
                              onChange={(e) => updateScore(idx, gi, "away", parseInt(e.target.value) || 0)}
                              className="w-16 text-center text-sm" />
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeGame(idx, gi)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          {pos.scores.length < 5 && (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addGame(idx)}>
                              + Add Game
                            </Button>
                          )}
                          <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => finishManualEntry(idx)}>
                            <Check className="w-3 h-3 mr-1" /> Done
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {hasPlayers && !pos.completed && !isManual && (
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 gap-1.5" onClick={() => startMarking(idx)}>
                          <Play className="w-3.5 h-3.5" /> Mark Game
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setManualEntry(idx); if (pos.scores.length === 0) addGame(idx); }}>
                          <Edit3 className="w-3.5 h-3.5" /> Enter Scores
                        </Button>
                      </div>
                    )}

                    {/* Re-mark or edit completed */}
                    {pos.completed && !isManual && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => {
                          updatePosition(idx, "scores", []);
                          updatePosition(idx, "completed", false);
                          startMarking(idx);
                        }}>
                          <Play className="w-3 h-3" /> Re-mark
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setManualEntry(idx)}>
                          <Edit3 className="w-3 h-3" /> Edit Scores
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {/* Back to setup */}
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setPhase("setup")}>
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to Player Setup
            </Button>

            {/* Summary */}
            {positions.some((p) => p.completed) && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Match Summary</h3>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <p className="font-bold text-lg">{fixture.home_team_code}</p>
                  <div />
                  <p className="font-bold text-lg">{fixture.away_team_code}</p>

                  <p className="text-2xl font-bold">{summary.homeTotalGames}</p>
                  <p className="text-xs text-muted-foreground self-center">Games Won</p>
                  <p className="text-2xl font-bold">{summary.awayTotalGames}</p>

                  <p className="text-lg font-medium text-primary">+{summary.homeBonusPoints}</p>
                  <p className="text-xs text-muted-foreground self-center">Bonus</p>
                  <p className="text-lg font-medium text-primary">+{summary.awayBonusPoints}</p>

                  <p className="text-2xl font-black">{summary.homeTotal}</p>
                  <p className="text-xs font-semibold text-muted-foreground self-center">TOTAL</p>
                  <p className="text-2xl font-black">{summary.awayTotal}</p>
                </div>
                {summary.winner !== "draw" && (
                  <div className="text-center mt-3">
                    <Badge className="bg-green-500/15 text-green-700">
                      <Trophy className="w-3 h-3 mr-1" />
                      {summary.winner === "home" ? fixture.home_team_code : fixture.away_team_code} wins
                    </Badge>
                  </div>
                )}
              </Card>
            )}

            {/* Signatures */}
            <Card className="p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Pen className="w-4 h-4" /> Captain Signatures
              </h3>
              <SignaturePad label={`Home Captain (${fixture.home_team_code})`} onSave={setHomeSig} />
              <SignaturePad label={`Away Captain (${fixture.away_team_code})`} onSave={setAwaySig} />
            </Card>

            {/* Submit */}
            <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Submit Results
            </Button>
          </>
        )}

        {/* ---- SUBMITTED ---- */}
        {isSubmitted && (
          <>
            {positions.map((pos, idx) => (
              pos.homeCode || pos.awayCode ? (
                <Card key={idx} className="p-3">
                  <p className="text-xs font-semibold mb-1">Position {idx + 1}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                    <p className="truncate">{pos.homeName || pos.homeCode}</p>
                    <p className="truncate">{pos.awayName || pos.awayCode}</p>
                  </div>
                  {pos.scores.map((s, gi) => (
                    <div key={gi} className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-muted-foreground w-14">Game {gi + 1}</span>
                      <span className={s.home > s.away ? "font-bold" : ""}>{s.home}</span>
                      <span className="text-muted-foreground">-</span>
                      <span className={s.away > s.home ? "font-bold" : ""}>{s.away}</span>
                    </div>
                  ))}
                </Card>
              ) : null
            ))}

            <Card className="p-4">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <p className="font-bold text-lg">{fixture.home_team_code}</p>
                <div />
                <p className="font-bold text-lg">{fixture.away_team_code}</p>
                <p className="text-2xl font-black">{summary.homeTotal}</p>
                <p className="text-xs font-semibold text-muted-foreground self-center">TOTAL</p>
                <p className="text-2xl font-black">{summary.awayTotal}</p>
              </div>
            </Card>

            <div className="text-center py-4">
              <Badge className="bg-green-500/15 text-green-700 text-sm px-4 py-1">
                <Check className="w-4 h-4 mr-1" /> Results Submitted
              </Badge>
            </div>
          </>
        )}
      </div>

      <BackToDashboard />
    </div>
  );
}
