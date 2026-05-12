import { useState, useMemo, useRef, useCallback, useEffect, type CSSProperties, type ReactNode } from "react";
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
import { Check, Loader2, Trophy, Play, Edit3, ArrowLeft, Save, ArrowLeftRight, UserX, RotateCcw, Trash2, X, MoreVertical, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import type { MarkerConfig } from "@/components/marker/MarkerSetup";
import { MARKER_STATE_KEY } from "@/lib/marker-storage";
import { cn } from "@/lib/utils";
import { LineupSwapDialog, type SwapCandidate } from "@/components/league-games/LineupSwapDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RosterPanel } from "@/components/league-games/RosterPanel";
import { useNsaTeam, useNsaTeamByCode, type NsaTeamPlayer } from "@/hooks/use-nsa";
import { NsaSubmitDialog } from "@/components/league-games/NsaSubmitDialog";
import { useMemberContext } from "@/contexts/MemberContext";
import { Send } from "lucide-react";
import { useAssociationRules } from "@/hooks/use-association-rules";
import { NsaPenaltyBadge } from "@/components/nsa/NsaPenaltyBadge";
import { DndContext, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";

/** Droppable wrapper that BECOMES the grid row. Adds drop highlight ring. */
function DroppableSlotRow({
  side, idx, className, style, children,
}: {
  side: "home" | "away";
  idx: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `slot:${side}:${idx}`,
    data: { kind: "slot", side, idx },
  });
  const dragSide = (active?.data.current as any)?.side as "home" | "away" | undefined;
  const matches = dragSide === side;
  const wrong = !!dragSide && dragSide !== side;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative",
        className,
        isOver && matches && "ring-2 ring-primary ring-inset bg-primary/10",
        isOver && wrong && "ring-2 ring-destructive ring-inset bg-destructive/10",
      )}
      style={style}
    >
      {children}
    </div>
  );
}

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
  const { activeMember } = useMemberContext();
  const [nsaDialogOpen, setNsaDialogOpen] = useState(false);

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

  // ---- Live follow: subscribe to realtime score updates for this fixture ----
  // Anyone viewing the same game sees scores update game-by-game without refresh.
  // We do NOT overwrite local marker state for the position currently being marked.
  useEffect(() => {
    if (!fixtureId) return;
    const ch = supabase
      .channel(`league-fixture:${fixtureId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_match_results", filter: `fixture_id=eq.${fixtureId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
          queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_fixture_results", filter: `fixture_id=eq.${fixtureId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fixtureId, queryClient]);
  // ---- NSA live roster: resolved by team code, no DB mapping needed ----
  // Codes are the contract — the club assigns "CSI006" and gives the same to NSA.
  const { data: nsaHomeTeam } = useNsaTeamByCode(fixture?.home_team_code, !!fixture);
  const { data: nsaAwayTeam } = useNsaTeamByCode(fixture?.away_team_code, !!fixture);

  // NSF code -> overlay info from NSA roster
  const nsaRosterMap = useMemo(() => {
    const map = new Map<string, { name: string; won: number; lost: number; played: number; side: "home" | "away" }>();
    const ingest = (players: NsaTeamPlayer[] | undefined, side: "home" | "away") => {
      (players || []).forEach((p) => {
        const code = (p.code || "").toUpperCase().trim();
        if (!code) return;
        map.set(code, {
          name: `${p.name || ""} ${p.surname || ""}`.trim(),
          won: Number(p.result_summary?.won ?? 0) || 0,
          lost: Number(p.result_summary?.lost ?? 0) || 0,
          played: Number(p.result_summary?.played ?? 0) || 0,
          side,
        });
      });
    };
    ingest(nsaHomeTeam?.players, "home");
    ingest(nsaAwayTeam?.players, "away");
    return map;
  }, [nsaHomeTeam, nsaAwayTeam]);

  const nsaLive = !!(nsaHomeTeam || nsaAwayTeam);


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
      setPositions((prev) => {
        // Don't clobber the position the user is actively marking/editing locally —
        // realtime refresh would otherwise overwrite in-progress scores.
        return loaded.map((p, i) => (i === activeMarker || i === manualEntry ? prev[i] : p));
      });
      setSetupDone(true);
    }
  }, [existingMatches, activeMarker, manualEntry]);

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

      // Compute squash week_start_date from fixture_date.
      // Priority: fixture's association week_start_dow > club's league_week_start_dow > Wed default.
      // This MUST match the dow used by FillUpLeaguesTab when saving league_week_lineups,
      // otherwise the captain's lineup won't be picked up here.
      let weekStartDate: string | null = null;
      if (fixture.fixture_date && clubIds.length > 0) {
        let startDow: number | null = null;
        if (fixture.association_id) {
          const { data: assocRow } = await (supabase as any)
            .from("league_associations").select("week_start_dow").eq("id", fixture.association_id).maybeSingle();
          if (assocRow?.week_start_dow != null) startDow = assocRow.week_start_dow;
        }
        if (startDow == null) {
          const { data: clubRow } = await (supabase as any)
            .from("clubs").select("league_week_start_dow").eq("id", clubIds[0]).maybeSingle();
          startDow = clubRow?.league_week_start_dow ?? 3; // default Wed
        }
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

  // Apply prefill from the captain's Fill-Up Leagues lineup.
  //  - If real play has been recorded (any scores or forfeit), do nothing.
  //  - If saved rows exist but no scores yet, treat them as stale placeholders
  //    and let the latest captain Fill-Up overwrite them.
  //  - Otherwise (fresh setup), fill empty slots only.
  useEffect(() => {
    if (!prefillLineup || !fixture) return;
    const hasRecordedPlay =
      Array.isArray(existingMatches) &&
      existingMatches.some(
        (m: any) => (Array.isArray(m.game_scores) && m.game_scores.length > 0) || !!m.is_forfeit,
      );
    if (hasRecordedPlay) return;

    const homeSlots = prefillLineup[fixture.home_team_code] || [];
    const awaySlots = prefillLineup[fixture.away_team_code] || [];
    const hasAny = [...homeSlots, ...awaySlots].some((s) => s.code || s.name);
    if (!hasAny) return;

    const stalePlaceholdersExist =
      Array.isArray(existingMatches) && existingMatches.length > 0;

    setPositions((prev) => prev.map((p, i) => {
      const home = homeSlots[i] || { code: "", name: "" };
      const away = awaySlots[i] || { code: "", name: "" };
      if (stalePlaceholdersExist) {
        return {
          ...p,
          homeCode: home.code || p.homeCode,
          homeName: home.name || p.homeName,
          awayCode: away.code || p.awayCode,
          awayName: away.name || p.awayName,
        };
      }
      return {
        ...p,
        homeCode: p.homeCode || home.code,
        homeName: p.homeName || home.name,
        awayCode: p.awayCode || away.code,
        awayName: p.awayName || away.name,
      };
    }));
  }, [prefillLineup, existingMatches, fixture]);

  // Apply association-level league rules — these are the authoritative format
  // set by the league admin (e.g. NSA = PAR 15, Best of 5). They take precedence
  // over any previously-saved match_format so updated rules are reflected immediately.
  const { data: leagueRules } = useAssociationRules(fixture?.association_id);
  useEffect(() => {
    if (leagueRules) {
      const ppg = leagueRules.points_per_game;
      if (ppg === 15) setScoringFormat("par15");
      else if (ppg === 11) setScoringFormat("par11");
      if (leagueRules.games_format === "best_of_3") setBestOf(3);
      else if (leagueRules.games_format === "best_of_5") setBestOf(5);
      return;
    }
    // Fallback to saved per-fixture format only when no association rule exists
    if (existingResult?.match_format) {
      const fmt = existingResult.match_format as any;
      if (fmt.scoringFormat) setScoringFormat(fmt.scoringFormat);
      if (fmt.bestOf) setBestOf(fmt.bestOf);
    }
  }, [leagueRules, existingResult]);

  const lookupPlayer = useCallback(async (code: string): Promise<string> => {
    if (!code || code.length < 3) return "";
    const upper = code.toUpperCase();
    // Prefer NSA live roster when available
    const nsa = nsaRosterMap.get(upper);
    if (nsa?.name) return nsa.name;
    const { data } = await supabase.from("platform_league_members" as any).select("first_name, surname").eq("user_code", upper).maybeSingle();
    if (data) return `${(data as any).first_name} ${(data as any).surname}`;
    return "";
  }, [nsaRosterMap]);

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

  // Set of all NSF codes currently assigned (used by RosterPanel to disable taken players)
  const assignedCodes = useMemo(() => {
    const s = new Set<string>();
    positions.forEach((p) => {
      if (p.homeCode) s.add(p.homeCode.toUpperCase());
      if (p.awayCode) s.add(p.awayCode.toUpperCase());
    });
    return s;
  }, [positions]);

  // Click a roster player → fill the next empty position on their side
  const handleRosterAssign = useCallback((side: "home" | "away", player: NsaTeamPlayer) => {
    const codeUpper = (player.code || "").toUpperCase();
    if (!codeUpper) return;
    if (assignedCodes.has(codeUpper)) {
      toast.error(`${player.name} ${player.surname} is already in the lineup`);
      return;
    }
    const fullName = `${player.name || ""} ${player.surname || ""}`.trim();
    const codeKey = side === "home" ? "homeCode" : "awayCode";
    const nameKey = side === "home" ? "homeName" : "awayName";
    setPositions((prev) => {
      const emptyIdx = prev.findIndex((p) => !p[codeKey]);
      if (emptyIdx === -1) {
        toast.error(`All ${side === "home" ? "home" : "visitors"} positions are full`);
        return prev;
      }
      const next = [...prev];
      next[emptyIdx] = { ...next[emptyIdx], [codeKey]: codeUpper, [nameKey]: fullName };
      toast.success(`${fullName} → position ${emptyIdx + 1}`);
      return next;
    });
  }, [assignedCodes]);

  // Drag a roster player onto a specific H/V slot. If the slot is occupied,
  // the new player overwrites it (the displaced player simply returns to the
  // squad pool — same semantics as the Replace dialog).
  const handleRosterDrop = useCallback((side: "home" | "away", idx: number, code: string, name: string) => {
    const codeUpper = (code || "").toUpperCase();
    if (!codeUpper) return;
    const codeKey = side === "home" ? "homeCode" : "awayCode";
    const nameKey = side === "home" ? "homeName" : "awayName";
    setPositions((prev) => {
      // Already in the lineup somewhere? Move them (swap with target).
      const existingIdx = prev.findIndex((p) => (p[codeKey] || "").toUpperCase() === codeUpper);
      const next = prev.map((p) => ({ ...p }));
      const targetOldCode = next[idx][codeKey];
      const targetOldName = next[idx][nameKey];
      next[idx] = { ...next[idx], [codeKey]: codeUpper, [nameKey]: name };
      if (existingIdx >= 0 && existingIdx !== idx) {
        next[existingIdx] = { ...next[existingIdx], [codeKey]: targetOldCode, [nameKey]: targetOldName };
        toast.success(`${name} → position ${idx + 1} (swapped)`);
      } else {
        toast.success(`${name} → position ${idx + 1}`);
      }
      return next;
    });
  }, []);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const a = e.active?.data.current as any;
    const o = e.over?.data.current as any;
    if (!a || !o || a.kind !== "roster" || o.kind !== "slot") return;
    if (a.side !== o.side) {
      toast.error(`${a.side === "home" ? "Home" : "Visitor"} player can't go on the ${o.side === "home" ? "home" : "visitor"} side`);
      return;
    }
    handleRosterDrop(o.side, o.idx, a.code, a.name);
  }, [handleRosterDrop]);

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
    try { localStorage.removeItem(MARKER_STATE_KEY); } catch {}
    setActiveMarker(posIdx);
  };

  const markerConfig = useMemo((): MarkerConfig | null => {
    if (activeMarker === null) return null;
    const pos = positions[activeMarker];
    // Always derive from association rules when present so Super Admin's
    // configured format wins over any stale local state.
    const effectiveFormat = leagueRules?.points_per_game === 15 ? "par15"
      : leagueRules?.points_per_game === 11 ? "par11"
      : scoringFormat;
    const effectiveBestOf = leagueRules?.games_format === "best_of_5" ? 5
      : leagueRules?.games_format === "best_of_3" ? 3
      : bestOf;
    return {
      playerA: { name: pos.homeName || pos.homeCode, number: pos.homeCode, club: fixture?.home_team_code || "" },
      playerB: { name: pos.awayName || pos.awayCode, number: pos.awayCode, club: fixture?.away_team_code || "" },
      isDoubles: false, matchType: "league", scoringFormat: effectiveFormat, bestOf: effectiveBestOf, deuceRule: "win_by_2",
      source: "league", sourceId: fixtureId,
    };
  }, [activeMarker, positions, fixture, fixtureId, scoringFormat, bestOf, leagueRules]);

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
          <MarkerScoreboard
            config={markerConfig}
            onMatchComplete={handleMarkerComplete}
            onReset={() => setActiveMarker(null)}
            onProgress={(games) => {
              if (activeMarker === null) return;
              const current = positions[activeMarker];
              if (!current) return;
              // Persist game-by-game so other viewers see live progress.
              // Keep `completed: false` until the match is fully decided.
              const updated = { ...current, scores: games.map((g) => ({ home: g.a, away: g.b })) };
              persistPositionScores(activeMarker, updated);
            }}
          />
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
  const homeTeamName = teamNamesByCode?.[homeCode.toUpperCase()] || null;
  const awayTeamName = teamNamesByCode?.[awayCode.toUpperCase()] || null;

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
            <div className="p-2 border-r bg-primary text-primary-foreground">
              <span className="text-xs font-black uppercase tracking-widest block">HOME TEAM</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-black text-lg">{homeCode}</span>
                {homeTeamName && (
                  <span className="text-xs font-semibold opacity-90 truncate">{homeTeamName}</span>
                )}
                <NsaPenaltyBadge fixtureId={fixture.nsa_fixture_id} teamSide="home" teamCode={homeCode} />
              </div>
            </div>
            <div className="p-2 bg-accent text-accent-foreground">
              <span className="text-xs font-black uppercase tracking-widest block">VISITORS TEAM</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-black text-lg">{awayCode}</span>
                {awayTeamName && (
                  <span className="text-xs font-semibold opacity-90 truncate">{awayTeamName}</span>
                )}
                <NsaPenaltyBadge fixtureId={fixture.nsa_fixture_id} teamSide="away" teamCode={awayCode} />
              </div>
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

        {/* Live NSA roster banner */}
        {nsaLive && !setupDone && !isSubmitted && (
          <div className="flex items-center gap-2 text-[11px] bg-card border border-border text-card-foreground rounded px-2 py-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="font-semibold">Live NSA roster</span>
          </div>
        )}

        <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
        {/* NSA Squad roster — click OR drag players onto H/V slots */}
        {nsaLive && !setupDone && !isSubmitted && (
          <RosterPanel
            homeCode={fixture?.home_team_code}
            awayCode={fixture?.away_team_code}
            homePlayers={nsaHomeTeam?.players}
            awayPlayers={nsaAwayTeam?.players}
            assignedCodes={assignedCodes}
            onAssign={handleRosterAssign}
          />
        )}


        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/70 text-[10px] font-semibold">
                <th className="p-0" colSpan={bestOf + 6}>
                  <div className="grid items-center"
                    style={setupDone
                      ? { gridTemplateColumns: `24px 20px 48px minmax(0,1fr) ${Array(bestOf).fill('22px').join(' ')} 22px 28px 48px` }
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
                    {setupDone && <span className="p-1 text-center" title="Total points">P</span>}
                    <span className="p-1"></span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => { return null; })()}
              {positions.map((pos, idx) => {
                const hasPlayers = pos.homeCode && pos.awayCode;
                const noGamesMarkedYet = !isSubmitted && positions.every(p => !p.completed && (!p.scores || p.scores.length === 0));
                const isFirstPlayable = noGamesMarkedYet && positions.findIndex(p => p.homeCode && p.awayCode && !p.completed) === idx;
                const pr = summary.posResults[idx];
                // Total points = sum of all individual game scores
                const homeTotalPts = pos.scores.reduce((sum, s) => sum + s.home, 0);
                const awayTotalPts = pos.scores.reduce((sum, s) => sum + s.away, 0);
                return (
                  <tr key={idx} className={cn("border-t", pos.isForfeit && "bg-destructive/10")}>
                    <td className="p-0" colSpan={bestOf + 6}>
                      {/* Home row */}
                      <DroppableSlotRow
                        side="home"
                        idx={idx}
                        className={cn(
                          "grid items-center border-b",
                          pos.isForfeit && pos.forfeitSide === "home" && "bg-destructive/20 text-destructive line-through"
                        )}
                        style={setupDone
                          ? { gridTemplateColumns: `24px 20px 48px minmax(0,1fr) ${Array(bestOf).fill('22px').join(' ')} 22px 28px 48px` }
                          : { gridTemplateColumns: '28px 24px 72px 1fr 88px' }
                        }>
                        <span className="p-1 text-center font-bold text-sm border-r row-span-2">{idx + 1}</span>
                        <span className="text-xs font-black text-center bg-primary text-primary-foreground py-1">H</span>
                        {!setupDone ? (
                          <>
                            <Input value={pos.homeCode} onChange={(e) => updatePosition(idx, "homeCode", e.target.value.toUpperCase())}
                              onBlur={() => handleCodeBlur(idx, "home")} placeholder="NSF#"
                              className="h-6 text-[9px] font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700 flex items-center gap-1">
                              <span className="truncate">{pos.homeName}</span>
                              {(() => {
                                const r = pos.homeCode ? nsaRosterMap.get(pos.homeCode.toUpperCase()) : null;
                                if (!r || r.played === 0) return null;
                                return (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono border-emerald-300 text-emerald-700" title={`NSA season: ${r.played} played`}>
                                    {r.won}W–{r.lost}L
                                  </Badge>
                                );
                              })()}
                            </span>
                            <span className="flex items-center justify-end gap-1 pr-1">
                              {pos.isForfeit && pos.forfeitSide === "home" && (
                                <>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  {!isSubmitted && (
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
                                  )}
                                </>
                              )}
                              {!isSubmitted && (
                                <button
                                  onClick={() => setSwapTarget({ idx, side: "home" })}
                                  className="text-muted-foreground hover:text-primary"
                                  title="Replace player (pick from squad / reserves)"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                </button>
                              )}
                              {!isSubmitted && pos.homeCode && (
                                <button
                                  onClick={() => handleClearSlot(idx, "home")}
                                  className="text-muted-foreground hover:text-destructive"
                                  title="Remove player from this slot"
                                >
                                  <X className="w-3.5 h-3.5" />
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
                            <span className="text-center text-xs font-bold py-0.5 text-primary">{pos.completed ? homeTotalPts : ""}</span>
                            <span className="flex items-center justify-center gap-0.5">
                              {!isSubmitted && !pos.isForfeit && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="text-muted-foreground hover:text-foreground hover:bg-accent rounded p-0.5"
                                      title="Actions"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => setSwapTarget({ idx, side: "home" })}>
                                      <ArrowLeftRight className="w-3.5 h-3.5 mr-2" /> Replace player
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        if (window.confirm(`Mark home player at position ${idx + 1} as a forfeit?\n\nAway team will be awarded a clean ${bestOf === 5 ? '3-0' : '2-0'} (15-0 each game), and home team will lose ${FORFEIT_PENALTY_POINTS} penalty points.`)) {
                                          markForfeit(idx, "home");
                                        }
                                      }}
                                    >
                                      <UserX className="w-3.5 h-3.5 mr-2" /> Forfeit player
                                    </DropdownMenuItem>
                                    {(pos.completed || pos.scores.length > 0) && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => {
                                            if (!window.confirm(`Scratch the recorded score for position ${idx + 1}?\n\nThis clears the game so it can be re-marked or re-entered.`)) return;
                                            clearScores(idx);
                                          }}
                                        >
                                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Scratch / clear scores
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              {pos.isForfeit && pos.forfeitSide === "home" && (
                                <>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  {!isSubmitted && (
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
                                  )}
                                </>
                              )}
                            </span>
                          </>
                        )}
                      </DroppableSlotRow>
                      {/* Away row */}
                      <DroppableSlotRow
                        side="away"
                        idx={idx}
                        className={cn(
                          "grid items-center",
                          pos.isForfeit && pos.forfeitSide === "away" && "bg-destructive/20 text-destructive line-through"
                        )}
                        style={setupDone
                          ? { gridTemplateColumns: `24px 20px 48px minmax(0,1fr) ${Array(bestOf).fill('22px').join(' ')} 22px 28px 48px` }
                          : { gridTemplateColumns: '28px 24px 72px 1fr 88px' }
                        }>
                        <span></span>
                        <span className="text-xs font-black text-center bg-accent text-accent-foreground py-1">V</span>
                        {!setupDone ? (
                          <>
                            <Input value={pos.awayCode} onChange={(e) => updatePosition(idx, "awayCode", e.target.value.toUpperCase())}
                              onBlur={() => handleCodeBlur(idx, "away")} placeholder="NSF#"
                              className="h-6 text-[9px] font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700 flex items-center gap-1">
                              <span className="truncate">{pos.awayName}</span>
                              {(() => {
                                const r = pos.awayCode ? nsaRosterMap.get(pos.awayCode.toUpperCase()) : null;
                                if (!r || r.played === 0) return null;
                                return (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-mono border-emerald-300 text-emerald-700" title={`NSA season: ${r.played} played`}>
                                    {r.won}W–{r.lost}L
                                  </Badge>
                                );
                              })()}
                            </span>
                            <span className="flex items-center justify-end gap-1 pr-1">
                              {pos.isForfeit && pos.forfeitSide === "away" && (
                                <>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  {!isSubmitted && (
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
                                  )}
                                </>
                              )}
                              {!isSubmitted && (
                                <button
                                  onClick={() => setSwapTarget({ idx, side: "away" })}
                                  className="text-muted-foreground hover:text-primary"
                                  title="Replace player (pick from squad / reserves)"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                </button>
                              )}
                              {!isSubmitted && pos.awayCode && (
                                <button
                                  onClick={() => handleClearSlot(idx, "away")}
                                  className="text-muted-foreground hover:text-destructive"
                                  title="Remove player from this slot"
                                >
                                  <X className="w-3.5 h-3.5" />
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
                            <span className="text-center text-xs font-bold py-0.5 text-primary">{pos.completed ? awayTotalPts : ""}</span>
                            {/* Action buttons */}
                            <span className="flex items-center justify-center gap-0.5">
                              {!isSubmitted && !pos.completed && (
                                <>
                                  {hasPlayers && (
                                    <Tooltip open={isFirstPlayable ? true : undefined}>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => startMarking(idx)}
                                          className={cn(
                                            "bg-primary text-primary-foreground rounded p-0.5 hover:bg-primary/80",
                                            isFirstPlayable && "animate-pulse ring-2 ring-accent ring-offset-1 ring-offset-background shadow-lg shadow-accent/40"
                                          )}
                                          title="Mark game live"
                                        >
                                          <Play className="w-3.5 h-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" className="max-w-[220px]">
                                        {isFirstPlayable
                                          ? "Start marking your first game by clicking this Play button — live scoring will open for this position."
                                          : "Mark game live"}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="text-muted-foreground hover:text-foreground hover:bg-accent rounded p-0.5"
                                        title="More actions"
                                      >
                                        <MoreVertical className="w-4 h-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      {hasPlayers && (
                                        <>
                                          <DropdownMenuItem
                                            onClick={() => {
                                              const gamesToWin = bestOf === 5 ? 3 : 2;
                                              let hw = 0, aw = 0;
                                              for (const s of pos.scores) { if (s.home > s.away) hw++; else if (s.away > s.home) aw++; }
                                              const matchDecided = hw >= gamesToWin || aw >= gamesToWin;
                                              const last = pos.scores[pos.scores.length - 1];
                                              const lastInProgress = last && last.home === last.away;
                                              if (pos.scores.length === 0) {
                                                addGame(idx);
                                              } else if (!matchDecided && !lastInProgress && pos.scores.length < bestOf) {
                                                addGame(idx);
                                              }
                                              setManualEntry(idx);
                                            }}
                                          >
                                            <Edit3 className="w-3.5 h-3.5 mr-2" /> Enter scores manually
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                        </>
                                      )}
                                      <DropdownMenuItem onClick={() => setSwapTarget({ idx, side: "away" })}>
                                        <ArrowLeftRight className="w-3.5 h-3.5 mr-2" /> Replace player
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => {
                                          const sideLabel = pos.awayCode ? "away" : "away (no player listed)";
                                          if (window.confirm(`Mark ${sideLabel} player at position ${idx + 1} as a forfeit?\n\nHome team will be awarded a clean ${bestOf === 5 ? '3-0' : '2-0'} (15-0 each game), and away team will lose ${FORFEIT_PENALTY_POINTS} penalty points.`)) {
                                            markForfeit(idx, "away");
                                          }
                                        }}
                                      >
                                        <UserX className="w-3.5 h-3.5 mr-2" /> Forfeit player
                                      </DropdownMenuItem>
                                      {(pos.completed || pos.scores.length > 0) && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={() => {
                                              if (!window.confirm(`Scratch the recorded score for position ${idx + 1}?\n\nThis clears the game so it can be re-marked or re-entered.`)) return;
                                              clearScores(idx);
                                            }}
                                          >
                                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Scratch / clear scores
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                              {!isSubmitted && pos.completed && !pos.isForfeit && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="text-muted-foreground hover:text-foreground hover:bg-accent rounded p-0.5"
                                      title="Actions"
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => setSwapTarget({ idx, side: "away" })}>
                                      <ArrowLeftRight className="w-3.5 h-3.5 mr-2" /> Replace player
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        if (window.confirm(`Mark away player at position ${idx + 1} as a forfeit?\n\nHome team will be awarded a clean ${bestOf === 5 ? '3-0' : '2-0'} (15-0 each game), and away team will lose ${FORFEIT_PENALTY_POINTS} penalty points.`)) {
                                          markForfeit(idx, "away");
                                        }
                                      }}
                                    >
                                      <UserX className="w-3.5 h-3.5 mr-2" /> Forfeit player
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        if (!window.confirm(`Scratch the recorded score for position ${idx + 1}?\n\nThis clears the game so it can be re-marked or re-entered.`)) return;
                                        clearScores(idx);
                                      }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Scratch / clear scores
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              {pos.isForfeit && pos.forfeitSide === "away" && (
                                <>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive text-destructive font-bold">FORFEIT</Badge>
                                  {!isSubmitted && (
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
                                  )}
                                </>
                              )}
                            </span>
                          </>
                        )}
                      </DroppableSlotRow>
                    </td>
                  </tr>
                );
              })}

              {/* Totals rows */}
              {setupDone && (() => {
                const homeAllPts = positions.reduce((sum, p) => sum + p.scores.reduce((s, g) => s + g.home, 0), 0);
                const awayAllPts = positions.reduce((sum, p) => sum + p.scores.reduce((s, g) => s + g.away, 0), 0);
                return (
                <>
                  <tr className="border-t bg-muted/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <td colSpan={2} className="p-1 text-right"></td>
                    <td colSpan={bestOf} />
                    <td className="text-center p-1 text-primary">H</td>
                    <td className="text-center p-1 text-secondary-foreground">V</td>
                  </tr>
                  <tr className="bg-muted/40 font-semibold text-xs">
                    <td colSpan={2} className="p-1 text-right">SUB TOTALS (G)</td>
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
                  <tr className="bg-primary/10 font-bold text-sm border-t-2 border-primary/30">
                    <td colSpan={2} className="p-1 text-right text-primary">TOTAL POINTS (P)</td>
                    <td colSpan={bestOf} />
                    <td className="text-center p-1 text-primary">{homeAllPts}</td>
                    <td className="text-center p-1 text-primary">{awayAllPts}</td>
                  </tr>
                </>
                );
              })()}
            </tbody>
          </table>
        </div>
        </DndContext>

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
          <Button
            size="sm"
            className="w-full text-xs font-semibold bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground shadow-md hover:shadow-lg hover:opacity-95 transition-all"
            onClick={() => setSetupDone(false)}
          >
            <Users className="w-3.5 h-3.5 mr-1.5" /> Edit Players
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

        {/* NSA Post — only for fixtures linked to NSA (team codes resolve in NSA roster) */}
        {setupDone && activeMember?.id && nsaLive && (
          <Button variant="outline" className="w-full border-amber-500/50 text-amber-700 hover:bg-amber-500/10" size="sm" onClick={() => setNsaDialogOpen(true)}>
            <Send className="w-4 h-4 mr-1" /> Post to NSA
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

      {activeMember?.id && nsaLive && (
        <NsaSubmitDialog
          open={nsaDialogOpen}
          onOpenChange={setNsaDialogOpen}
          clubMemberId={activeMember.id}
          fixtureRowId={fixture?.id}
          homeTeamCode={fixture?.home_team_code}
          awayTeamCode={fixture?.away_team_code}
          fixtureDate={fixture?.fixture_date}
          matches={positions.map((p) => ({
            home_nsf: (p.homeCode || "").toUpperCase(),
            away_nsf: (p.awayCode || "").toUpperCase(),
            home_player_name: p.homeName,
            away_player_name: p.awayName,
            games: (p.scores || []).slice(0, 5).map((s) => [s.home, s.away] as [number, number]),
          }))}
        />
      )}
    </div>
  );
}
