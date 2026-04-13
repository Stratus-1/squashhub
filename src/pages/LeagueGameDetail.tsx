import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Check, Loader2, Trophy, Play, Edit3, ArrowLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import type { MarkerConfig } from "@/components/marker/MarkerSetup";
import { cn } from "@/lib/utils";

interface PositionEntry {
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  scores: { home: number; away: number }[];
  completed: boolean;
}

function emptyPositions(): PositionEntry[] {
  return [1, 2, 3, 4].map(() => ({
    homeCode: "", homeName: "", awayCode: "", awayName: "",
    scores: [], completed: false,
  }));
}

/* ---- Compact Signature ---- */
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
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
        {hasContent && <button className="text-[10px] text-primary underline" onClick={clear}>Clear</button>}
      </div>
      <canvas ref={canvasRef} width={200} height={60}
        className="border rounded bg-white w-full touch-none h-[60px]"
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
  const [setupDone, setSetupDone] = useState(false);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const [manualEntry, setManualEntry] = useState<number | null>(null);
  const [homeSig, setHomeSig] = useState("");
  const [awaySig, setAwaySig] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: fixture } = useQuery({
    queryKey: ["league-fixture", fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_league_fixtures").select("*").eq("id", fixtureId!).single();
      if (error) throw error; return data;
    },
    enabled: !!fixtureId,
  });

  const { data: existingResult } = useQuery({
    queryKey: ["league-fixture-result", fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase.from("league_fixture_results" as any).select("*").eq("fixture_id", fixtureId!).maybeSingle();
      if (error) throw error; return data as any;
    },
    enabled: !!fixtureId,
  });

  const { data: existingMatches } = useQuery({
    queryKey: ["league-match-results", fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase.from("league_match_results" as any).select("*").eq("fixture_id", fixtureId!).order("position");
      if (error) throw error; return data as any[];
    },
    enabled: !!fixtureId && !!existingResult,
  });

  useEffect(() => {
    if (existingMatches && existingMatches.length > 0) {
      const loaded = [1, 2, 3, 4].map((pos) => {
        const m = existingMatches.find((r: any) => r.position === pos);
        if (!m) return { homeCode: "", homeName: "", awayCode: "", awayName: "", scores: [], completed: false };
        return {
          homeCode: m.home_player_code || "", homeName: m.home_player_name || "",
          awayCode: m.away_player_code || "", awayName: m.away_player_name || "",
          scores: (m.game_scores as any[]) || [], completed: (m.game_scores as any[])?.length > 0,
        };
      });
      setPositions(loaded);
      setSetupDone(true);
    }
  }, [existingMatches, existingResult]);

  const lookupPlayer = useCallback(async (code: string): Promise<string> => {
    if (!code || code.length < 3) return "";
    const { data } = await supabase.from("platform_league_members" as any).select("first_name, surname").eq("user_code", code.toUpperCase()).maybeSingle();
    if (data) return `${(data as any).first_name} ${(data as any).surname}`;
    return "";
  }, []);

  const updatePosition = (idx: number, field: keyof PositionEntry, value: any) => {
    setPositions((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next; });
  };

  const checkDuplicateCode = (idx: number, side: "home" | "away", code: string): boolean => {
    if (!code || code.length < 2) return false;
    const upperCode = code.toUpperCase();
    for (let i = 0; i < positions.length; i++) {
      if (i === idx) continue;
      if (positions[i].homeCode.toUpperCase() === upperCode || positions[i].awayCode.toUpperCase() === upperCode) {
        return true;
      }
    }
    // Also check within the same row for the other side
    const otherCode = side === "home" ? positions[idx].awayCode : positions[idx].homeCode;
    if (otherCode && otherCode.toUpperCase() === upperCode) return true;
    return false;
  };

  const handleCodeBlur = async (idx: number, side: "home" | "away") => {
    const code = side === "home" ? positions[idx].homeCode : positions[idx].awayCode;
    if (checkDuplicateCode(idx, side, code)) {
      toast.error(`Player ${code.toUpperCase()} is already entered in another position`);
      updatePosition(idx, side === "home" ? "homeCode" : "awayCode", "");
      updatePosition(idx, side === "home" ? "homeName" : "awayName", "");
      return;
    }
    const name = await lookupPlayer(code);
    updatePosition(idx, side === "home" ? "homeName" : "awayName", name);
  };

  const setupValid = positions.some((p) => p.homeCode && p.awayCode);

  // ---- Marker ----
  const startMarking = (posIdx: number) => {
    const pos = positions[posIdx];
    if (!pos.homeCode || !pos.awayCode) { toast.error("Both players required"); return; }
    setActiveMarker(posIdx);
  };

  const markerConfig = useMemo((): MarkerConfig | null => {
    if (activeMarker === null) return null;
    const pos = positions[activeMarker];
    return {
      playerA: { name: pos.homeName || pos.homeCode, number: pos.homeCode, club: fixture?.home_team_code || "" },
      playerB: { name: pos.awayName || pos.awayCode, number: pos.awayCode, club: fixture?.away_team_code || "" },
      isDoubles: false, matchType: "league", scoringFormat: "par11", bestOf: 5, deuceRule: "win_by_2",
      source: "league", sourceId: fixtureId,
    };
  }, [activeMarker, positions, fixture, fixtureId]);

  const handleMarkerComplete = useCallback((result: { games: GameScore[]; winnerId: "a" | "b"; durationSeconds: number }) => {
    if (activeMarker === null) return;
    const scores = result.games.map((g) => ({ home: g.a, away: g.b }));
    setPositions((prev) => { const next = [...prev]; next[activeMarker] = { ...next[activeMarker], scores, completed: true }; return next; });
    toast.success(`Position ${activeMarker + 1} complete!`);
    setActiveMarker(null);
  }, [activeMarker]);

  // ---- Manual ----
  const addGame = (posIdx: number) => {
    setPositions((prev) => { const next = [...prev]; next[posIdx] = { ...next[posIdx], scores: [...next[posIdx].scores, { home: 0, away: 0 }] }; return next; });
  };
  const updateScore = (posIdx: number, gameIdx: number, side: "home" | "away", val: number) => {
    setPositions((prev) => { const next = [...prev]; const scores = [...next[posIdx].scores]; scores[gameIdx] = { ...scores[gameIdx], [side]: val }; next[posIdx] = { ...next[posIdx], scores }; return next; });
  };
  const removeGame = (posIdx: number, gameIdx: number) => {
    setPositions((prev) => { const next = [...prev]; next[posIdx] = { ...next[posIdx], scores: next[posIdx].scores.filter((_, i) => i !== gameIdx) }; return next; });
  };

  // ---- Summary ----
  const summary = useMemo(() => {
    let homeTotalGames = 0, awayTotalGames = 0, homeBonusPoints = 0, awayBonusPoints = 0;
    const posResults: { homeWins: number; awayWins: number }[] = [];
    for (const pos of positions) {
      let hw = 0, aw = 0;
      for (const s of pos.scores) { if (s.home > s.away) hw++; else if (s.away > s.home) aw++; }
      homeTotalGames += hw; awayTotalGames += aw;
      if (hw > aw) homeBonusPoints++; else if (aw > hw) awayBonusPoints++;
      posResults.push({ homeWins: hw, awayWins: aw });
    }
    const homeTotal = homeTotalGames + homeBonusPoints;
    const awayTotal = awayTotalGames + awayBonusPoints;
    const winner = homeTotal > awayTotal ? "home" : awayTotal > homeTotal ? "away" : "draw";
    return { homeTotalGames, awayTotalGames, homeBonusPoints, awayBonusPoints, homeTotal, awayTotal, winner, posResults };
  }, [positions]);

  // ---- Submit ----
  const handleSubmit = async () => {
    if (!fixtureId || !user) return;
    setSubmitting(true);
    try {
      for (let i = 0; i < 4; i++) {
        const pos = positions[i];
        if (!pos.homeCode && !pos.awayCode) continue;
        let hw = 0, aw = 0;
        for (const s of pos.scores) { if (s.home > s.away) hw++; else if (s.away > s.home) aw++; }
        const { error } = await supabase.from("league_match_results" as any).upsert({
          fixture_id: fixtureId, position: i + 1,
          home_player_code: pos.homeCode.toUpperCase(), away_player_code: pos.awayCode.toUpperCase(),
          home_player_name: pos.homeName, away_player_name: pos.awayName,
          game_scores: pos.scores, home_games_won: hw, away_games_won: aw,
          winner: hw > aw ? "home" : aw > hw ? "away" : null,
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
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const isSubmitted = existingResult?.status === "submitted" || existingResult?.status === "confirmed";

  // ---- Active marker fullscreen ----
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
              Pos {activeMarker + 1} · {fixture.home_team_code} vs {fixture.away_team_code}
            </Badge>
          </div>
          <MarkerScoreboard config={markerConfig} onMatchComplete={handleMarkerComplete} onReset={() => setActiveMarker(null)} />
        </div>
      </div>
    );
  }

  // ---- Manual entry overlay ----
  if (manualEntry !== null) {
    const pos = positions[manualEntry];
    return (
      <div className="bottom-nav-safe">
        <SEO title="Enter Scores" description="Manual scores" path={`/league-games/${fixtureId}`} noIndex />
        <div className="px-4 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              updatePosition(manualEntry, "completed", pos.scores.length > 0);
              setManualEntry(null);
            }}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <span className="text-sm font-semibold">Position {manualEntry + 1} — Manual Scores</span>
          </div>
          <div className="text-sm mb-2">
            <span className="font-medium">{pos.homeName || pos.homeCode}</span>
            <span className="text-muted-foreground mx-2">vs</span>
            <span className="font-medium">{pos.awayName || pos.awayCode}</span>
          </div>
          {pos.scores.map((s, gi) => (
            <div key={gi} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-14">Game {gi + 1}</span>
              <Input type="number" min={0} value={s.home} onChange={(e) => updateScore(manualEntry, gi, "home", parseInt(e.target.value) || 0)} className="w-16 text-center text-sm" />
              <span className="text-xs text-muted-foreground">-</span>
              <Input type="number" min={0} value={s.away} onChange={(e) => updateScore(manualEntry, gi, "away", parseInt(e.target.value) || 0)} className="w-16 text-center text-sm" />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeGame(manualEntry, gi)}>×</Button>
            </div>
          ))}
          {pos.scores.length < 5 && (
            <Button variant="outline" size="sm" className="text-xs" onClick={() => addGame(manualEntry)}>+ Add Game</Button>
          )}
          <Button className="w-full mt-2" onClick={() => { updatePosition(manualEntry, "completed", pos.scores.length > 0); setManualEntry(null); }}>
            <Check className="w-4 h-4 mr-1" /> Done
          </Button>
        </div>
      </div>
    );
  }

  // ---- Main scorecard view (compact, matching NSA form) ----
  const homeCode = fixture.home_team_code || "";
  const awayCode = fixture.away_team_code || "";

  return (
    <div className="bottom-nav-safe">
      <SEO title="League Scorecard" description="League fixture scorecard" path={`/league-games/${fixtureId}`} noIndex />
      <PageHeader title="League Scorecard" subtitle={`${homeCode} vs ${awayCode}`} />

      <div className="px-3 space-y-3 pb-8">
        {/* Header row — like the paper form */}
        <div className="border rounded-lg overflow-hidden text-xs">
          {/* League / Date row */}
          <div className="grid grid-cols-2 border-b bg-muted/50">
            <div className="p-1.5 border-r">
              <span className="text-muted-foreground">League:</span>{" "}
              <span className="font-semibold">{fixture.division}</span>
            </div>
            <div className="p-1.5">
              <span className="text-muted-foreground">Date:</span>{" "}
              <span className="font-semibold">{format(parseISO(fixture.fixture_date), "dd MMM yyyy")}</span>
            </div>
          </div>
          {/* Teams row */}
          <div className="grid grid-cols-2 border-b">
            <div className="p-1.5 border-r bg-primary/5">
              <span className="text-[10px] text-muted-foreground block">HOME TEAM</span>
              <span className="font-bold text-sm">{homeCode}</span>
            </div>
            <div className="p-1.5 bg-secondary/30">
              <span className="text-[10px] text-muted-foreground block">VISITORS TEAM</span>
              <span className="font-bold text-sm">{awayCode}</span>
            </div>
          </div>
          {/* Venue */}
          <div className="p-1.5 text-[10px] text-muted-foreground bg-muted/30">
            Venue: {fixture.venue_name}
          </div>
        </div>

        {/* Column headers for the scorecard table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/70 text-[10px] font-semibold">
                <th className="p-1 text-left w-6">#</th>
                <th className="p-1 text-left w-8"></th>
                <th className="p-1 text-left">NSF</th>
                <th className="p-1 text-left">Player</th>
                <th className="p-1 text-center w-6">1</th>
                <th className="p-1 text-center w-6">2</th>
                <th className="p-1 text-center w-6">3</th>
                <th className="p-1 text-center w-6">4</th>
                <th className="p-1 text-center w-6">5</th>
                <th className="p-1 text-center w-7 border-l">P</th>
                <th className="p-1 text-center w-7">G</th>
                <th className="p-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, idx) => {
                const hasPlayers = pos.homeCode && pos.awayCode;
                const pr = summary.posResults[idx];
                return (
                  <tr key={idx} className="border-t">
                    {/* Position number spans 2 visual rows but we use a single row with stacked content */}
                    <td className="p-1 text-center font-bold text-sm align-top border-r" rowSpan={1}>
                      {idx + 1}
                    </td>
                    <td className="p-0" colSpan={11}>
                      {/* Home row */}
                      <div className={cn("grid items-center border-b", setupDone ? "grid-cols-[28px_60px_1fr_repeat(5,24px)_24px_24px_32px]" : "grid-cols-[28px_80px_1fr_32px]")}>
                        <span className="text-[10px] font-semibold text-center bg-primary/10 py-1">H</span>
                        {!setupDone ? (
                          <>
                            <Input value={pos.homeCode} onChange={(e) => updatePosition(idx, "homeCode", e.target.value.toUpperCase())}
                              onBlur={() => handleCodeBlur(idx, "home")} placeholder="NSF#"
                              className="h-7 text-xs font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700">{pos.homeName}</span>
                            <span />
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-mono px-1 text-muted-foreground">{pos.homeCode}</span>
                            <span className="text-xs truncate px-1 font-medium">{pos.homeName || "—"}</span>
                            {[0, 1, 2, 3, 4].map((gi) => (
                              <span key={gi} className={cn("text-center text-xs py-0.5", pos.scores[gi] && pos.scores[gi].home > pos.scores[gi].away ? "font-bold" : "text-muted-foreground")}>
                                {pos.scores[gi]?.home ?? ""}
                              </span>
                            ))}
                            <span className="text-center text-xs font-semibold border-l py-0.5">{pr.homeWins > pr.awayWins ? "✓" : ""}</span>
                            <span className="text-center text-xs font-bold py-0.5">{pr.homeWins || ""}</span>
                            <span />
                          </>
                        )}
                      </div>
                      {/* Away row */}
                      <div className={cn("grid items-center", setupDone ? "grid-cols-[28px_60px_1fr_repeat(5,24px)_24px_24px_32px]" : "grid-cols-[28px_80px_1fr_32px]")}>
                        <span className="text-[10px] font-semibold text-center bg-secondary/30 py-1">V</span>
                        {!setupDone ? (
                          <>
                            <Input value={pos.awayCode} onChange={(e) => updatePosition(idx, "awayCode", e.target.value.toUpperCase())}
                              onBlur={() => handleCodeBlur(idx, "away")} placeholder="NSF#"
                              className="h-7 text-xs font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700">{pos.awayName}</span>
                            <span />
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] font-mono px-1 text-muted-foreground">{pos.awayCode}</span>
                            <span className="text-xs truncate px-1 font-medium">{pos.awayName || "—"}</span>
                            {[0, 1, 2, 3, 4].map((gi) => (
                              <span key={gi} className={cn("text-center text-xs py-0.5", pos.scores[gi] && pos.scores[gi].away > pos.scores[gi].home ? "font-bold" : "text-muted-foreground")}>
                                {pos.scores[gi]?.away ?? ""}
                              </span>
                            ))}
                            <span className="text-center text-xs font-semibold border-l py-0.5">{pr.awayWins > pr.homeWins ? "✓" : ""}</span>
                            <span className="text-center text-xs font-bold py-0.5">{pr.awayWins || ""}</span>
                            {/* Action buttons */}
                            <span className="flex items-center justify-center">
                              {hasPlayers && !pos.completed && !isSubmitted && (
                                <button onClick={() => startMarking(idx)} className="text-primary hover:text-primary/80" title="Mark game">
                                  <Play className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {hasPlayers && !isSubmitted && (pos.completed || !pos.completed) && (
                                <button onClick={() => { if (pos.scores.length === 0) addGame(idx); setManualEntry(idx); }}
                                  className="text-muted-foreground hover:text-foreground ml-0.5" title="Enter/edit scores">
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Totals rows */}
              {setupDone && (
                <>
                  <tr className="border-t bg-muted/40 font-semibold text-xs">
                    <td colSpan={2} className="p-1 text-right">SUB TOTALS</td>
                    <td colSpan={7} />
                    <td className="text-center p-1 border-l">{summary.homeTotalGames}</td>
                    <td className="text-center p-1" />
                    <td className="text-center p-1">{summary.awayTotalGames}</td>
                  </tr>
                  <tr className="bg-muted/40 font-semibold text-xs">
                    <td colSpan={2} className="p-1 text-right">BONUS POINTS</td>
                    <td colSpan={7} />
                    <td className="text-center p-1 border-l">{summary.homeBonusPoints}</td>
                    <td className="text-center p-1" />
                    <td className="text-center p-1">{summary.awayBonusPoints}</td>
                  </tr>
                  <tr className="bg-muted/60 font-bold text-sm">
                    <td colSpan={2} className="p-1 text-right">TOTAL</td>
                    <td colSpan={7} />
                    <td className="text-center p-1 border-l">{summary.homeTotal}</td>
                    <td className="text-center p-1" />
                    <td className="text-center p-1">{summary.awayTotal}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Winner badge */}
        {setupDone && summary.winner !== "draw" && positions.some(p => p.completed) && (
          <div className="text-center">
            <Badge className="bg-green-500/15 text-green-700 text-xs">
              <Trophy className="w-3 h-3 mr-1" />
              {summary.winner === "home" ? homeCode : awayCode} wins
            </Badge>
          </div>
        )}

        {/* Setup / scoring buttons */}
        {!setupDone && !isSubmitted && (
          <Button className="w-full" size="sm" onClick={() => { if (!setupValid) { toast.error("Enter at least one complete position"); return; } setSetupDone(true); }} disabled={!setupValid}>
            <Check className="w-4 h-4 mr-1" /> Complete Setup
          </Button>
        )}

        {setupDone && !isSubmitted && (
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setSetupDone(false)}>
            <ArrowLeft className="w-3 h-3 mr-1" /> Edit Players
          </Button>
        )}

        {/* Signatures — side by side like the paper form */}
        {setupDone && !isSubmitted && (
          <div className="flex gap-2">
            <SignaturePad label={`Home Captain`} onSave={setHomeSig} />
            <SignaturePad label={`Away Captain`} onSave={setAwaySig} />
          </div>
        )}

        {/* Submit */}
        {setupDone && !isSubmitted && (
          <Button className="w-full" size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
            Submit Results
          </Button>
        )}

        {isSubmitted && (
          <div className="text-center py-2">
            <Badge className="bg-green-500/15 text-green-700 text-sm px-4 py-1">
              <Check className="w-4 h-4 mr-1" /> Results Submitted
            </Badge>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          One (1) bonus point for each match winner in winning team
        </p>
      </div>

      <BackToDashboard />
    </div>
  );
}
