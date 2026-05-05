import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SEO } from "@/components/SEO";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Check, Loader2, Trophy, Play, Edit3, ArrowLeft, Save, ArrowLeftRight, UserX, RotateCcw, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import type { MarkerConfig } from "@/components/marker/MarkerSetup";
import { cn } from "@/lib/utils";
import { LineupSwapDialog, type SwapCandidate } from "@/components/league-games/LineupSwapDialog";

interface PositionEntry {
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  scores: { home: number; away: number }[];
  completed: boolean;
  isForfeit?: boolean;
  forfeitSide?: "home" | "away" | null;
}

// Penalty points deducted from a team when one of their players forfeits a position
const FORFEIT_PENALTY_POINTS = 2;

function emptyPositions(): PositionEntry[] {
  return [1, 2, 3, 4].map(() => ({
    homeCode: "", homeName: "", awayCode: "", awayName: "",
    scores: [], completed: false, isForfeit: false, forfeitSide: null,
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
  // Indices of completed games (within the current manualEntry rubber) that the
  // user has explicitly chosen to edit. All other completed games are locked.
  const [manualUnlocked, setManualUnlocked] = useState<Set<number>>(new Set());
  const [homeSig, setHomeSig] = useState("");
  const [awaySig, setAwaySig] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{ idx: number; side: "home" | "away" } | null>(null);

  // Match format config
  const [scoringFormat, setScoringFormat] = useState<"par11" | "par15">("par11");
  const [bestOf, setBestOf] = useState<3 | 5>(5);
  const tournamentMatchId = fixtureId?.startsWith("champ-") ? fixtureId.slice(6) : null;

  const { data: tournamentRedirect } = useQuery({
    queryKey: ["league-game-tournament-redirect", tournamentMatchId],
    queryFn: async () => {
      if (!tournamentMatchId) return null;
      const { data, error } = await supabase
        .from("club_champs_matches" as any)
        .select("champ_id")
        .eq("id", tournamentMatchId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { champ_id: string } | null;
    },
    enabled: !!tournamentMatchId,
  });

  useEffect(() => {
    if (tournamentRedirect?.champ_id) {
      navigate(`/club-champs/${tournamentRedirect.champ_id}`, { replace: true });
    }
  }, [navigate, tournamentRedirect]);

  const { data: fixture } = useQuery({
    queryKey: ["league-fixture", fixtureId],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_league_fixtures").select("*").eq("id", fixtureId!).single();
      if (error) throw error; return data;
    },
    enabled: !!fixtureId && !tournamentMatchId,
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
    enabled: !!fixtureId,
  });

  useEffect(() => {
    if (existingMatches && existingMatches.length > 0) {
      const loaded = [1, 2, 3, 4].map((pos) => {
        const m = existingMatches.find((r: any) => r.position === pos);
        if (!m) return { homeCode: "", homeName: "", awayCode: "", awayName: "", scores: [], completed: false, isForfeit: false, forfeitSide: null };
        return {
          homeCode: m.home_player_code || "", homeName: m.home_player_name || "",
          awayCode: m.away_player_code || "", awayName: m.away_player_name || "",
          scores: (m.game_scores as any[]) || [], completed: (m.game_scores as any[])?.length > 0 || !!m.is_forfeit,
          isForfeit: !!m.is_forfeit,
          forfeitSide: (m.forfeit_side as "home" | "away" | null) ?? null,
        };
      });
      setPositions(loaded);
      setSetupDone(true);
    }
  }, [existingMatches]);

  // ---- Prefill lineup from Fill-Up Leagues / registrations for known club teams ----
  const { data: prefillLineup } = useQuery({
    queryKey: ["league-fixture-prefill", fixtureId, fixture?.home_team_code, fixture?.away_team_code, fixture?.fixture_date],
    queryFn: async () => {
      if (!fixture) return null;
      const codes = [fixture.home_team_code, fixture.away_team_code].filter(Boolean) as string[];
      if (codes.length === 0) return null;

      // Find leagues in our system whose code matches either team code
      const { data: leagues } = await (supabase as any)
        .from("leagues").select("id, code, club_id").in("code", codes);
      if (!leagues || leagues.length === 0) return null;

      const leagueIds = leagues.map((l: any) => l.id);
      const clubIds = [...new Set(leagues.map((l: any) => l.club_id).filter(Boolean))];

      // Compute squash week_start_date from fixture_date using the club's league_week_start_dow
      let weekStartDate: string | null = null;
      if (fixture.fixture_date && clubIds.length > 0) {
        const { data: clubRow } = await (supabase as any)
          .from("clubs").select("league_week_start_dow").eq("id", clubIds[0]).maybeSingle();
        const startDow = clubRow?.league_week_start_dow ?? 3; // default Wed
        const fxDate = parseISO(fixture.fixture_date);
        const fxDow = fxDate.getDay();
        const diff = (fxDow - startDow + 7) % 7;
        const ws = new Date(fxDate);
        ws.setDate(ws.getDate() - diff);
        weekStartDate = format(ws, "yyyy-MM-dd");
      }

      // 1) Captain's Fill-Up Leagues lineup for that squash week
      let weekLineups: any[] = [];
      if (weekStartDate) {
        const { data } = await (supabase as any)
          .from("league_week_lineups")
          .select("league_id, position, club_member_id")
          .eq("week_start_date", weekStartDate)
          .in("league_id", leagueIds);
        weekLineups = data || [];
      }

      // 2) Per-fixture lineups (legacy / explicit per-fixture override)
      const { data: fixtureLineups } = await (supabase as any)
        .from("league_fixture_lineups")
        .select("league_id, position, club_member_id")
        .eq("fixture_id", fixtureId!)
        .in("league_id", leagueIds);

      // 3) Registrations as final fallback (player_rank ordered, scoped to these team leagues)
      const { data: regs } = await (supabase as any)
        .from("member_league_registrations")
        .select("league_id, club_member_id, player_rank, league_association_number, ssa_number")
        .in("league_id", leagueIds);

      // Collect all member ids needed
      const memberIds = new Set<string>();
      weekLineups.forEach((l: any) => memberIds.add(l.club_member_id));
      (fixtureLineups || []).forEach((l: any) => memberIds.add(l.club_member_id));
      (regs || []).forEach((r: any) => memberIds.add(r.club_member_id));
      if (memberIds.size === 0) return null;

      // Cross-league NSF lookup: a player guested from another league still has an NSF in their own registration
      const { data: anyRegs } = await (supabase as any)
        .from("member_league_registrations")
        .select("club_member_id, league_association_number, ssa_number")
        .in("club_member_id", [...memberIds]);
      const nsfByMember = new Map<string, string>();
      for (const r of (anyRegs || []) as any[]) {
        const code = (r.league_association_number || r.ssa_number || "").toString().toUpperCase();
        if (code && !nsfByMember.has(r.club_member_id)) nsfByMember.set(r.club_member_id, code);
      }

      const { data: members } = await supabase
        .from("club_members")
        .select("id, name, club_member_number")
        .in("id", [...memberIds]);
      const memberMap = new Map((members || []).map((m: any) => [m.id, m]));

      // Build per-team-code positions [1..4]
      const result: Record<string, Array<{ code: string; name: string }>> = {};
      for (const code of codes) {
        const slots: Array<{ code: string; name: string }> = [
          { code: "", name: "" }, { code: "", name: "" }, { code: "", name: "" }, { code: "", name: "" },
        ];
        const matchingLeagues = leagues.filter((l: any) => l.code === code).map((l: any) => l.id);

        const regByMember = new Map<string, any>();
        (regs || [])
          .filter((r: any) => matchingLeagues.includes(r.league_id))
          .forEach((r: any) => regByMember.set(r.club_member_id, r));

        const fillSlot = (pos: number, memberId: string) => {
          if (pos < 1 || pos > 4) return;
          if (slots[pos - 1].code || slots[pos - 1].name) return; // don't overwrite higher-priority entry
          const m = memberMap.get(memberId) as any;
          const reg = regByMember.get(memberId);
          const code =
            (reg?.league_association_number || reg?.ssa_number || nsfByMember.get(memberId) || m?.club_member_number || "")
              .toString()
              .toUpperCase();
          slots[pos - 1] = { code, name: m?.name || "" };
        };

        // Priority 1: Fill-Up Leagues week lineup
        weekLineups
          .filter((l: any) => matchingLeagues.includes(l.league_id))
          .forEach((l: any) => fillSlot(l.position, l.club_member_id));

        // Priority 2: explicit per-fixture lineup
        (fixtureLineups || [])
          .filter((l: any) => matchingLeagues.includes(l.league_id))
          .forEach((l: any) => fillSlot(l.position, l.club_member_id));

        // Priority 3: registrations by player_rank for any unfilled positions
        const teamRegs = (regs || [])
          .filter((r: any) => matchingLeagues.includes(r.league_id))
          .sort((a: any, b: any) => (a.player_rank || 99) - (b.player_rank || 99));
        let regIdx = 0;
        for (let i = 0; i < 4; i++) {
          if (slots[i].code || slots[i].name) continue;
          while (regIdx < teamRegs.length) {
            const r = teamRegs[regIdx++];
            const m = memberMap.get(r.club_member_id) as any;
            const code = (r.league_association_number || r.ssa_number || m?.club_member_number || "").toString().toUpperCase();
            const name = m?.name || "";
            if (!code && !name) continue;
            slots[i] = { code, name };
            break;
          }
        }
        result[code] = slots;
      }
      return result;
    },
    enabled: !!fixture && !!fixtureId,
    staleTime: 60 * 1000,
  });

  // Apply prefill ONLY when there are no existing match rows yet (fresh setup)
  useEffect(() => {
    if (!prefillLineup || !fixture) return;
    if (existingMatches && existingMatches.length > 0) return; // don't overwrite saved setup
    const homeSlots = prefillLineup[fixture.home_team_code] || [];
    const awaySlots = prefillLineup[fixture.away_team_code] || [];
    const hasAny = [...homeSlots, ...awaySlots].some((s) => s.code || s.name);
    if (!hasAny) return;
    setPositions((prev) => prev.map((p, i) => {
      // Don't overwrite values the user has already typed
      const home = homeSlots[i] || { code: "", name: "" };
      const away = awaySlots[i] || { code: "", name: "" };
      return {
        ...p,
        homeCode: p.homeCode || home.code,
        homeName: p.homeName || home.name,
        awayCode: p.awayCode || away.code,
        awayName: p.awayName || away.name,
      };
    }));
  }, [prefillLineup, existingMatches, fixture]);

  // Load saved match format from existing result
  useEffect(() => {
    if (existingResult?.match_format) {
      const fmt = existingResult.match_format as any;
      if (fmt.scoringFormat) setScoringFormat(fmt.scoringFormat);
      if (fmt.bestOf) setBestOf(fmt.bestOf);
    }
  }, [existingResult]);

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

  // Map of currently-assigned NSF codes -> location, for the swap dialog
  const buildInUseMap = useCallback((side: "home" | "away") => {
    const map = new Map<string, { side: "home" | "away"; position: number }>();
    positions.forEach((p, i) => {
      if (p.homeCode) map.set(p.homeCode.toUpperCase(), { side: "home", position: i + 1 });
      if (p.awayCode) map.set(p.awayCode.toUpperCase(), { side: "away", position: i + 1 });
    });
    return map;
  }, [positions]);

  const handleSwap = useCallback(async (c: SwapCandidate) => {
    if (!swapTarget) return;
    const { idx, side } = swapTarget;
    const codeUpper = c.code.toUpperCase();
    const targetCodeKey = side === "home" ? "homeCode" : "awayCode";
    const targetNameKey = side === "home" ? "homeName" : "awayName";

    setPositions((prev) => {
      const next = prev.map((p) => ({ ...p }));

      // Find if candidate is already in lineup somewhere → that becomes the displaced slot
      let existingIdx = -1;
      let existingSide: "home" | "away" | null = null;
      next.forEach((p, i) => {
        if (p.homeCode.toUpperCase() === codeUpper) { existingIdx = i; existingSide = "home"; }
        else if (p.awayCode.toUpperCase() === codeUpper) { existingIdx = i; existingSide = "away"; }
      });

      const targetOldCode = next[idx][targetCodeKey];
      const targetOldName = next[idx][targetNameKey];

      // Place new player at target
      next[idx] = { ...next[idx], [targetCodeKey]: codeUpper, [targetNameKey]: c.name };

      // If candidate was elsewhere on the same side → swap (move displaced player into candidate's old spot)
      if (existingIdx >= 0 && existingSide === side && existingIdx !== idx) {
        const oldCodeKey = existingSide === "home" ? "homeCode" : "awayCode";
        const oldNameKey = existingSide === "home" ? "homeName" : "awayName";
        next[existingIdx] = { ...next[existingIdx], [oldCodeKey]: targetOldCode, [oldNameKey]: targetOldName };
      } else if (existingIdx >= 0 && existingSide && existingSide !== side) {
        // Candidate was on the OTHER team — clear that other-side slot (shouldn't happen, but safe)
        const oldCodeKey = existingSide === "home" ? "homeCode" : "awayCode";
        const oldNameKey = existingSide === "home" ? "homeName" : "awayName";
        next[existingIdx] = { ...next[existingIdx], [oldCodeKey]: "", [oldNameKey]: "" };
      }
      return next;
    });

    setSwapTarget(null);
    toast.success(`Player swapped — remember to save setup`);

    // If setup already saved, persist immediately
    if (setupDone && fixtureId && user) {
      try {
        // Re-derive the updated positions snapshot (state hasn't flushed yet, so recompute manually)
        setTimeout(async () => {
          for (let i = 0; i < 4; i++) {
            const p = positions[i];
            if (!p.homeCode && !p.awayCode) continue;
            await supabase.from("league_match_results" as any).upsert({
              fixture_id: fixtureId, position: i + 1,
              home_player_code: (i === idx && side === "home" ? codeUpper : p.homeCode.toUpperCase()),
              away_player_code: (i === idx && side === "away" ? codeUpper : p.awayCode.toUpperCase()),
              home_player_name: (i === idx && side === "home" ? c.name : p.homeName),
              away_player_name: (i === idx && side === "away" ? c.name : p.awayName),
              game_scores: p.scores, home_games_won: 0, away_games_won: 0,
              winner: null,
            } as any, { onConflict: "fixture_id,position" });
          }
          queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
        }, 50);
      } catch (e) { console.error("Swap persist failed", e); }
    }
  }, [swapTarget, setupDone, fixtureId, user, positions, queryClient]);

  const handleClearSlot = useCallback((idx: number, side: "home" | "away") => {
    updatePosition(idx, side === "home" ? "homeCode" : "awayCode", "");
    updatePosition(idx, side === "home" ? "homeName" : "awayName", "");
  }, []);


  // ---- Auto-save a single position's scores to DB ----
  const persistPositionScores = useCallback(async (posIdx: number, updatedPos: PositionEntry) => {
    if (!fixtureId || !user) return;
    try {
      let hw = 0, aw = 0;
      for (const s of updatedPos.scores) { if (s.home > s.away) hw++; else if (s.away > s.home) aw++; }
      await supabase.from("league_match_results" as any).upsert({
        fixture_id: fixtureId, position: posIdx + 1,
        home_player_code: updatedPos.homeCode.toUpperCase(), away_player_code: updatedPos.awayCode.toUpperCase(),
        home_player_name: updatedPos.homeName, away_player_name: updatedPos.awayName,
        game_scores: updatedPos.scores, home_games_won: hw, away_games_won: aw,
        winner: hw > aw ? "home" : aw > hw ? "away" : null,
        is_forfeit: !!updatedPos.isForfeit,
        forfeit_side: updatedPos.forfeitSide ?? null,
      } as any, { onConflict: "fixture_id,position" });
      // Also update fixture result summary
      queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
      queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
      queryClient.invalidateQueries({ queryKey: ["league-fixture-results"] });
      queryClient.invalidateQueries({ queryKey: ["assoc-fixture-results"] });
    } catch (err: any) {
      console.error("Auto-save failed:", err);
    }
  }, [fixtureId, user, queryClient]);

  // ---- Mark a position as a forfeit (player unavailable) ----
  // Awards the non-forfeiting side 3 clean games (15-0, 15-0, 15-0) and applies a
  // penalty of FORFEIT_PENALTY_POINTS to the forfeiting team in the summary.
  const markForfeit = useCallback((posIdx: number, side: "home" | "away") => {
    const winningGame = side === "home"
      ? { home: 0, away: 15 }   // home forfeits → away wins each game 15-0
      : { home: 15, away: 0 };
    const games = bestOf === 5 ? 3 : 2; // win majority of best-of
    const scores = Array.from({ length: games }, () => ({ ...winningGame }));
    const current = positions[posIdx];
    // If the forfeiting side has no player listed, fill with a "—" placeholder so
    // the row still persists and shows the no-show clearly.
    const updatedPos: PositionEntry = {
      ...current,
      homeCode: side === "home" && !current.homeCode ? "—" : current.homeCode,
      homeName: side === "home" && !current.homeName ? "No player" : current.homeName,
      awayCode: side === "away" && !current.awayCode ? "—" : current.awayCode,
      awayName: side === "away" && !current.awayName ? "No player" : current.awayName,
      scores,
      completed: true,
      isForfeit: true,
      forfeitSide: side,
    };
    setPositions((prev) => { const next = [...prev]; next[posIdx] = updatedPos; return next; });
    persistPositionScores(posIdx, updatedPos);
    toast.success(`Position ${posIdx + 1} forfeited — ${side === "home" ? "away" : "home"} team awarded a clean sweep`);
  }, [positions, bestOf, persistPositionScores]);

  // ---- Undo a forfeit: clears scores, completion, and forfeit flags so the
  // position can be played/marked normally again. ----
  const undoForfeit = useCallback((posIdx: number) => {
    const current = positions[posIdx];
    if (!current?.isForfeit) return;
    const updatedPos: PositionEntry = {
      ...current,
      // Clear placeholder "—"/"No player" entries inserted by markForfeit
      homeCode: current.homeCode === "—" ? "" : current.homeCode,
      homeName: current.homeName === "No player" ? "" : current.homeName,
      awayCode: current.awayCode === "—" ? "" : current.awayCode,
      awayName: current.awayName === "No player" ? "" : current.awayName,
      scores: [],
      completed: false,
      isForfeit: false,
      forfeitSide: null,
    };
    setPositions((prev) => { const next = [...prev]; next[posIdx] = updatedPos; return next; });
    persistPositionScores(posIdx, updatedPos);
    toast.success(`Position ${posIdx + 1} forfeit undone`);
  }, [positions, persistPositionScores]);

  // ---- Clear scores for a completed (non-forfeit) position so it can be re-entered. ----
  const clearScores = useCallback((posIdx: number) => {
    const current = positions[posIdx];
    if (!current) return;
    const updatedPos: PositionEntry = {
      ...current,
      scores: [],
      completed: false,
      isForfeit: false,
      forfeitSide: null,
    };
    setPositions((prev) => { const next = [...prev]; next[posIdx] = updatedPos; return next; });
    persistPositionScores(posIdx, updatedPos);
    toast.success(`Position ${posIdx + 1} scores cleared`);
  }, [positions, persistPositionScores]);


  // ---- Save Setup (persist player data without submitting results) ----
  const handleSaveSetup = async () => {
    if (!fixtureId || !user) return;
    setSavingSetup(true);
    try {
      for (let i = 0; i < 4; i++) {
        const pos = positions[i];
        if (!pos.homeCode && !pos.awayCode) continue;
        const { error } = await supabase.from("league_match_results" as any).upsert({
          fixture_id: fixtureId, position: i + 1,
          home_player_code: pos.homeCode.toUpperCase(), away_player_code: pos.awayCode.toUpperCase(),
          home_player_name: pos.homeName, away_player_name: pos.awayName,
          game_scores: pos.scores.length > 0 ? pos.scores : [], home_games_won: 0, away_games_won: 0,
          winner: null,
        } as any, { onConflict: "fixture_id,position" });
        if (error) throw error;
      }
      const { error: sumErr } = await supabase.from("league_fixture_results" as any).upsert({
        fixture_id: fixtureId,
        home_total_games: 0, away_total_games: 0,
        home_bonus_points: 0, away_bonus_points: 0,
        home_total_points: 0, away_total_points: 0,
        winner: null, status: "setup",
        submitted_by: user.id,
        match_format: { scoringFormat, bestOf },
      } as any, { onConflict: "fixture_id" });
      if (sumErr) throw sumErr;
      queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
      queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
      toast.success("Setup saved! You can now mark games.");
      setSetupDone(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to save setup");
    } finally {
      setSavingSetup(false);
    }
  };

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
      isDoubles: false, matchType: "league", scoringFormat, bestOf, deuceRule: "win_by_2",
      source: "league", sourceId: fixtureId,
    };
  }, [activeMarker, positions, fixture, fixtureId, scoringFormat, bestOf]);

  const handleMarkerComplete = useCallback((result: { games: GameScore[]; winnerId: "a" | "b"; durationSeconds: number }) => {
    if (activeMarker === null) return;
    const scores = result.games.map((g) => ({ home: g.a, away: g.b }));
    const updatedPos = { ...positions[activeMarker], scores, completed: true };
    setPositions((prev) => { const next = [...prev]; next[activeMarker] = updatedPos; return next; });
    // Auto-save to DB
    persistPositionScores(activeMarker, updatedPos);
    toast.success(`Position ${activeMarker + 1} complete!`);
    setActiveMarker(null);
  }, [activeMarker, positions, persistPositionScores]);

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
    let homeTotalGames = 0, awayTotalGames = 0;
    let homeMatchWins = 0, awayMatchWins = 0;
    let homePenaltyPoints = 0, awayPenaltyPoints = 0;
    const posResults: { homeWins: number; awayWins: number }[] = [];
    for (const pos of positions) {
      let hw = 0, aw = 0;
      for (const s of pos.scores) { if (s.home > s.away) hw++; else if (s.away > s.home) aw++; }
      homeTotalGames += hw; awayTotalGames += aw;
      if (hw > aw) homeMatchWins++; else if (aw > hw) awayMatchWins++;
      posResults.push({ homeWins: hw, awayWins: aw });
      // Forfeit penalty: deduct points from the side whose player did not show up
      if (pos.isForfeit && pos.forfeitSide === "home") homePenaltyPoints += FORFEIT_PENALTY_POINTS;
      if (pos.isForfeit && pos.forfeitSide === "away") awayPenaltyPoints += FORFEIT_PENALTY_POINTS;
    }
    // Bonus points: only the overall fixture winner gets them (= their match wins count)
    const homeGamesOnly = homeTotalGames;
    const awayGamesOnly = awayTotalGames;
    // Determine fixture winner based on total games + match wins first
    const homeRaw = homeGamesOnly + homeMatchWins;
    const awayRaw = awayGamesOnly + awayMatchWins;
    const fixtureWinner = homeRaw > awayRaw ? "home" : awayRaw > homeRaw ? "away" : (homeMatchWins > awayMatchWins ? "home" : awayMatchWins > homeMatchWins ? "away" : "draw");
    // Only the winner gets bonus points
    const homeBonusPoints = fixtureWinner === "home" ? homeMatchWins : 0;
    const awayBonusPoints = fixtureWinner === "away" ? awayMatchWins : 0;
    const homeTotal = homeTotalGames + homeBonusPoints - homePenaltyPoints;
    const awayTotal = awayTotalGames + awayBonusPoints - awayPenaltyPoints;
    const winner = fixtureWinner;
    return { homeTotalGames, awayTotalGames, homeBonusPoints, awayBonusPoints, homePenaltyPoints, awayPenaltyPoints, homeTotal, awayTotal, winner, posResults };
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
          is_forfeit: !!pos.isForfeit,
          forfeit_side: pos.forfeitSide ?? null,
        } as any, { onConflict: "fixture_id,position" });
        if (error) throw error;
      }
      const { error: sumErr } = await supabase.from("league_fixture_results" as any).upsert({
        fixture_id: fixtureId,
        home_total_games: summary.homeTotalGames, away_total_games: summary.awayTotalGames,
        home_bonus_points: summary.homeBonusPoints, away_bonus_points: summary.awayBonusPoints,
        home_penalty_points: summary.homePenaltyPoints, away_penalty_points: summary.awayPenaltyPoints,
        home_total_points: summary.homeTotal, away_total_points: summary.awayTotal,
        winner: summary.winner, status: homeSig && awaySig ? "submitted" : "draft",
        home_captain_signature: homeSig || null, away_captain_signature: awaySig || null,
        submitted_by: user.id, submitted_at: new Date().toISOString(),
        match_format: { scoringFormat, bestOf },
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
    // A game is "decided" once one side has scored more than the other (i.e. a clear winner).
    const isDecided = (s: { home: number; away: number }) => s.home !== s.away && (s.home > 0 || s.away > 0);
    const closeOverlay = () => {
      const updatedPos = { ...positions[manualEntry], completed: pos.scores.length > 0 };
      updatePosition(manualEntry, "completed", pos.scores.length > 0);
      if (pos.scores.length > 0) persistPositionScores(manualEntry, updatedPos);
      setManualUnlocked(new Set());
      setManualEntry(null);
    };
    return (
      <div className="bottom-nav-safe">
        <SEO title="Enter Scores" description="Manual scores" path={`/league-games/${fixtureId}`} noIndex />
        <div className="px-4 pt-4 space-y-3 max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={closeOverlay}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <span className="text-sm font-semibold">Position {manualEntry + 1} — Manual Scores</span>
          </div>
          <div className="text-sm mb-1">
            <span className="font-medium">{pos.homeName || pos.homeCode}</span>
            <span className="text-muted-foreground mx-2">vs</span>
            <span className="font-medium">{pos.awayName || pos.awayCode}</span>
          </div>
          <div className="text-xs text-muted-foreground mb-1">
            Format: {scoringFormat === "par11" ? "PAR 11" : "PAR 15"} · Best of {bestOf}
          </div>
          {pos.scores.map((s, gi) => {
            const decided = isDecided(s);
            const unlocked = manualUnlocked.has(gi);
            const locked = decided && !unlocked;
            return (
              <div
                key={gi}
                className={cn(
                  "flex items-center gap-2 p-1.5 rounded border",
                  locked ? "bg-muted/50 border-muted" : "bg-background border-primary/40"
                )}
              >
                <span className="text-xs font-semibold w-16">Game {gi + 1}{locked && <span className="ml-1 text-[10px] text-muted-foreground">✓</span>}</span>
                <Input
                  type="number" min={0} value={s.home}
                  onChange={(e) => updateScore(manualEntry, gi, "home", parseInt(e.target.value) || 0)}
                  className={cn("w-16 text-center text-sm", locked && "opacity-60 cursor-not-allowed")}
                  disabled={locked}
                />
                <span className="text-xs text-muted-foreground">-</span>
                <Input
                  type="number" min={0} value={s.away}
                  onChange={(e) => updateScore(manualEntry, gi, "away", parseInt(e.target.value) || 0)}
                  className={cn("w-16 text-center text-sm", locked && "opacity-60 cursor-not-allowed")}
                  disabled={locked}
                />
                {locked ? (
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-[10px]"
                    onClick={() => setManualUnlocked((prev) => { const n = new Set(prev); n.add(gi); return n; })}
                    title="Unlock to edit completed game"
                  >
                    Edit
                  </Button>
                ) : (
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                    onClick={() => {
                      removeGame(manualEntry, gi);
                      setManualUnlocked((prev) => { const n = new Set(prev); n.delete(gi); return n; });
                    }}
                    title="Delete this game"
                  >
                    ×
                  </Button>
                )}
              </div>
            );
          })}
          {pos.scores.length < bestOf && (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={() => addGame(manualEntry)}
            >
              + Add Game {pos.scores.length + 1}
            </Button>
          )}
          <p className="text-[10px] text-muted-foreground italic">
            Completed games are locked to prevent accidental overwrites. Tap <span className="font-semibold">Edit</span> to change a previous game.
          </p>
          <Button className="w-full mt-2" onClick={closeOverlay}>
            <Check className="w-4 h-4 mr-1" /> Done
          </Button>
        </div>
      </div>
    );
  }

  // ---- Main scorecard view ----
  const homeCode = fixture.home_team_code || "";
  const awayCode = fixture.away_team_code || "";

  return (
    <div className="bottom-nav-safe">
      <SEO title="League Scorecard" description="League fixture scorecard" path={`/league-games/${fixtureId}`} noIndex />
      <PageHeader title="League Scorecard" subtitle={`${homeCode} vs ${awayCode}`} />

      <div className="px-3 space-y-3 pb-8">
        {/* Header row */}
        <div className="border rounded-lg overflow-hidden text-xs">
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
          <div className="p-1.5 text-[10px] text-muted-foreground bg-muted/30 flex items-center justify-between">
            <span>Venue: {fixture.venue_name}</span>
            <span className="font-medium">
              {scoringFormat === "par11" ? "PAR 11" : "PAR 15"} · Best of {bestOf}
            </span>
          </div>
        </div>

        {/* Match format selection — only during setup */}
        {!setupDone && !isSubmitted && (
          <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
            <span className="text-xs font-semibold text-foreground">Match Format</span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Scoring</Label>
                <RadioGroup value={scoringFormat} onValueChange={(v) => setScoringFormat(v as "par11" | "par15")} className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="par11" id="par11" />
                    <Label htmlFor="par11" className="text-xs font-normal cursor-pointer">PAR 11</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="par15" id="par15" />
                    <Label htmlFor="par15" className="text-xs font-normal cursor-pointer">PAR 15</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Best of</Label>
                <RadioGroup value={String(bestOf)} onValueChange={(v) => setBestOf(Number(v) as 3 | 5)} className="flex gap-3">
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="3" id="bo3" />
                    <Label htmlFor="bo3" className="text-xs font-normal cursor-pointer">3</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="5" id="bo5" />
                    <Label htmlFor="bo5" className="text-xs font-normal cursor-pointer">5</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>
        )}

        {/* Scorecard table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/70 text-[10px] font-semibold">
                <th className="p-0" colSpan={bestOf + 5}>
                  <div className="grid items-center"
                    style={setupDone
                      ? { gridTemplateColumns: `28px 24px 56px minmax(0,1fr) ${Array(bestOf).fill('28px').join(' ')} 28px 96px` }
                      : { gridTemplateColumns: '28px 24px 72px 1fr 32px' }
                    }>
                    <span className="p-1 text-left">#</span>
                    <span className="p-1 text-left"></span>
                    <span className="p-1 text-left">NSF</span>
                    <span className="p-1 text-left">Player</span>
                    {setupDone && Array.from({ length: bestOf }, (_, i) => (
                      <span key={i} className="p-1 text-center">{i + 1}</span>
                    ))}
                    {setupDone && <span className="p-1 text-center">G</span>}
                    <span className="p-1"></span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, idx) => {
                const hasPlayers = pos.homeCode && pos.awayCode;
                const pr = summary.posResults[idx];
                // Total points = sum of all individual game scores
                const homeTotalPts = pos.scores.reduce((sum, s) => sum + s.home, 0);
                const awayTotalPts = pos.scores.reduce((sum, s) => sum + s.away, 0);
                return (
                  <tr key={idx} className={cn("border-t", pos.isForfeit && "bg-destructive/10")}>
                    <td className="p-0" colSpan={bestOf + 5}>
                      {/* Home row */}
                      <div className={cn(
                        "grid items-center border-b",
                        pos.isForfeit && pos.forfeitSide === "home" && "bg-destructive/20 text-destructive line-through"
                      )}
                        style={setupDone
                          ? { gridTemplateColumns: `28px 24px 56px minmax(0,1fr) ${Array(bestOf).fill('28px').join(' ')} 28px 96px` }
                          : { gridTemplateColumns: '28px 24px 72px 1fr 32px' }
                        }>
                        <span className="p-1 text-center font-bold text-sm border-r row-span-2">{idx + 1}</span>
                        <span className="text-[10px] font-semibold text-center bg-primary/10 py-1">H</span>
                        {!setupDone ? (
                          <>
                            <Input value={pos.homeCode} onChange={(e) => updatePosition(idx, "homeCode", e.target.value.toUpperCase())}
                              onBlur={() => handleCodeBlur(idx, "home")} placeholder="NSF#"
                              className="h-6 text-[9px] font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700">{pos.homeName}</span>
                            <span className="flex items-center justify-end gap-1 pr-1">
                              {pos.isForfeit && pos.forfeitSide === "home" && (
                                <>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Undo forfeit for position ${idx + 1} (home)?\n\nThis clears the 15-0 sweep and the ${FORFEIT_PENALTY_POINTS}-point penalty so the game can be played/marked normally.`)) {
                                        undoForfeit(idx);
                                      }
                                    }}
                                    className="text-primary hover:bg-primary/10 rounded px-1.5 py-0.5 border border-primary/50 flex items-center gap-1 text-[10px] font-medium"
                                    title="Undo forfeit"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Undo
                                  </button>
                                </>
                              )}
                              {!isSubmitted && (
                                <button
                                  onClick={() => setSwapTarget({ idx, side: "home" })}
                                  className="text-muted-foreground hover:text-primary"
                                  title="Pick from squad / reserves"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[9px] font-mono px-1 text-muted-foreground truncate">{pos.homeCode}</span>
                            <span className="text-xs truncate px-1 font-medium">{pos.homeName || "—"}</span>
                            {Array.from({ length: bestOf }, (_, gi) => (
                              <span key={gi} className={cn("text-center text-xs py-0.5", pos.scores[gi] && pos.scores[gi].home > pos.scores[gi].away ? "font-bold" : "text-muted-foreground")}>
                                {pos.scores[gi]?.home ?? ""}
                              </span>
                            ))}
                            <span className="text-center text-xs font-bold py-0.5">{pos.completed ? pr.homeWins : ""}</span>
                            <span className="flex items-center justify-center gap-0.5">
                              {!isSubmitted && !pos.completed && (
                                <>
                                  <button
                                    onClick={() => setSwapTarget({ idx, side: "home" })}
                                    className="text-muted-foreground hover:text-primary"
                                    title="Swap player"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Mark home player at position ${idx + 1} as a forfeit?\n\nAway team will be awarded a clean ${bestOf === 5 ? '3-0' : '2-0'} (15-0 each game), and home team will lose ${FORFEIT_PENALTY_POINTS} penalty points.`)) {
                                        markForfeit(idx, "home");
                                      }
                                    }}
                                    className="text-destructive hover:bg-destructive/10 rounded p-0.5"
                                    title="Forfeit home player (no-show)"
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {pos.isForfeit && pos.forfeitSide === "home" && (
                                <>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Undo forfeit for position ${idx + 1}?\n\nThis clears the 15-0 sweep and the ${FORFEIT_PENALTY_POINTS}-point penalty so the game can be played/marked normally.`)) {
                                        undoForfeit(idx);
                                      }
                                    }}
                                    className="text-primary hover:bg-primary/10 rounded p-0.5 border border-primary/40"
                                    title="Undo forfeit"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Away row */}
                      <div className={cn(
                        "grid items-center",
                        pos.isForfeit && pos.forfeitSide === "away" && "bg-destructive/20 text-destructive line-through"
                      )}
                        style={setupDone
                          ? { gridTemplateColumns: `28px 24px 56px minmax(0,1fr) ${Array(bestOf).fill('28px').join(' ')} 28px 96px` }
                          : { gridTemplateColumns: '28px 24px 72px 1fr 32px' }
                        }>
                        <span></span>
                        <span className="text-[10px] font-semibold text-center bg-secondary/30 py-1">V</span>
                        {!setupDone ? (
                          <>
                            <Input value={pos.awayCode} onChange={(e) => updatePosition(idx, "awayCode", e.target.value.toUpperCase())}
                              onBlur={() => handleCodeBlur(idx, "away")} placeholder="NSF#"
                              className="h-6 text-[9px] font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700">{pos.awayName}</span>
                            <span className="flex items-center justify-end gap-1 pr-1">
                              {pos.isForfeit && pos.forfeitSide === "away" && (
                                <>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Undo forfeit for position ${idx + 1} (away)?\n\nThis clears the 15-0 sweep and the ${FORFEIT_PENALTY_POINTS}-point penalty so the game can be played/marked normally.`)) {
                                        undoForfeit(idx);
                                      }
                                    }}
                                    className="text-primary hover:bg-primary/10 rounded px-1.5 py-0.5 border border-primary/50 flex items-center gap-1 text-[10px] font-medium"
                                    title="Undo forfeit"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Undo
                                  </button>
                                </>
                              )}
                              {!isSubmitted && (
                                <button
                                  onClick={() => setSwapTarget({ idx, side: "away" })}
                                  className="text-muted-foreground hover:text-primary"
                                  title="Pick from squad / reserves"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[9px] font-mono px-1 text-muted-foreground truncate">{pos.awayCode}</span>
                            <span className="text-xs truncate px-1 font-medium">{pos.awayName || "—"}</span>
                            {Array.from({ length: bestOf }, (_, gi) => (
                              <span key={gi} className={cn("text-center text-xs py-0.5", pos.scores[gi] && pos.scores[gi].away > pos.scores[gi].home ? "font-bold" : "text-muted-foreground")}>
                                {pos.scores[gi]?.away ?? ""}
                              </span>
                            ))}
                            <span className="text-center text-xs font-bold py-0.5">{pos.completed ? pr.awayWins : ""}</span>
                            {/* Action buttons */}
                            <span className="flex items-center justify-center gap-0.5">
                              {!isSubmitted && !pos.completed && (
                                <>
                                  {hasPlayers && (
                                    <>
                                      <button
                                        onClick={() => startMarking(idx)}
                                        className="bg-primary text-primary-foreground rounded p-0.5 hover:bg-primary/80"
                                        title="Mark game live"
                                      >
                                        <Play className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          // Determine games needed to win the match
                                          const gamesToWin = bestOf === 5 ? 3 : 2;
                                          let hw = 0, aw = 0;
                                          for (const s of pos.scores) { if (s.home > s.away) hw++; else if (s.away > s.home) aw++; }
                                          const matchDecided = hw >= gamesToWin || aw >= gamesToWin;
                                          // Last entered game still in progress (no clear winner yet)
                                          const last = pos.scores[pos.scores.length - 1];
                                          const lastInProgress = last && last.home === last.away; // 0-0 or tied
                                          // Auto-prepare a fresh empty row for the next game so the user
                                          // doesn't accidentally overwrite a completed game's score.
                                          if (pos.scores.length === 0) {
                                            addGame(idx);
                                          } else if (!matchDecided && !lastInProgress && pos.scores.length < bestOf) {
                                            addGame(idx);
                                          }
                                          setManualEntry(idx);
                                        }}
                                        className="text-muted-foreground hover:text-foreground"
                                        title="Enter scores manually"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => setSwapTarget({ idx, side: "away" })}
                                    className="text-muted-foreground hover:text-primary"
                                    title="Swap / pick away player"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                  </button>
                                  {/* Forfeit always available — even when both player slots are empty,
                                      captain can mark this position as a no-show for either side. */}
                                  <button
                                    onClick={() => {
                                      const sideLabel = pos.awayCode ? "away" : "away (no player listed)";
                                      if (window.confirm(`Mark ${sideLabel} player at position ${idx + 1} as a forfeit?\n\nHome team will be awarded a clean ${bestOf === 5 ? '3-0' : '2-0'} (15-0 each game), and away team will lose ${FORFEIT_PENALTY_POINTS} penalty points.`)) {
                                        markForfeit(idx, "away");
                                      }
                                    }}
                                    className="text-destructive hover:bg-destructive/10 rounded p-0.5"
                                    title="Forfeit away player (no-show)"
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {pos.isForfeit && pos.forfeitSide === "away" && (
                                <>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Undo forfeit for position ${idx + 1}?\n\nThis clears the 15-0 sweep and the ${FORFEIT_PENALTY_POINTS}-point penalty so the game can be played/marked normally.`)) {
                                        undoForfeit(idx);
                                      }
                                    }}
                                    className="text-primary hover:bg-primary/10 rounded p-0.5 border border-primary/40"
                                    title="Undo forfeit"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </>
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
                    <td colSpan={bestOf} />
                    <td className="text-center p-1">{summary.homeTotalGames}</td>
                    <td className="text-center p-1">{summary.awayTotalGames}</td>
                  </tr>
                  <tr className="bg-muted/40 font-semibold text-xs">
                    <td colSpan={2} className="p-1 text-right">BONUS POINTS</td>
                    <td colSpan={bestOf} />
                    <td className="text-center p-1">{summary.homeBonusPoints}</td>
                    <td className="text-center p-1">{summary.awayBonusPoints}</td>
                  </tr>
                  {(summary.homePenaltyPoints > 0 || summary.awayPenaltyPoints > 0) && (
                    <tr className="bg-destructive/10 font-semibold text-xs text-destructive">
                      <td colSpan={2} className="p-1 text-right">FORFEIT PENALTY</td>
                      <td colSpan={bestOf} />
                      <td className="text-center p-1">{summary.homePenaltyPoints > 0 ? `-${summary.homePenaltyPoints}` : ""}</td>
                      <td className="text-center p-1">{summary.awayPenaltyPoints > 0 ? `-${summary.awayPenaltyPoints}` : ""}</td>
                    </tr>
                  )}
                  <tr className="bg-muted/60 font-bold text-sm">
                    <td colSpan={2} className="p-1 text-right">TOTAL</td>
                    <td colSpan={bestOf} />
                    <td className="text-center p-1">{summary.homeTotal}</td>
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
          <div className="flex gap-2">
            <Button className="flex-1" size="sm" variant="outline" onClick={handleSaveSetup} disabled={!setupValid || savingSetup}>
              {savingSetup ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Setup
            </Button>
            <Button className="flex-1" size="sm" onClick={() => { if (!setupValid) { toast.error("Enter at least one complete position"); return; } handleSaveSetup(); }} disabled={!setupValid || savingSetup}>
              <Check className="w-4 h-4 mr-1" /> Complete Setup
            </Button>
          </div>
        )}

        {setupDone && !isSubmitted && (
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setSetupDone(false)}>
            <ArrowLeft className="w-3 h-3 mr-1" /> Edit Players
          </Button>
        )}

        {/* Signatures */}
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
          Bonus points: 1 per individual match won (winner only). Forfeit: away/home awarded a clean sweep (15-0) and the absent team loses {FORFEIT_PENALTY_POINTS} penalty points.
        </p>
      </div>

      <BackToDashboard />

      {swapTarget && (
        <LineupSwapDialog
          open={!!swapTarget}
          onOpenChange={(o) => { if (!o) setSwapTarget(null); }}
          teamCode={swapTarget.side === "home" ? homeCode : awayCode}
          side={swapTarget.side}
          position={swapTarget.idx + 1}
          currentName={swapTarget.side === "home" ? positions[swapTarget.idx].homeName : positions[swapTarget.idx].awayName}
          currentCode={swapTarget.side === "home" ? positions[swapTarget.idx].homeCode : positions[swapTarget.idx].awayCode}
          inUseCodes={buildInUseMap(swapTarget.side)}
          onSelect={handleSwap}
          onClear={() => handleClearSlot(swapTarget.idx, swapTarget.side)}
        />
      )}
    </div>
  );
}
