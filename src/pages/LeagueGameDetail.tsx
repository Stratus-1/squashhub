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
import { Check, Loader2, Trophy, Play, Edit3, ArrowLeft, Save, ArrowLeftRight, UserX, RotateCcw, Trash2, X, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useIsClubAdmin } from "@/hooks/use-club";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import type { MarkerConfig } from "@/components/marker/MarkerSetup";
import { clearMarkerStateForSession, getMarkerSessionKeys, hasMarkerStateForSession } from "@/lib/marker-storage";
import { cn } from "@/lib/utils";
import { LineupSwapDialog, type SwapCandidate } from "@/components/league-games/LineupSwapDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RosterPanel } from "@/components/league-games/RosterPanel";
import { useNsaTeam, useNsaTeamByCode, type NsaTeamPlayer } from "@/hooks/use-nsa";
import { NsaSubmitDialog } from "@/components/league-games/NsaSubmitDialog";
import { AdminManualScoreDialog } from "@/components/league-games/AdminManualScoreDialog";
import { useMemberContext } from "@/contexts/MemberContext";
import { Send } from "lucide-react";
import { useAssociationRules } from "@/hooks/use-association-rules";
import { NsaPenaltyBadge } from "@/components/nsa/NsaPenaltyBadge";
import { TeamLogo } from "@/components/league-games/TeamLogo";
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

interface OriginalLineupSnapshot {
  home: string[];
  away: string[];
}

// Penalty points deducted from a team when one of their players forfeits a position
const FORFEIT_PENALTY_POINTS = 2;

// Maximum supported positions per team (NIL flexible mode can grow up to this; NSA standard is 4).
const MAX_POSITIONS = 8;
const DEFAULT_POSITIONS = 4;
const resolveFixtureBaseSize = (
  homeRule: { team_size?: number | null } | undefined,
  awayRule: { team_size?: number | null } | undefined,
  _mode: "fixed" | "flexible",
  fallback = DEFAULT_POSITIONS,
) => {
  const sizes = [homeRule?.team_size, awayRule?.team_size]
    .map((size) => Number(size))
    .filter((size) => Number.isFinite(size) && size > 0);
  if (sizes.length === 0) return fallback;
  return Math.max(...sizes);
};

type SavedMatchPosition = { position?: number | null };

const getSavedMaxPosition = (matches: SavedMatchPosition[] | null | undefined) => (
  Array.isArray(matches)
    ? Math.min(MAX_POSITIONS, Math.max(0, ...matches.map((m) => Number(m?.position) || 0)))
    : 0
);

const getLineupMaxPosition = (
  lineup: Record<string, Array<{ code?: string; name?: string }>> | null | undefined,
  codes: Array<string | null | undefined>,
) => {
  let maxPosition = 0;
  for (const code of codes) {
    if (!code) continue;
    const slots = lineup?.[code] || lineup?.[code.toUpperCase()] || [];
    for (let i = 0; i < Math.min(MAX_POSITIONS, slots.length); i++) {
      if (slots[i]?.code || slots[i]?.name) maxPosition = Math.max(maxPosition, i + 1);
    }
  }
  return maxPosition;
};
function emptyPositions(count: number = DEFAULT_POSITIONS): PositionEntry[] {
  return Array.from({ length: count }, () => ({
    homeCode: "", homeName: "", awayCode: "", awayName: "",
    scores: [], completed: false, isForfeit: false, forfeitSide: null,
  }));
}

const normalizePlayerCode = (code: string | null | undefined) => (code || "").trim().toUpperCase();
const normalizePlayerName = (name: string | null | undefined) => (name || "").trim().replace(/\s+/g, " ").toUpperCase();

const buildOriginalSnapshot = (rows: PositionEntry[]): OriginalLineupSnapshot => ({
  home: rows.map((p) => normalizePlayerCode(p.homeCode)),
  away: rows.map((p) => normalizePlayerCode(p.awayCode)),
});

const hasOriginalSnapshot = (snapshot: OriginalLineupSnapshot | null) =>
  !!snapshot && [...snapshot.home, ...snapshot.away].some(Boolean);

const countEligibleOriginalPlayers = (
  rows: PositionEntry[],
  side: "home" | "away",
  permanentSquadCodes: string[] = [],
  permanentSquadNames: string[] = [],
) => {
  const codeKey = side === "home" ? "homeCode" : "awayCode";
  const nameKey = side === "home" ? "homeName" : "awayName";
  const squadCodeSet = new Set(
    permanentSquadCodes.map((c) => normalizePlayerCode(c)).filter(Boolean),
  );
  const squadNameSet = new Set(
    permanentSquadNames.map((n) => normalizePlayerName(n)).filter(Boolean),
  );
  return rows.reduce((count, row) => {
    const currentCode = normalizePlayerCode(row[codeKey]);
    const currentName = normalizePlayerName(row[nameKey] as string);
    if (!currentCode && !currentName) return count;
    // Only players currently registered in the team's permanent squad qualify.
    // A substitute must never earn original-player bonus points.
    if (currentCode && squadCodeSet.has(currentCode)) return count + 1;
    if (currentName && squadNameSet.has(currentName)) return count + 1;
    return count;
  }, 0);
};

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
  const [adminManualOpen, setAdminManualOpen] = useState(false);

  const [positions, setPositions] = useState<PositionEntry[]>(emptyPositions());
  const [setupDone, setSetupDone] = useState(false);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const [resumableMarker, setResumableMarker] = useState<number | null>(null);
  const [firstHintVisible, setFirstHintVisible] = useState(true);
  useEffect(() => {
    if (!firstHintVisible) return;
    const t = setTimeout(() => setFirstHintVisible(false), 2000);
    return () => clearTimeout(t);
  }, [firstHintVisible]);
  const liveScoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualEntry, setManualEntry] = useState<number | null>(null);
  // Indices of completed games (within the current manualEntry rubber) that the
  // user has explicitly chosen to edit. All other completed games are locked.
  const [manualUnlocked, setManualUnlocked] = useState<Set<number>>(new Set());
  const [homeSig, setHomeSig] = useState("");
  const [awaySig, setAwaySig] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{ idx: number; side: "home" | "away" } | null>(null);
  const [originalLineupSnapshot, setOriginalLineupSnapshot] = useState<OriginalLineupSnapshot | null>(null);
  const [adminOverride, setAdminOverride] = useState(false);
  const isClubAdmin = useIsClubAdmin();
  // Admin manual adjustment to original-player count (e.g. unrecorded sub).
  // Stored as a signed delta applied on top of the computed count.
  const [originalCountAdj, setOriginalCountAdj] = useState<{ home: number; away: number }>({ home: 0, away: 0 });
  const [savingOpbAdj, setSavingOpbAdj] = useState(false);

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

  const { data: fixtureCourt } = useQuery({
    queryKey: ["league-fixture-court", fixture?.court_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("courts").select("name").eq("id", fixture!.court_id!).maybeSingle();
      if (error) throw error; return data as { name: string } | null;
    },
    enabled: !!fixture?.court_id,
  });

  const { data: existingResult, isFetched: existingResultFetched } = useQuery({
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

  // Resolve team codes (e.g. "NIL002") to friendly league/team names from the
  // `leagues` table. Hook lives here (above early returns) to obey Rules of Hooks.
  const { data: teamMeta } = useQuery({
    queryKey: ["league-team-meta", fixture?.home_team_code, fixture?.away_team_code],
    enabled: !!(fixture?.home_team_code || fixture?.away_team_code),
    queryFn: async () => {
      const empty = {
        nameByCode: {} as Record<string, string>,
        clubIdByCode: {} as Record<string, string>,
        captainCodeByCode: {} as Record<string, string>,
        logoByCode: {} as Record<string, string>,
        ruleByCode: {} as Record<string, { team_size: number; team_size_mode: "fixed" | "flexible"; points_per_game: number | null }>,
      };
      const codes = [fixture?.home_team_code, fixture?.away_team_code].filter(Boolean) as string[];
      if (codes.length === 0) return empty;
      const { data: leagues } = await (supabase as any)
        .from("leagues").select("id, code, name, club_id, captain_member_id, logo_url").in("code", codes);
      const nameByCode: Record<string, string> = {};
      const clubIdByCode: Record<string, string> = {};
      const leagueIdToCode: Record<string, string> = {};
      const captainMemberIdByCode: Record<string, string> = {};
      const logoByCode: Record<string, string> = {};
      for (const l of (leagues || []) as any[]) {
        const k = String(l.code || "").toUpperCase();
        if (l.name) nameByCode[k] = l.name;
        if (l.club_id) clubIdByCode[k] = l.club_id;
        leagueIdToCode[l.id] = k;
        if (l.captain_member_id) captainMemberIdByCode[k] = l.captain_member_id;
        if (l.logo_url) logoByCode[k] = l.logo_url;
      }
      const leagueIds = (leagues || []).map((l: any) => l.id);
      const ruleByCode: Record<string, { team_size: number; team_size_mode: "fixed" | "flexible"; points_per_game: number | null }> = {};
      if (leagueIds.length) {
        const { data: teamRules } = await (supabase as any)
          .from("league_rules")
          .select("league_id, team_size, team_size_mode, points_per_game")
          .in("league_id", leagueIds);
        for (const r of (teamRules || []) as any[]) {
          const k = leagueIdToCode[r.league_id];
          const size = Number(r.team_size);
          if (k) {
            ruleByCode[k] = {
              team_size: Number.isFinite(size) && size > 0 ? Math.min(MAX_POSITIONS, Math.max(1, Math.floor(size))) : DEFAULT_POSITIONS,
              team_size_mode: r.team_size_mode === "flexible" ? "flexible" : "fixed",
              points_per_game: typeof r.points_per_game === "number" ? r.points_per_game : null,
            };
          }
        }
        const { data: caps } = await (supabase as any)
          .from("member_league_registrations")
          .select("league_id, club_member_id, is_captain")
          .in("league_id", leagueIds)
          .eq("is_captain", true);
        for (const c of (caps || []) as any[]) {
          const k = leagueIdToCode[c.league_id];
          if (k) captainMemberIdByCode[k] = c.club_member_id;
        }
      }
      const captainCodeByCode: Record<string, string> = {};
      const captainIds = Array.from(new Set(Object.values(captainMemberIdByCode)));
      if (captainIds.length) {
        const { data: regs } = await (supabase as any)
          .from("member_league_registrations")
          .select("club_member_id, league_association_number, ssa_number")
          .in("club_member_id", captainIds);
        const codeByMember = new Map<string, string>();
        for (const r of (regs || []) as any[]) {
          const code = (r.league_association_number || r.ssa_number || "").toString().toUpperCase();
          if (code && !codeByMember.has(r.club_member_id)) codeByMember.set(r.club_member_id, code);
        }
        const missing = captainIds.filter(id => !codeByMember.has(id));
        if (missing.length) {
          const { data: members } = await supabase.from("club_members").select("id, club_member_number").in("id", missing);
          for (const m of (members || []) as any[]) {
            if (m.club_member_number) codeByMember.set(m.id, String(m.club_member_number).toUpperCase());
          }
        }
        for (const [k, mid] of Object.entries(captainMemberIdByCode)) {
          const c = codeByMember.get(mid);
          if (c) captainCodeByCode[k] = c;
        }
      }
      return { nameByCode, clubIdByCode, captainCodeByCode, logoByCode, ruleByCode };
    },
  });
  const teamNamesByCode = teamMeta?.nameByCode;
  const teamLogosByCode = teamMeta?.logoByCode;
  const teamRulesByCode = teamMeta?.ruleByCode;

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


  // How many positions this fixture needs (4 default, grows to 5 when both teams have a 5th player).
  // Updated by an effect below once prefill / saved matches are available.
  const [positionCount, setPositionCount] = useState<number>(DEFAULT_POSITIONS);

  // Apply association-level league rules — pulled up early because positionCount
  // logic below needs team_size_mode / team_size to clamp scorecard size.
  const { data: leagueRules } = useAssociationRules(fixture?.association_id);


  // Resize positions state when positionCount changes (preserves existing entries).
  useEffect(() => {
    setPositions((prev) => {
      if (prev.length === positionCount) return prev;
      if (prev.length < positionCount) {
        return [
          ...prev,
          ...Array.from({ length: positionCount - prev.length }, () => ({
            homeCode: "", homeName: "", awayCode: "", awayName: "",
            scores: [] as { home: number; away: number }[], completed: false, isForfeit: false, forfeitSide: null as "home" | "away" | null,
          })),
        ];
      }
      // Shrinking: only drop trailing slots that are still empty AND have no scores.
      const next = [...prev];
      while (next.length > positionCount) {
        const last = next[next.length - 1];
        const hasPlay = (last.scores && last.scores.length > 0) || !!last.isForfeit;
        if (hasPlay) break;
        next.pop();
      }
      return next;
    });
  }, [positionCount]);

  useEffect(() => {
    if (existingMatches && existingMatches.length > 0) {
      // Keep the scorecard large enough for the biggest configured team, any saved
      // rubber rows, or the already-expanded local lineup while async refreshes land.
      const homeRule = fixture?.home_team_code ? teamRulesByCode?.[fixture.home_team_code.toUpperCase()] : undefined;
      const awayRule = fixture?.away_team_code ? teamRulesByCode?.[fixture.away_team_code.toUpperCase()] : undefined;
      // Per-league rules win over the association-wide fallback. Only fall back to
      // leagueRules when NEITHER team has its own rule row.
      const hasTeamRule = !!(homeRule || awayRule);
      const mode = hasTeamRule
        ? ((homeRule?.team_size_mode ?? awayRule?.team_size_mode) as "fixed" | "flexible")
        : (leagueRules?.team_size_mode ?? "fixed");
      const baseSize = hasTeamRule
        ? resolveFixtureBaseSize(homeRule, awayRule, mode)
        : (leagueRules?.team_size ?? DEFAULT_POSITIONS);
      const targetCount = Math.min(MAX_POSITIONS, Math.max(1, baseSize, getSavedMaxPosition(existingMatches), positionCount));
      const loaded = Array.from({ length: targetCount }, (_, i) => {
        const pos = i + 1;
        const m = existingMatches.find((r: any) => r.position === pos);
        if (!m) return { homeCode: "", homeName: "", awayCode: "", awayName: "", scores: [], completed: false, isForfeit: false, forfeitSide: null };
        const scores = (m.game_scores as any[]) || [];
        const gamesToWin = bestOf === 5 ? 3 : 2;
        let hw = 0, aw = 0;
        for (const s of scores) { if (s.home > s.away) hw++; else if (s.away > s.home) aw++; }
        const matchDecided = hw >= gamesToWin || aw >= gamesToWin;
        // If this saved row has no actual play recorded (no scores, no forfeit),
        // treat it as empty so the live prefill (captain lineup → current registration
        // ranks) takes over. Otherwise admin rank changes wouldn't reflect on
        // unplayed scorecards because of stale auto-seeded rows.
        const hasPlay = scores.length > 0 || !!m.is_forfeit;
        if (!hasPlay) {
          return { homeCode: "", homeName: "", awayCode: "", awayName: "", scores: [], completed: false, isForfeit: false, forfeitSide: null };
        }
        return {
          homeCode: m.home_player_code || "", homeName: m.home_player_name || "",
          awayCode: m.away_player_code || "", awayName: m.away_player_name || "",
          scores, completed: matchDecided || !!m.is_forfeit,
          isForfeit: !!m.is_forfeit,
          forfeitSide: (m.forfeit_side as "home" | "away" | null) ?? null,
        };
      });

      setPositions((prev) => {
        // Don't clobber the position the user is actively marking/editing locally —
        // realtime refresh would otherwise overwrite in-progress scores.
        return loaded.map((p, i) => (i === activeMarker || i === manualEntry ? (prev[i] ?? p) : p));
      });
      const savedSnapshot = (existingResult?.match_format as any)?.originalLineupSnapshot as OriginalLineupSnapshot | undefined;
      if (existingResultFetched && !hasOriginalSnapshot(savedSnapshot ?? null) && !hasOriginalSnapshot(originalLineupSnapshot)) {
        setOriginalLineupSnapshot(buildOriginalSnapshot(loaded));
      }
      setSetupDone(true);
    }
  }, [existingMatches, activeMarker, manualEntry, originalLineupSnapshot, existingResult, existingResultFetched, positionCount, leagueRules, fixture, teamRulesByCode]);

  useEffect(() => {
    const savedSnapshot = (existingResult?.match_format as any)?.originalLineupSnapshot as OriginalLineupSnapshot | undefined;
    if (hasOriginalSnapshot(originalLineupSnapshot) || !hasOriginalSnapshot(savedSnapshot ?? null)) return;
    setOriginalLineupSnapshot(savedSnapshot!);
  }, [existingResult, originalLineupSnapshot]);

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
      const leagueIdToCode = new Map<string, string>();
      for (const l of leagues as any[]) {
        if (l.id && l.code) leagueIdToCode.set(l.id, String(l.code).toUpperCase());
      }
      const ruleByCode: Record<string, { team_size: number; team_size_mode: "fixed" | "flexible" }> = {};
      const { data: teamRules } = await (supabase as any)
        .from("league_rules")
        .select("league_id, team_size, team_size_mode")
        .in("league_id", leagueIds);
      for (const r of (teamRules || []) as any[]) {
        const k = leagueIdToCode.get(r.league_id);
        const size = Number(r.team_size);
        if (k && Number.isFinite(size) && size > 0) {
          ruleByCode[k] = {
            team_size: Math.min(MAX_POSITIONS, Math.max(1, Math.floor(size))),
            team_size_mode: r.team_size_mode === "flexible" ? "flexible" : "fixed",
          };
        }
      }

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

      // Build per-team-code positions [1..5]
      // We build TWO maps:
      //   - result: prefill for the scorecard (week → fixture override → regs)
      //   - originals: snapshot of captain's ORIGINAL allocation (week → regs only,
      //     ignoring per-fixture overrides). Used to award the original-player bonus
      //     so swapping in a reserve via Edit Players never re-classifies them as original.
      const result: Record<string, Array<{ code: string; name: string }>> = {};
      const originals: Record<string, Array<{ code: string; name: string }>> = {};
      // Fixture-wide floor: if one team plays 5/match the scorecard renders 5
      // rows, so the opposing team should also fill up to that many positions
      // from its registered squad — otherwise its 5th player (e.g. Susan
      // Crafford) silently disappears from the lineup.
      const fixtureWideSize = Math.min(
        MAX_POSITIONS,
        Math.max(
          DEFAULT_POSITIONS,
          ...codes.map((c) => ruleByCode[String(c || "").toUpperCase()]?.team_size ?? DEFAULT_POSITIONS),
        ),
      );
      for (const code of codes) {
        const slots: Array<{ code: string; name: string }> = Array.from({ length: MAX_POSITIONS }, () => ({ code: "", name: "" }));
        const origSlots: Array<{ code: string; name: string }> = Array.from({ length: MAX_POSITIONS }, () => ({ code: "", name: "" }));
        const matchingLeagues = leagues.filter((l: any) => l.code === code).map((l: any) => l.id);

        const regByMember = new Map<string, any>();
        (regs || [])
          .filter((r: any) => matchingLeagues.includes(r.league_id))
          .forEach((r: any) => regByMember.set(r.club_member_id, r));

        const buildSlot = (memberId: string) => {
          const m = memberMap.get(memberId) as any;
          const reg = regByMember.get(memberId);
          const code =
            (reg?.league_association_number || reg?.ssa_number || nsfByMember.get(memberId) || m?.club_member_number || "")
              .toString()
              .toUpperCase();
          return { code, name: m?.name || "" };
        };

        // Track members already placed in this team to prevent the same player
        // appearing in two positions (e.g. due to a stale fixture override row).
        const usedMembers = new Set<string>();

        const fillSlot = (target: Array<{ code: string; name: string }>, pos: number, memberId: string) => {
          if (pos < 1 || pos > MAX_POSITIONS) return;
          if (target[pos - 1].code || target[pos - 1].name) return;
          if (usedMembers.has(memberId)) return;
          target[pos - 1] = buildSlot(memberId);
          usedMembers.add(memberId);
        };

        // Priority 1: Fill-Up Leagues week lineup → goes into BOTH (originals and prefill)
        weekLineups
          .filter((l: any) => matchingLeagues.includes(l.league_id))
          .forEach((l: any) => {
            fillSlot(slots, l.position, l.club_member_id);
            fillSlot(origSlots, l.position, l.club_member_id);
          });

        // Priority 2: explicit per-fixture lineup → ONLY into prefill (not originals)
        (fixtureLineups || [])
          .filter((l: any) => matchingLeagues.includes(l.league_id))
          .forEach((l: any) => fillSlot(slots, l.position, l.club_member_id));

        // Priority 3: registrations by player_rank for any unfilled positions → BOTH
        // Cap the fallback to the highest position already established by the captain's
        // week lineup or per-fixture override (or DEFAULT_POSITIONS). This prevents
        // unused registered players from being appended as phantom extra positions
        // beyond what was actually played.
        const teamRegs = (regs || [])
          .filter((r: any) => matchingLeagues.includes(r.league_id))
          .sort((a: any, b: any) => (a.player_rank || 99) - (b.player_rank || 99));
        const teamRule = ruleByCode[String(code || "").toUpperCase()];
        const fallbackSize = teamRule?.team_size ?? DEFAULT_POSITIONS;
        // In flexible team-size mode (e.g. NIL), grow the scorecard to include
        // all registered players (capped at MAX_POSITIONS) so a 5th, 6th, etc.
        // player on the roster appears on the scorecard automatically.
        const flexibleCap = teamRule?.team_size_mode === "flexible"
          ? Math.min(MAX_POSITIONS, Math.max(fallbackSize, teamRegs.length))
          : Math.max(fallbackSize, fixtureWideSize);
        const maxExplicitPos = Math.min(MAX_POSITIONS, Math.max(
          flexibleCap,
          ...weekLineups
            .filter((l: any) => matchingLeagues.includes(l.league_id))
            .map((l: any) => l.position || 0),
          ...(fixtureLineups || [])
            .filter((l: any) => matchingLeagues.includes(l.league_id))
            .map((l: any) => l.position || 0),
        ));
        let regIdx = 0;
        for (let i = 0; i < maxExplicitPos; i++) {
          if (slots[i].code || slots[i].name) continue;
          while (regIdx < teamRegs.length) {
            const r = teamRegs[regIdx++];
            if (usedMembers.has(r.club_member_id)) continue;
            const m = memberMap.get(r.club_member_id) as any;
            const code = (r.league_association_number || r.ssa_number || m?.club_member_number || "").toString().toUpperCase();
            const name = m?.name || "";
            if (!code && !name) continue;
            slots[i] = { code, name };
            usedMembers.add(r.club_member_id);
            if (!origSlots[i].code && !origSlots[i].name) origSlots[i] = { code, name };
            break;
          }
        }
        result[code] = slots;
        originals[code] = origSlots;
      }
      return { lineup: result, originals };
    },
    enabled: !!fixture && !!fixtureId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  // (team-size effect moved below leagueRules declaration)


  // (e.g. user returns from Edit Players in another tab/route).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && fixtureId) {
        queryClient.invalidateQueries({ queryKey: ["league-fixture-prefill", fixtureId] });
        queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
        queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fixtureId, queryClient]);

  // Apply prefill from the captain's Fill-Up Leagues lineup.
  //  - For each position, if real play has been recorded for THAT slot
  //    (scores or forfeit), keep it as-is.
  //  - Otherwise, populate from the captain's latest Fill-Up lineup so
  //    additional slots (e.g. a 5th player added after positions 1-2 were
  //    already scored) appear immediately.
  useEffect(() => {
    if (!prefillLineup || !fixture) return;
    const lineup = (prefillLineup as any)?.lineup || {};
    const homeSlots = lineup[fixture.home_team_code] || [];
    const awaySlots = lineup[fixture.away_team_code] || [];
    const homeHasAny = homeSlots.some((s: any) => s?.code || s?.name);
    const awayHasAny = awaySlots.some((s: any) => s?.code || s?.name);
    if (!homeHasAny && !awayHasAny) return;

    setPositions((prev) => {
      const next = prev.map((p, i) => {
        const home = homeSlots[i] || { code: "", name: "" };
        const away = awaySlots[i] || { code: "", name: "" };
        const slotHasPlay = (Array.isArray(p.scores) && p.scores.length > 0) || !!p.isForfeit;
        if (slotHasPlay) return p;
        // Preserve any side that already has a saved player (code OR name) — the
        // captain may have manually replaced a player with a reserve/visitor that
        // has no NSF code. Only fill empty sides from the captain's lineup.
        const homeAlreadySet = !!(p.homeCode || p.homeName);
        const awayAlreadySet = !!(p.awayCode || p.awayName);
        return {
          ...p,
          homeCode: !homeAlreadySet && homeHasAny ? (home.code || "") : p.homeCode,
          homeName: !homeAlreadySet && homeHasAny ? (home.name || "") : p.homeName,
          awayCode: !awayAlreadySet && awayHasAny ? (away.code || "") : p.awayCode,
          awayName: !awayAlreadySet && awayHasAny ? (away.name || "") : p.awayName,
        };
      });
      if (
        !hasOriginalSnapshot(originalLineupSnapshot) ||
        next.length > Math.max(originalLineupSnapshot?.home.length ?? 0, originalLineupSnapshot?.away.length ?? 0)
      ) {
        setOriginalLineupSnapshot(buildOriginalSnapshot(next));
      }
      return next;
    });
  }, [prefillLineup, existingMatches, fixture, originalLineupSnapshot, positionCount]);

  // (leagueRules fetched above near positionCount declaration)

  // Decide team size from association rules.
  //   - Starts from configured team size and grows to include saved/local lineup rows.
  //   - This prevents 5-player NIL scorecards briefly rendering correctly, then
  //     shrinking back to 4 when saved results or rule metadata refresh later.
  useEffect(() => {
    const homeRule = fixture?.home_team_code ? teamRulesByCode?.[fixture.home_team_code.toUpperCase()] : undefined;
    const awayRule = fixture?.away_team_code ? teamRulesByCode?.[fixture.away_team_code.toUpperCase()] : undefined;
    // Per-league rule wins over the association-wide fallback (which may be
    // "flexible" while individual leagues are fixed at 4 or 5).
    const hasTeamRule = !!(homeRule || awayRule);
    const mode = hasTeamRule
      ? ((homeRule?.team_size_mode ?? awayRule?.team_size_mode) as "fixed" | "flexible")
      : (leagueRules?.team_size_mode ?? "fixed");
    const baseSize = Math.min(
      MAX_POSITIONS,
      Math.max(
        1,
        hasTeamRule
          ? resolveFixtureBaseSize(homeRule, awayRule, mode)
          : (leagueRules?.team_size ?? DEFAULT_POSITIONS),
      ),
    );
    const homeCode = fixture?.home_team_code;
    const awayCode = fixture?.away_team_code;
    const lineup = (prefillLineup as any)?.lineup || {};
    const maxFilled = Math.min(
      MAX_POSITIONS,
      Math.max(baseSize, getSavedMaxPosition(existingMatches), getLineupMaxPosition(lineup, [homeCode, awayCode])),
    );
    setPositionCount((prev) => (prev === maxFilled ? prev : maxFilled));
  }, [fixture, prefillLineup, existingMatches, leagueRules, teamRulesByCode]);
  useEffect(() => {
    if (leagueRules) {
      const homeRule = fixture?.home_team_code ? teamRulesByCode?.[fixture.home_team_code.toUpperCase()] : undefined;
      const awayRule = fixture?.away_team_code ? teamRulesByCode?.[fixture.away_team_code.toUpperCase()] : undefined;
      const ppg = homeRule?.points_per_game ?? awayRule?.points_per_game ?? leagueRules.points_per_game;
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
      if (fmt.originalCountAdjustment) {
        setOriginalCountAdj({
          home: Number(fmt.originalCountAdjustment.home) || 0,
          away: Number(fmt.originalCountAdjustment.away) || 0,
        });
      }
    }
  }, [leagueRules, existingResult, fixture, teamRulesByCode]);

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

  const setupValid = positions.some((p) => (p.homeCode || p.homeName) && (p.awayCode || p.awayName));

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
      const emptyIdx = prev.findIndex((p) => !p[codeKey] && !p[nameKey]);
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

  const buildSwappedPositions = useCallback((rows: PositionEntry[], idx: number, side: "home" | "away", c: SwapCandidate) => {
    const next = rows.map((p) => ({ ...p }));
    const codeUpper = c.code.toUpperCase();
    const candidateNameKey = normalizePlayerName(c.name);
    const targetCodeKey = side === "home" ? "homeCode" : "awayCode";
    const targetNameKey = side === "home" ? "homeName" : "awayName";
    let existingIdx = -1;
    let existingSide: "home" | "away" | null = null;
    next.forEach((p, i) => {
      const homeMatches = codeUpper ? p.homeCode.toUpperCase() === codeUpper : normalizePlayerName(p.homeName) === candidateNameKey;
      const awayMatches = codeUpper ? p.awayCode.toUpperCase() === codeUpper : normalizePlayerName(p.awayName) === candidateNameKey;
      if (homeMatches) { existingIdx = i; existingSide = "home"; }
      else if (awayMatches) { existingIdx = i; existingSide = "away"; }
    });
    const targetOldCode = next[idx][targetCodeKey];
    const targetOldName = next[idx][targetNameKey];
    next[idx] = { ...next[idx], [targetCodeKey]: codeUpper, [targetNameKey]: c.name };
    if (existingIdx >= 0 && existingSide === side && existingIdx !== idx) {
      const oldCodeKey = existingSide === "home" ? "homeCode" : "awayCode";
      const oldNameKey = existingSide === "home" ? "homeName" : "awayName";
      next[existingIdx] = { ...next[existingIdx], [oldCodeKey]: targetOldCode, [oldNameKey]: targetOldName };
    } else if (existingIdx >= 0 && existingSide && existingSide !== side) {
      const oldCodeKey = existingSide === "home" ? "homeCode" : "awayCode";
      const oldNameKey = existingSide === "home" ? "homeName" : "awayName";
      next[existingIdx] = { ...next[existingIdx], [oldCodeKey]: "", [oldNameKey]: "" };
    }
    return next;
  }, []);

  const handleSwap = useCallback(async (c: SwapCandidate) => {
    if (!swapTarget) return;
    const { idx, side } = swapTarget;
    const updatedPositionsForSave = buildSwappedPositions(positions, idx, side, c);

    setPositions(updatedPositionsForSave);

    setSwapTarget(null);
    toast.success(`Player swapped — remember to save setup`);

    // If setup already saved, persist immediately
    if (setupDone && fixtureId && user) {
      try {
        for (let i = 0; i < updatedPositionsForSave.length; i++) {
          const p = updatedPositionsForSave[i];
          if (!p.homeCode && !p.awayCode && !p.homeName && !p.awayName) continue;
          await supabase.from("league_match_results" as any).upsert({
            fixture_id: fixtureId, position: i + 1,
            home_player_code: p.homeCode.toUpperCase(),
            away_player_code: p.awayCode.toUpperCase(),
            home_player_name: p.homeName,
            away_player_name: p.awayName,
            game_scores: p.scores, home_games_won: 0, away_games_won: 0,
            winner: null,
          } as any, { onConflict: "fixture_id,position" });
        }
        queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
      } catch (e) { console.error("Swap persist failed", e); }
    }
  }, [swapTarget, setupDone, fixtureId, user, positions, queryClient, buildSwappedPositions]);

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


  // ---- Reset to default league players (clears Edit Players overrides) ----
  const handleResetToDefault = async () => {
    if (!fixtureId || !fixture) return;
    const hasRecordedPlay =
      Array.isArray(existingMatches) &&
      existingMatches.some((m: any) => (Array.isArray(m.game_scores) && m.game_scores.length > 0) || !!m.is_forfeit);
    if (hasRecordedPlay) {
      toast.error("Cannot reset — scores have already been recorded.");
      return;
    }
    if (!window.confirm("Reset both teams to the default league allocation? This will discard any reserve swaps for this fixture.")) return;
    try {
      // 1) Wipe per-fixture lineup overrides so prefill rebuilds from week/regs.
      await (supabase as any).from("league_fixture_lineups").delete().eq("fixture_id", fixtureId);
      // 2) Wipe any saved setup placeholders so reserves don't re-load.
      await (supabase as any).from("league_match_results").delete().eq("fixture_id", fixtureId);
      // 3) Reset snapshot so it rebuilds from the fresh defaults.
      setOriginalLineupSnapshot(null);
      // 4) Apply originals immediately from cached prefill.
      const originalsMap = (prefillLineup as any)?.originals || {};
      const homeOrig = originalsMap[fixture.home_team_code] || [];
      const awayOrig = originalsMap[fixture.away_team_code] || [];
      setPositions((prev) => prev.map((p, i) => ({
        ...p,
        homeCode: (homeOrig[i]?.code || "").toString().toUpperCase(),
        homeName: homeOrig[i]?.name || "",
        awayCode: (awayOrig[i]?.code || "").toString().toUpperCase(),
        awayName: awayOrig[i]?.name || "",
        scores: [],
        completed: false,
        isForfeit: false,
        forfeitSide: null,
      })));
      // 5) Refetch authoritative lineup data.
      await queryClient.invalidateQueries({ queryKey: ["league-fixture-prefill", fixtureId] });
      await queryClient.invalidateQueries({ queryKey: ["league-match-results", fixtureId] });
      await queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
      toast.success("Reset to default league players");
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset");
    }
  };

  // ---- Save Setup (persist player data without submitting results) ----
  const handleSaveSetup = async () => {
    if (!fixtureId || !user) return;
    setSavingSetup(true);
    try {
      const setupOriginalSnapshot = hasOriginalSnapshot(originalLineupSnapshot)
        ? originalLineupSnapshot!
        : buildOriginalSnapshot(positions);
      if (!hasOriginalSnapshot(originalLineupSnapshot)) setOriginalLineupSnapshot(setupOriginalSnapshot);
      for (let i = 0; i < positions.length; i++) {
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
      // Guardrail: remove any stale match rows beyond the configured team size
      // (e.g. a phantom 5th player left over from a captain editing mistake).
      await (supabase as any)
        .from("league_match_results")
        .delete()
        .eq("fixture_id", fixtureId)
        .gt("position", positions.length);
      const { error: sumErr } = await supabase.from("league_fixture_results" as any).upsert({
        fixture_id: fixtureId,
        home_total_games: 0, away_total_games: 0,
        home_bonus_points: 0, away_bonus_points: 0,
        home_total_points: 0, away_total_points: 0,
        winner: null, status: "setup",
        submitted_by: user.id,
        match_format: { scoringFormat, bestOf, originalLineupSnapshot: setupOriginalSnapshot },
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
  const buildMarkerConfigForPosition = useCallback((posIdx: number): MarkerConfig | null => {
    const pos = positions[posIdx];
    if (!pos || !fixtureId) return null;
    // Always derive from association rules when present so Super Admin's
    // configured format wins over any stale local state.
    const homeRule = fixture?.home_team_code ? teamRulesByCode?.[fixture.home_team_code.toUpperCase()] : undefined;
    const awayRule = fixture?.away_team_code ? teamRulesByCode?.[fixture.away_team_code.toUpperCase()] : undefined;
    const effectivePpg = homeRule?.points_per_game ?? awayRule?.points_per_game ?? leagueRules?.points_per_game;
    const effectiveFormat = effectivePpg === 15 ? "par15"
      : effectivePpg === 11 ? "par11"
      : scoringFormat;
    const effectiveBestOf = leagueRules?.games_format === "best_of_5" ? 5
      : leagueRules?.games_format === "best_of_3" ? 3
      : bestOf;
    return {
      playerA: { name: pos.homeName || pos.homeCode, number: pos.homeCode, club: fixture?.home_team_code || "" },
      playerB: { name: pos.awayName || pos.awayCode, number: pos.awayCode, club: fixture?.away_team_code || "" },
      isDoubles: false, matchType: "league", scoringFormat: effectiveFormat, bestOf: effectiveBestOf, deuceRule: "win_by_2",
      source: "league", sourceId: fixtureId,
      sourcePosition: posIdx + 1,
    };
  }, [positions, fixture, fixtureId, scoringFormat, bestOf, leagueRules, teamRulesByCode]);

  const startMarking = (posIdx: number) => {
    const pos = positions[posIdx];
    const homeOk = !!(pos.homeCode || pos.homeName);
    const awayOk = !!(pos.awayCode || pos.awayName);
    if (!homeOk || !awayOk) { toast.error("Both players required"); return; }
    const config = buildMarkerConfigForPosition(posIdx);
    if (config) clearMarkerStateForSession(getMarkerSessionKeys(config));
    setResumableMarker(null);
    setActiveMarker(posIdx);
  };

  const markerConfig = useMemo((): MarkerConfig | null => {
    if (activeMarker === null) return null;
    return buildMarkerConfigForPosition(activeMarker);
  }, [activeMarker, buildMarkerConfigForPosition]);

  useEffect(() => {
    if (!setupDone || activeMarker !== null) return;
    const idx = positions.findIndex((pos, posIdx) => {
      if (pos.completed || !pos.homeCode || !pos.awayCode) return false;
      const config = buildMarkerConfigForPosition(posIdx);
      return !!config && hasMarkerStateForSession(getMarkerSessionKeys(config));
    });
    setResumableMarker(idx >= 0 ? idx : null);
  }, [setupDone, activeMarker, positions, buildMarkerConfigForPosition]);

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
    let homeAllPoints = 0, awayAllPoints = 0;
    const posResults: { homeWins: number; awayWins: number }[] = [];
    for (const pos of positions) {
      let hw = 0, aw = 0;
      for (const s of pos.scores) {
        if (s.home > s.away) hw++; else if (s.away > s.home) aw++;
        homeAllPoints += s.home; awayAllPoints += s.away;
      }
      homeTotalGames += hw; awayTotalGames += aw;
      if (hw > aw) homeMatchWins++; else if (aw > hw) awayMatchWins++;
      posResults.push({ homeWins: hw, awayWins: aw });
      if (pos.isForfeit && pos.forfeitSide === "home") homePenaltyPoints += FORFEIT_PENALTY_POINTS;
      if (pos.isForfeit && pos.forfeitSide === "away") awayPenaltyPoints += FORFEIT_PENALTY_POINTS;
    }

    // Determine fixture winner: match wins → games → total points (NIL/NSA tiebreak)
    let fixtureWinner: "home" | "away" | "draw";
    if (homeMatchWins > awayMatchWins) fixtureWinner = "home";
    else if (awayMatchWins > homeMatchWins) fixtureWinner = "away";
    else if (homeTotalGames > awayTotalGames) fixtureWinner = "home";
    else if (awayTotalGames > homeTotalGames) fixtureWinner = "away";
    else if (homeAllPoints > awayAllPoints) fixtureWinner = "home";
    else if (awayAllPoints > homeAllPoints) fixtureWinner = "away";
    else fixtureWinner = "draw";

    // Match-result bonus (per association rules; defaults: per_match, value 1, no share)
    // - fixed_winner : flat bonusValue to fixture winner only
    // - per_match    : winning team gets bonusValue × rubbers they won (NSA rule); loser 0
    // - per_game_won : each side gets bonusValue × games they won
    const mode = leagueRules?.bonus_points_mode ?? "per_match";
    const bonusValue = leagueRules?.bonus_points_value ?? 1;
    const shareOnTie = !!leagueRules?.share_bonus_on_tie;
    let homeMatchBonus = 0, awayMatchBonus = 0;
    if (mode === "fixed_winner") {
      if (fixtureWinner === "home") homeMatchBonus = bonusValue;
      else if (fixtureWinner === "away") awayMatchBonus = bonusValue;
      else if (shareOnTie) { homeMatchBonus = bonusValue / 2; awayMatchBonus = bonusValue / 2; }
    } else if (mode === "per_match") {
      if (fixtureWinner === "home") homeMatchBonus = homeMatchWins * bonusValue;
      else if (fixtureWinner === "away") awayMatchBonus = awayMatchWins * bonusValue;
      else if (shareOnTie) {
        homeMatchBonus = (homeMatchWins * bonusValue) / 2;
        awayMatchBonus = (awayMatchWins * bonusValue) / 2;
      }
    } else if (mode === "per_game_won") {
      homeMatchBonus = homeMatchWins * bonusValue;
      awayMatchBonus = awayMatchWins * bonusValue;
    }

    // Original-player bonus (NIL): only registered permanent squad members qualify.
    // Subs/replacements never earn this bonus, regardless of snapshots or prior saves.
    const opbEnabled = !!leagueRules?.original_player_bonus_enabled;
    const opbValue = leagueRules?.original_player_bonus_value ?? 0;
    const homeTeamCode = fixture?.home_team_code || "";
    const awayTeamCode = fixture?.away_team_code || "";
    const originalsMap = (prefillLineup as any)?.originals || {};
    const fallbackOriginalCodes = (teamCode: string) =>
      (originalsMap[teamCode] || []).map((s: any) => normalizePlayerCode(s.code)).filter(Boolean);
    const fallbackOriginalNames = (teamCode: string) =>
      (originalsMap[teamCode] || []).map((s: any) => normalizePlayerName(s.name)).filter(Boolean);
    // SNAPSHOT-FIRST: once a fixture has been saved, the captain's permanent
    // squad at that moment is frozen in match_format.permanentSquadSnapshot.
    // We use that for bonus + SUB calcs forever after, so later registration
    // changes (promoting a reserve, removing a player) don't retroactively
    // change who counts as an "original" player for historical fixtures.
    // Re-edits to scores keep using the same snapshot.
    const savedSquad = (existingResult?.match_format as any)?.permanentSquadSnapshot as
      | { home?: { codes?: string[]; names?: string[] }; away?: { codes?: string[]; names?: string[] } }
      | undefined;
    const homePermanentSquad = (savedSquad?.home?.codes && savedSquad.home.codes.length > 0)
      ? savedSquad.home.codes.map(normalizePlayerCode).filter(Boolean)
      : fallbackOriginalCodes(homeTeamCode);
    const awayPermanentSquad = (savedSquad?.away?.codes && savedSquad.away.codes.length > 0)
      ? savedSquad.away.codes.map(normalizePlayerCode).filter(Boolean)
      : fallbackOriginalCodes(awayTeamCode);
    const homePermanentSquadNames = (savedSquad?.home?.names && savedSquad.home.names.length > 0)
      ? savedSquad.home.names.map(normalizePlayerName).filter(Boolean)
      : fallbackOriginalNames(homeTeamCode);
    const awayPermanentSquadNames = (savedSquad?.away?.names && savedSquad.away.names.length > 0)
      ? savedSquad.away.names.map(normalizePlayerName).filter(Boolean)
      : fallbackOriginalNames(awayTeamCode);
    const homeOriginalCountRaw = countEligibleOriginalPlayers(positions, "home", homePermanentSquad, homePermanentSquadNames);
    const awayOriginalCountRaw = countEligibleOriginalPlayers(positions, "away", awayPermanentSquad, awayPermanentSquadNames);
    // Admin manual delta (e.g. recorded player didn't actually play; an unlisted sub stepped in).
    const homeOriginalCount = Math.max(0, homeOriginalCountRaw + (originalCountAdj.home || 0));
    const awayOriginalCount = Math.max(0, awayOriginalCountRaw + (originalCountAdj.away || 0));
    const homeOriginalBonus = opbEnabled ? homeOriginalCount * opbValue : 0;
    const awayOriginalBonus = opbEnabled ? awayOriginalCount * opbValue : 0;

    const homeBonusPoints = homeMatchBonus + homeOriginalBonus;
    const awayBonusPoints = awayMatchBonus + awayOriginalBonus;
    const homeTotal = homeTotalGames + homeBonusPoints - homePenaltyPoints;
    const awayTotal = awayTotalGames + awayBonusPoints - awayPenaltyPoints;

    return {
      homeTotalGames, awayTotalGames,
      homeBonusPoints, awayBonusPoints,
      homeMatchBonus, awayMatchBonus,
      homeOriginalBonus, awayOriginalBonus,
      homeOriginalCount, awayOriginalCount,
      homePenaltyPoints, awayPenaltyPoints,
      homeAllPoints, awayAllPoints,
      homeTotal, awayTotal,
      winner: fixtureWinner,
      posResults,
      opbEnabled, opbValue,
      bonusMode: mode,
      // Expose the squad arrays used by THIS calc so handleSubmit can persist
      // them verbatim into match_format on first save (then freeze forever).
      _homePermanentSquadCodes: homePermanentSquad,
      _awayPermanentSquadCodes: awayPermanentSquad,
      _homePermanentSquadNames: homePermanentSquadNames,
      _awayPermanentSquadNames: awayPermanentSquadNames,
      _hadSavedSquad: !!(savedSquad?.home?.codes?.length || savedSquad?.away?.codes?.length
        || savedSquad?.home?.names?.length || savedSquad?.away?.names?.length),
    };
  }, [positions, leagueRules, prefillLineup, fixture, originalLineupSnapshot, existingResult, originalCountAdj]);

  // ---- Submit ----
  const handleSubmit = async () => {
    if (!fixtureId || !user) return;
    setSubmitting(true);
    try {
      const setupOriginalSnapshot = hasOriginalSnapshot(originalLineupSnapshot)
        ? originalLineupSnapshot!
        : buildOriginalSnapshot(positions);
      // FREEZE the permanent squad on first save and PRESERVE it on every
      // subsequent edit. This is the historical-integrity guarantee: bonus
      // points and SUB badges for a saved fixture never change just because
      // the captain later promoted a reserve or removed a player.
      const existingSavedSquad = (existingResult?.match_format as any)?.permanentSquadSnapshot as
        | { home?: { codes?: string[]; names?: string[] }; away?: { codes?: string[]; names?: string[] } }
        | undefined;
      const hasExistingSavedSquad = !!(
        existingSavedSquad?.home?.codes?.length || existingSavedSquad?.away?.codes?.length
        || existingSavedSquad?.home?.names?.length || existingSavedSquad?.away?.names?.length
      );
      const permanentSquadSnapshot = hasExistingSavedSquad
        ? existingSavedSquad!
        : {
            home: {
              codes: (summary as any)._homePermanentSquadCodes as string[],
              names: (summary as any)._homePermanentSquadNames as string[],
            },
            away: {
              codes: (summary as any)._awayPermanentSquadCodes as string[],
              names: (summary as any)._awayPermanentSquadNames as string[],
            },
          };
      for (let i = 0; i < positions.length; i++) {
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
        winner: summary.winner,
        status: (adminOverride || (isClubAdmin && isFixturePast) || (homeSig && awaySig)) ? "submitted" : "draft",
        home_captain_signature: homeSig || (existingResult as any)?.home_captain_signature || ((adminOverride || (isClubAdmin && isFixturePast)) ? "ADMIN_OVERRIDE" : null),
        away_captain_signature: awaySig || (existingResult as any)?.away_captain_signature || ((adminOverride || (isClubAdmin && isFixturePast)) ? "ADMIN_OVERRIDE" : null),
        submitted_by: user.id, submitted_at: new Date().toISOString(),
        match_format: { scoringFormat, bestOf, originalLineupSnapshot: setupOriginalSnapshot, permanentSquadSnapshot },
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

  // Permanent squad lookup (codes + names) for each team — used to keep SUB badge
  // in sync with original-player bonus logic: anyone who is a current full-time
  // squad member is NOT a sub, even if they swap slots.
  // Prefers the FROZEN snapshot stored in match_format.permanentSquadSnapshot
  // for any fixture that has already been saved (so historical SUB badges stay
  // consistent with the bonus points captured on the day).
  const { homeSquadSet, awaySquadSet, homeSquadNameSet, awaySquadNameSet } = useMemo(() => {
    const savedSquad = (existingResult?.match_format as any)?.permanentSquadSnapshot as
      | { home?: { codes?: string[]; names?: string[] }; away?: { codes?: string[]; names?: string[] } }
      | undefined;
    const originalsMap = (prefillLineup as any)?.originals || {};
    const codesFromLive = (teamCode: string) => new Set(
      (originalsMap[teamCode] || []).map((s: any) => normalizePlayerCode(s.code)).filter(Boolean) as string[]
    );
    const namesFromLive = (teamCode: string) => new Set(
      (originalsMap[teamCode] || []).map((s: any) => normalizePlayerName(s.name)).filter(Boolean) as string[]
    );
    const codesFromSaved = (arr?: string[]) =>
      arr && arr.length > 0 ? new Set(arr.map(normalizePlayerCode).filter(Boolean) as string[]) : null;
    const namesFromSaved = (arr?: string[]) =>
      arr && arr.length > 0 ? new Set(arr.map(normalizePlayerName).filter(Boolean) as string[]) : null;
    return {
      homeSquadSet: codesFromSaved(savedSquad?.home?.codes) || codesFromLive(fixture?.home_team_code || ""),
      awaySquadSet: codesFromSaved(savedSquad?.away?.codes) || codesFromLive(fixture?.away_team_code || ""),
      homeSquadNameSet: namesFromSaved(savedSquad?.home?.names) || namesFromLive(fixture?.home_team_code || ""),
      awaySquadNameSet: namesFromSaved(savedSquad?.away?.names) || namesFromLive(fixture?.away_team_code || ""),
    };
  }, [prefillLineup, fixture, existingResult]);

  if (!fixture) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const isSubmittedRaw = existingResult?.status === "submitted" || existingResult?.status === "confirmed";
  const hasUnfinishedPlayablePositions = positions.some((pos) => {
    const hasPlayers = !!(pos.homeCode || pos.homeName) && !!(pos.awayCode || pos.awayName);
    return hasPlayers && !pos.completed && !pos.isForfeit;
  });
  const isSubmittedLocked = isSubmittedRaw && !hasUnfinishedPlayablePositions;
  const fixtureDateStr: string | undefined = (fixture as any)?.fixture_date;
  const fixtureStartTime: string | undefined = (fixture as any)?.start_time;
  const isFixturePast = (() => {
    if (!fixtureDateStr) return false;
    const today = format(new Date(), "yyyy-MM-dd");
    if (fixtureDateStr < today) return true;
    if (fixtureDateStr === today && fixtureStartTime) {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      return fixtureStartTime <= hhmm;
    }
    return false;
  })();
  // Captains can edit until results are submitted. Once submitted, only admins
  // (with adminOverride) may re-open. We no longer auto-lock past-date fixtures
  // that have not yet been captured — captains often fill the scorecard the
  // morning after league night.
  const isSubmitted = isSubmittedLocked && !adminOverride;

  // Scoreboard always shows the live recomputed summary (current rules).
  // Standings reads stored fixture totals — when association rules change,
  // run the admin recalc to bring stored totals back in sync.
  const displaySummary = summary;





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
            initialScores={(positions[activeMarker]?.scores || []).map((s) => ({ a: s.home, b: s.away }))}
            onMatchComplete={handleMarkerComplete}
            onReset={() => setActiveMarker(null)}
            onScratch={() => {
              if (activeMarker === null) return;
              const current = positions[activeMarker];
              if (current) {
                const cleared = { ...current, scores: [], completed: false };
                setPositions((prev) => { const next = [...prev]; next[activeMarker] = cleared; return next; });
                persistPositionScores(activeMarker, cleared);
              }
              setActiveMarker(null);
            }}
            onProgress={(games) => {
              if (activeMarker === null) return;
              const current = positions[activeMarker];
              if (!current) return;
              // Persist game-by-game so other viewers see live progress.
              const updated = { ...current, scores: games.map((g) => ({ home: g.a, away: g.b })) };
              setPositions((prev) => { const next = [...prev]; next[activeMarker] = updated; return next; });
              persistPositionScores(activeMarker, updated);
            }}
            onLiveScore={(games, cur) => {
              if (activeMarker === null) return;
              const current = positions[activeMarker];
              if (!current) return;
              // Append the in-progress game (only when there are points scored).
              const inProgress = (cur.a > 0 || cur.b > 0) ? [{ home: cur.a, away: cur.b }] : [];
              const scores = [...games.map((g) => ({ home: g.a, away: g.b })), ...inProgress];
              const updated = { ...current, scores, completed: false };
              setPositions((prev) => { const next = [...prev]; next[activeMarker] = updated; return next; });
              // Debounce DB writes to ~600ms to avoid hammering on rapid points
              if (liveScoreTimerRef.current) clearTimeout(liveScoreTimerRef.current);
              liveScoreTimerRef.current = setTimeout(() => {
                persistPositionScores(activeMarker, updated);
              }, 600);
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
                  type="number" min={0} inputMode="numeric" value={s.home === 0 ? "" : s.home}
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateScore(manualEntry, gi, "home", v === "" ? 0 : parseInt(v) || 0);
                  }}
                  className={cn("w-16 text-center text-sm", locked && "opacity-60 cursor-not-allowed")}
                  disabled={locked}
                />
                <span className="text-xs text-muted-foreground">-</span>
                <Input
                  type="number" min={0} inputMode="numeric" value={s.away === 0 ? "" : s.away}
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateScore(manualEntry, gi, "away", v === "" ? 0 : parseInt(v) || 0);
                  }}
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
  const homeCaptainCode = (teamMeta?.captainCodeByCode?.[homeCode.toUpperCase()] || "").toUpperCase();
  const awayCaptainCode = (teamMeta?.captainCodeByCode?.[awayCode.toUpperCase()] || "").toUpperCase();
  const homeClubId = teamMeta?.clubIdByCode?.[homeCode.toUpperCase()];
  const awayClubId = teamMeta?.clubIdByCode?.[awayCode.toUpperCase()];
  const isInternalLeague = !!(homeClubId && awayClubId && homeClubId === awayClubId);
  const homeSigLabel = isInternalLeague ? `${homeTeamName || homeCode} Captain` : "Home Captain";
  const awaySigLabel = isInternalLeague ? `${awayTeamName || awayCode} Captain` : "Away Captain";
  const isCaptainCode = (code: string | null | undefined, side: "home" | "away") => {
    const c = (code || "").toUpperCase();
    if (!c) return false;
    return side === "home" ? c === homeCaptainCode : c === awayCaptainCode;
  };
  const isSubstituted = (code: string | null | undefined, idx: number, side: "home" | "away") => {
    // SUB indicator only applies when the league has the original-player bonus rule.
    // Without that rule (e.g. NSA), substitutions are unrestricted and irrelevant.
    if (!leagueRules?.original_player_bonus_enabled) return false;
    const cur = normalizePlayerCode(code);
    const pos = positions[idx];
    const curName = normalizePlayerName(side === "home" ? pos?.homeName : pos?.awayName);
    if (!cur && !curName) return false;
    // SUB = player is NOT in the team's original admin teams list in ANY position
    // (mirrors the original-player bonus logic).
    const squadCodes = side === "home" ? homeSquadSet : awaySquadSet;
    const squadNames = side === "home" ? homeSquadNameSet : awaySquadNameSet;
    if (cur && squadCodes.has(cur)) return false;
    if (curName && squadNames.has(curName)) return false;
    return true;
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="League Scorecard" description="League fixture scorecard" path={`/league-games/${fixtureId}`} noIndex />
      <PageHeader title="League Scorecard" subtitle={`${homeCode} vs ${awayCode}`} />

      <div className="px-3 space-y-3 pb-8">
        {/* Header row */}
        <div className="border rounded-lg overflow-hidden text-xs bg-card text-card-foreground">
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
              <div className="flex items-center gap-2 flex-wrap">
                {isInternalLeague && (
                  <TeamLogo logoUrl={teamLogosByCode?.[homeCode.toUpperCase()]} name={homeTeamName || homeCode} size={40} className="bg-white/20" />
                )}
                <span className="font-mono font-black text-lg">{homeCode}</span>
                {homeTeamName && (
                  <span className="text-xs font-semibold opacity-90 truncate">{homeTeamName}</span>
                )}
                <NsaPenaltyBadge fixtureId={fixture.nsa_fixture_id} teamSide="home" teamCode={homeCode} />
              </div>
            </div>
            <div className="p-2 bg-accent text-accent-foreground">
              <span className="text-xs font-black uppercase tracking-widest block">VISITORS TEAM</span>
              <div className="flex items-center gap-2 flex-wrap">
                {isInternalLeague && (
                  <TeamLogo logoUrl={teamLogosByCode?.[awayCode.toUpperCase()]} name={awayTeamName || awayCode} size={40} className="bg-white/20" />
                )}
                <span className="font-mono font-black text-lg">{awayCode}</span>
                {awayTeamName && (
                  <span className="text-xs font-semibold opacity-90 truncate">{awayTeamName}</span>
                )}
                <NsaPenaltyBadge fixtureId={fixture.nsa_fixture_id} teamSide="away" teamCode={awayCode} />
              </div>
            </div>
          </div>
          <div className="p-1.5 text-[10px] text-muted-foreground bg-muted/30 flex items-center justify-between">
            <span>Venue: {fixture.venue_name}{fixtureCourt?.name ? ` · ${fixtureCourt.name}` : ""}</span>
            <span className="font-medium">
              {scoringFormat === "par11" ? "PAR 11" : "PAR 15"} · Best of {bestOf}
            </span>
          </div>
        </div>

        {/* Match format selection — only during setup */}
        {!setupDone && !isSubmitted && (() => {
          const ruleScoring: "par11" | "par15" | null =
            leagueRules?.points_per_game === 15 ? "par15"
            : leagueRules?.points_per_game === 11 ? "par11"
            : null;
          const ruleBestOf: 3 | 5 | null =
            leagueRules?.games_format === "best_of_5" ? 5
            : leagueRules?.games_format === "best_of_3" ? 3
            : null;
          const scoringLocked = ruleScoring !== null;
          const bestOfLocked = ruleBestOf !== null;
          return (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">Match Format</span>
                {(scoringLocked || bestOfLocked) && (
                  <span className="text-[10px] text-muted-foreground italic">Set by league rules</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    Scoring{scoringLocked && " · locked"}
                  </Label>
                  <RadioGroup
                    value={scoringLocked ? ruleScoring! : scoringFormat}
                    onValueChange={(v) => { if (!scoringLocked) setScoringFormat(v as "par11" | "par15"); }}
                    className={`flex gap-3 ${scoringLocked ? "opacity-70 pointer-events-none" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="par11" id="par11" disabled={scoringLocked} />
                      <Label htmlFor="par11" className="text-xs font-normal cursor-pointer">PAR 11</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="par15" id="par15" disabled={scoringLocked} />
                      <Label htmlFor="par15" className="text-xs font-normal cursor-pointer">PAR 15</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">
                    Best of{bestOfLocked && " · locked"}
                  </Label>
                  <RadioGroup
                    value={String(bestOfLocked ? ruleBestOf : bestOf)}
                    onValueChange={(v) => { if (!bestOfLocked) setBestOf(Number(v) as 3 | 5); }}
                    className={`flex gap-3 ${bestOfLocked ? "opacity-70 pointer-events-none" : ""}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="3" id="bo3" disabled={bestOfLocked} />
                      <Label htmlFor="bo3" className="text-xs font-normal cursor-pointer">3</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="5" id="bo5" disabled={bestOfLocked} />
                      <Label htmlFor="bo5" className="text-xs font-normal cursor-pointer">5</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </div>
          );
        })()}

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


        <div className="border rounded-lg overflow-hidden bg-card text-card-foreground">
          <table className="w-full text-xs bg-card text-card-foreground">
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
                    <span className="p-1 text-left">Code</span>
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
                const hasPlayers = (pos.homeCode || pos.homeName) && (pos.awayCode || pos.awayName);
                const noGamesMarkedYet = !isSubmitted && positions.every(p => !p.completed && (!p.scores || p.scores.length === 0));
                const isFirstPlayable = noGamesMarkedYet && positions.findIndex(p => (p.homeCode || p.homeName) && (p.awayCode || p.awayName) && !p.completed) === idx;
                const hasResumableMarker = resumableMarker === idx;
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
                              onBlur={() => handleCodeBlur(idx, "home")} placeholder="Code"
                              className="h-6 text-[9px] font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700 flex items-center gap-1">
                              <span className="truncate">{pos.homeName}</span>
                              {isCaptainCode(pos.homeCode, "home") && (
                                <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white font-bold" title="Team captain">C</Badge>
                              )}
                              {isSubstituted(pos.homeCode, idx, "home") && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-orange-400 text-orange-600 font-bold" title="Substitute (replaced original player)">SUB</Badge>
                              )}
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
                              {!isSubmitted && !pos.isForfeit && (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Mark home player at position ${idx + 1} as a forfeit?\n\nAway team will be awarded a clean ${bestOf === 5 ? '3-0' : '2-0'} (15-0 each game), and home team will lose ${FORFEIT_PENALTY_POINTS} penalty points.`)) {
                                      markForfeit(idx, "home");
                                    }
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                  title="Forfeit player"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!isSubmitted && pos.isForfeit && pos.forfeitSide === "home" && (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Undo forfeit for position ${idx + 1}?`)) undoForfeit(idx);
                                  }}
                                  className="text-primary hover:bg-primary/10 rounded p-0.5 border border-primary/40"
                                  title="Undo forfeit"
                                >
                                  <RotateCcw className="w-3 h-3" />
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
                            <span className="text-xs px-1 font-medium flex items-center gap-1 min-w-0">
                              <span className="truncate">{pos.homeName || "—"}</span>
                              {isCaptainCode(pos.homeCode, "home") && (
                                <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white font-bold shrink-0" title="Team captain">C</Badge>
                              )}
                              {isSubstituted(pos.homeCode, idx, "home") && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-orange-400 text-orange-600 font-bold shrink-0" title="Substitute (replaced original player)">SUB</Badge>
                              )}
                            </span>
                            {Array.from({ length: bestOf }, (_, gi) => (
                              <span key={gi} className={cn("text-center text-xs py-0.5", pos.scores[gi] && pos.scores[gi].home > pos.scores[gi].away ? "font-bold" : "text-muted-foreground")}>
                                {pos.scores[gi]?.home ?? ""}
                              </span>
                            ))}
                            <span className="text-center text-xs font-bold py-0.5">{pos.completed ? pr.homeWins : ""}</span>
                            <span className="text-center text-xs font-bold py-0.5 text-primary">{pos.completed ? homeTotalPts : ""}</span>
                            <span className="flex items-center justify-center gap-0.5">
                              {!isSubmitted && !pos.isForfeit && (pos.completed || pos.scores.length > 0) && (
                                <>
                                  <button
                                    onClick={() => setManualEntry(idx)}
                                    className="text-muted-foreground hover:text-primary hover:bg-accent rounded p-0.5"
                                    title="Edit scores"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!window.confirm(`Scratch the recorded score for position ${idx + 1}?\n\nThis clears the game so it can be re-marked or re-entered.`)) return;
                                      clearScores(idx);
                                    }}
                                    className="text-muted-foreground hover:text-destructive hover:bg-accent rounded p-0.5"
                                    title="Scratch / clear scores"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
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
                              onBlur={() => handleCodeBlur(idx, "away")} placeholder="Code"
                              className="h-6 text-[9px] font-mono border-0 rounded-none bg-transparent px-1" disabled={isSubmitted} />
                            <span className="text-xs truncate px-1 text-green-700 flex items-center gap-1">
                              <span className="truncate">{pos.awayName}</span>
                              {isCaptainCode(pos.awayCode, "away") && (
                                <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white font-bold" title="Team captain">C</Badge>
                              )}
                              {isSubstituted(pos.awayCode, idx, "away") && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-orange-400 text-orange-600 font-bold" title="Substitute (replaced original player)">SUB</Badge>
                              )}
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
                              {!isSubmitted && !pos.isForfeit && (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Mark away player at position ${idx + 1} as a forfeit?\n\nHome team will be awarded a clean ${bestOf === 5 ? '3-0' : '2-0'} (15-0 each game), and away team will lose ${FORFEIT_PENALTY_POINTS} penalty points.`)) {
                                      markForfeit(idx, "away");
                                    }
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                  title="Forfeit player"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!isSubmitted && pos.isForfeit && pos.forfeitSide === "away" && (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Undo forfeit for position ${idx + 1}?`)) undoForfeit(idx);
                                  }}
                                  className="text-primary hover:bg-primary/10 rounded p-0.5 border border-primary/40"
                                  title="Undo forfeit"
                                >
                                  <RotateCcw className="w-3 h-3" />
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
                            <span className="text-xs px-1 font-medium flex items-center gap-1 min-w-0">
                              <span className="truncate">{pos.awayName || "—"}</span>
                              {isCaptainCode(pos.awayCode, "away") && (
                                <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white font-bold shrink-0" title="Team captain">C</Badge>
                              )}
                              {isSubstituted(pos.awayCode, idx, "away") && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-orange-400 text-orange-600 font-bold shrink-0" title="Substitute (replaced original player)">SUB</Badge>
                              )}
                            </span>
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
                                    <Tooltip open={isFirstPlayable && !hasResumableMarker && firstHintVisible ? true : undefined}>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={() => {
                                            if (hasResumableMarker) {
                                              setActiveMarker(idx);
                                              return;
                                            }
                                            startMarking(idx);
                                          }}
                                          className={cn(
                                            "bg-primary text-primary-foreground rounded p-0.5 hover:bg-primary/80",
                                            (isFirstPlayable || hasResumableMarker) && "animate-pulse ring-2 ring-accent ring-offset-1 ring-offset-background shadow-lg shadow-accent/40"
                                          )}
                                          title={hasResumableMarker ? "Resume live game" : "Mark game live"}
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
                                  {hasPlayers && (
                                    <button
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
                                      className="text-muted-foreground hover:text-foreground hover:bg-accent rounded p-0.5"
                                      title="Enter scores manually"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                  )}
                                  {(pos.completed || pos.scores.length > 0) && (
                                    <button
                                      onClick={() => {
                                        if (!window.confirm(`Scratch the recorded score for position ${idx + 1}?\n\nThis clears the game so it can be re-marked or re-entered.`)) return;
                                        clearScores(idx);
                                      }}
                                      className="text-muted-foreground hover:text-destructive hover:bg-accent rounded p-0.5"
                                      title="Scratch / clear scores"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </>
                              )}
                              {!isSubmitted && pos.completed && !pos.isForfeit && (
                                <>
                                  <button
                                    onClick={() => setManualEntry(idx)}
                                    className="text-muted-foreground hover:text-primary hover:bg-accent rounded p-0.5"
                                    title="Edit scores"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!window.confirm(`Scratch the recorded score for position ${idx + 1}?\n\nThis clears the game so it can be re-marked or re-entered.`)) return;
                                      clearScores(idx);
                                    }}
                                    className="text-muted-foreground hover:text-destructive hover:bg-accent rounded p-0.5"
                                    title="Scratch / clear scores"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
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
              {setupDone && (
                <>
                  {(() => {
                    const buttonRowSpan = displaySummary.opbEnabled ? 3 : 2;
                    return (
                      <>
                        <tr className="bg-muted/60 text-[10px] font-black border-t">
                          <td colSpan={2 + bestOf} />
                          <td className="text-center p-1 bg-primary text-primary-foreground">H</td>
                          <td className="text-center p-1 bg-accent text-accent-foreground">V</td>
                        </tr>
                        <tr className="bg-muted/40 font-semibold text-xs border-t">
                          <td
                            rowSpan={buttonRowSpan}
                            colSpan={2}
                            className="p-2 text-center align-middle"
                          >
                            {!isSubmitted && (
                              <Button
                                size="lg"
                                className="text-sm font-semibold bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground shadow-lg hover:shadow-xl hover:opacity-95 transition-all h-12 px-5 mx-auto flex"
                                onClick={() => setSetupDone(false)}
                              >
                                <Users className="w-4 h-4 mr-2" /> Edit Players
                              </Button>
                            )}
                          </td>
                          <td colSpan={bestOf} className="p-1 text-right">SUB TOTALS (G)</td>
                          <td className="text-center p-1">{displaySummary.homeTotalGames}</td>
                          <td className="text-center p-1">{displaySummary.awayTotalGames}</td>
                        </tr>
                        <tr className="bg-muted/40 font-semibold text-xs">
                          <td colSpan={bestOf} className="p-1 text-right">BONUS (WIN)</td>
                          <td className="text-center p-1">{displaySummary.homeMatchBonus}</td>
                          <td className="text-center p-1">{displaySummary.awayMatchBonus}</td>
                        </tr>
                        {displaySummary.opbEnabled && (
                          <tr className="bg-muted/40 font-semibold text-xs">
                            <td colSpan={bestOf} className="p-1 text-right">
                              ORIGINAL PLAYERS (×{displaySummary.opbValue})
                            </td>
                            <td className="text-center p-1">{displaySummary.homeOriginalCount} = {displaySummary.homeOriginalBonus}</td>
                            <td className="text-center p-1">{displaySummary.awayOriginalCount} = {displaySummary.awayOriginalBonus}</td>
                          </tr>
                        )}
                      </>
                    );
                  })()}
                  <tr className="bg-muted/40 font-semibold text-xs">
                    <td colSpan={2} className="p-1 text-right">BONUS POINTS</td>
                    <td colSpan={bestOf} />
                    <td className="text-center p-1">{displaySummary.homeBonusPoints}</td>
                    <td className="text-center p-1">{displaySummary.awayBonusPoints}</td>
                  </tr>
                  {(displaySummary.homePenaltyPoints > 0 || displaySummary.awayPenaltyPoints > 0) && (
                    <tr className="bg-destructive/10 font-semibold text-xs text-destructive">
                      <td colSpan={2} className="p-1 text-right">FORFEIT PENALTY</td>
                      <td colSpan={bestOf} />
                      <td className="text-center p-1">{displaySummary.homePenaltyPoints > 0 ? `-${displaySummary.homePenaltyPoints}` : ""}</td>
                      <td className="text-center p-1">{displaySummary.awayPenaltyPoints > 0 ? `-${displaySummary.awayPenaltyPoints}` : ""}</td>
                    </tr>
                  )}
                  <tr className="bg-muted/60 font-bold text-sm">
                    <td colSpan={2} className="p-1 text-right">TOTAL</td>
                    <td colSpan={bestOf} />
                    <td className="text-center p-1">{displaySummary.homeTotal}</td>
                    <td className="text-center p-1">{displaySummary.awayTotal}</td>
                  </tr>
                  <tr className="bg-primary/10 font-bold text-sm border-t-2 border-primary/30">
                    <td colSpan={2} className="p-1 text-right text-primary">TOTAL POINTS (P)</td>
                    <td colSpan={bestOf} />
                    <td className="text-center p-1 text-primary">{displaySummary.homeAllPoints}</td>
                    <td className="text-center p-1 text-primary">{displaySummary.awayAllPoints}</td>
                  </tr>

                </>
              )}
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
          <div className="space-y-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={handleResetToDefault}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset to default league players
            </Button>
            <Button className="w-full" size="sm" onClick={handleSaveSetup} disabled={!setupValid || savingSetup}>
              {savingSetup ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              Complete Setup
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">Lineup remains editable until results are submitted.</p>
          </div>
        )}

        {/* Signatures */}
        {setupDone && !isSubmitted && (
          <div className="flex gap-2">
            <SignaturePad label={homeSigLabel} onSave={setHomeSig} />
            <SignaturePad label={awaySigLabel} onSave={setAwaySig} />
          </div>
        )}

        {/* Submit */}
        {setupDone && !isSubmitted && (
          <>
            {positions.some(p => (p.scores?.length ?? 0) > 0 || p.completed || p.isForfeit) && (
              <div className="rounded-md border-2 border-amber-500/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Scores entered but NOT yet on the standings
                </div>
                <p className="leading-snug">
                  These results are saved as a <b>draft</b> only. They will not appear on the league standings until both captains sign and you press <b>Submit Results</b> below.
                </p>
              </div>
            )}
            <Button
              className="w-full font-semibold shadow-lg ring-2 ring-primary/30"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              Submit Results to Standings
            </Button>
          </>
        )}

        {/* NSA Post — only for fixtures linked to NSA (team codes resolve in NSA roster) */}
        {setupDone && activeMember?.id && nsaLive && (
          <Button variant="outline" className="w-full border-amber-500/50 text-amber-700 hover:bg-amber-500/10" size="sm" onClick={() => setNsaDialogOpen(true)}>
            <Send className="w-4 h-4 mr-1" /> Post to NSA
          </Button>
        )}

        {isSubmittedLocked && !adminOverride && (
          <div className="text-center py-2 space-y-2">
            <Badge className="bg-green-500/15 text-green-700 text-sm px-4 py-1">
              <Check className="w-4 h-4 mr-1" /> Results Submitted
            </Badge>
            {isClubAdmin && (
              <div>
                <Button size="sm" variant="outline" onClick={() => { setAdminOverride(true); toast.info("Admin edit mode — change scores then press Submit again."); }}>
                  <Edit3 className="w-4 h-4 mr-1" /> Admin: Edit Submitted Scores
                </Button>
              </div>
            )}
          </div>
        )}

        {isSubmittedLocked && adminOverride && (
          <div className="rounded-md border-2 border-destructive/60 bg-destructive/10 p-3 text-xs">
            <div className="font-bold mb-1">Admin override active</div>
            <p className="leading-snug">You're editing previously submitted results. Press <b>Submit Results</b> below to overwrite the standings.</p>
          </div>
        )}

        {!isSubmittedLocked && isFixturePast && isClubAdmin && (
          <div className="rounded-md border-2 border-amber-500/60 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="font-bold mb-1">Overdue fixture — admin entry</div>
            <p className="leading-snug">This match date has passed and no results were submitted. As an admin, you can enter scores below and submit on behalf of the captains.</p>
          </div>
        )}

        {isClubAdmin && (
          <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Admin tools</div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Skip the rubber-by-rubber workflow and enter the final total points directly. Use this for results imported from outside (e.g. NSA scrape) or to correct a finalized fixture.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => setAdminManualOpen(true)}
            >
              <Edit3 className="w-4 h-4 mr-1" />
              {isSubmittedLocked ? "Adjust Final Score (Admin)" : "Enter Final Score Manually (Admin)"}
            </Button>
          </div>
        )}


        <p className="text-[10px] text-muted-foreground text-center">
          Bonus points follow league rules: {leagueRules?.bonus_points_mode === "per_game_won" ? `+${leagueRules?.bonus_points_value ?? 1} per game won (both teams)` : leagueRules?.bonus_points_mode === "fixed_winner" ? `+${leagueRules?.bonus_points_value ?? 1} flat to fixture winner` : `+${leagueRules?.bonus_points_value ?? 1} to winning team for each rubber they won`}{summary.opbEnabled ? `, plus +${summary.opbValue} per original (non-reserve) player who plays` : ""}. Forfeit: opponent gets a clean sweep and the absent side loses {FORFEIT_PENALTY_POINTS} points.
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
          associationId={fixture?.association_id ?? null}
          fixtureDate={fixture?.fixture_date ?? null}
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

      {isClubAdmin && fixtureId && (
        <AdminManualScoreDialog
          open={adminManualOpen}
          onOpenChange={setAdminManualOpen}
          fixtureId={fixtureId}
          homeCode={homeCode}
          awayCode={awayCode}
          existing={existingResult as any}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["league-fixture-result", fixtureId] });
            queryClient.invalidateQueries({ queryKey: ["internal-standings"] });
          }}
        />
      )}
    </div>
  );
}
