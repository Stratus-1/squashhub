import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { hasActiveMarkerSession, MARKER_CONFIG_KEY, MARKER_STATE_KEY } from "@/lib/marker-storage";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { MarkerSetup, type MarkerConfig } from "@/components/marker/MarkerSetup";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import { fromExt } from "@/lib/supabase-ext";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setScoringActive } from "@/lib/scoring-lock";
import { enqueueRankingDelta } from "@/lib/ranking-points";
import {
  fetchChampMarkerLock,
  isLockFresh,
  useChampMarkerHeartbeat,
  useChampMarkerLock,
} from "@/hooks/use-champ-marker-lock";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useMemberContext } from "@/contexts/MemberContext";

function parseTournamentScores(row: any): Array<{ a: number; b: number }> {
  const scores: Array<{ a: number; b: number }> = [];
  let parsedCurrent: { a: number; b: number } | null = null;
  try {
    const raw = row?.game_scores;
    const parsed = typeof raw === "string" && raw.trim()
      ? JSON.parse(raw)
      : raw && typeof raw === "object"
        ? raw
        : null;
    const sets = Array.isArray(parsed?.sets) ? parsed.sets : [];
    for (const set of sets) {
      const a = Number(set?.a) || 0;
      const b = Number(set?.b) || 0;
      if (a > 0 || b > 0) scores.push({ a, b });
    }
    const current = parsed?.current;
    const currentA = Number(current?.a) || 0;
    const currentB = Number(current?.b) || 0;
    if (currentA > 0 || currentB > 0) parsedCurrent = { a: currentA, b: currentB };
  } catch {
    // Ignore old/plain score strings; current side points below are the source of truth for live scores.
  }

  const sideA = Number(row?.side_a_points) || 0;
  const sideB = Number(row?.side_b_points) || 0;
  // The dedicated live columns are the authoritative current-game score.
  // Fall back to game_scores.current only for older rows. Keeping completed
  // sets and the current rally separate prevents Resume from rebuilding 0-0.
  const current = sideA > 0 || sideB > 0 ? { a: sideA, b: sideB } : parsedCurrent;
  if (current) scores.push(current);
  return scores;
}

function serializeLiveScores(games: GameScore[], current?: { a: number; b: number }) {
  const payload: any = {
    sets: games.map((g) => ({ a: g.a, b: g.b })),
  };
  if (current && (current.a > 0 || current.b > 0)) payload.current = current;
  return JSON.stringify(payload);
}

export default function MatchMarker() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<MarkerConfig | null>(() => {
    if (new URLSearchParams(window.location.search).has("matchId")) return null;
    try {
      const raw = localStorage.getItem(MARKER_CONFIG_KEY);
      if (!raw) return null;
      // Only auto-resume if the user actually started scoring (state was persisted).
      // A bare config without state means they only opened the screen and left —
      // don't drop them back into a phantom scoreboard.
      const hasState = hasActiveMarkerSession();
      if (!hasState) {
        try {
          localStorage.removeItem(MARKER_CONFIG_KEY);
          localStorage.removeItem(MARKER_STATE_KEY);
        } catch {}
        return null;
      }
      return JSON.parse(raw) as MarkerConfig;
    } catch {
      return null;
    }
  });
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeMember } = useMemberContext();
  const markerName = (activeMember as any)?.name || user?.email || "A marker";

  // ---- Tournament marker presence + hand-over ----
  const tournamentMatchId =
    config?.source === "tournament" && config.sourceId ? config.sourceId : null;
  useChampMarkerHeartbeat(tournamentMatchId, user?.id, markerName, !!tournamentMatchId);
  const {
    lock: champLock,
    fresh: champLockFresh,
    approveTakeover,
    declineTakeover,
  } = useChampMarkerLock(tournamentMatchId, user?.id, markerName);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [tournamentLoadState, setTournamentLoadState] = useState<"idle" | "loading" | "error">("idle");
  const takeoverRequester = champLock?.takeover_requested_by && champLock.user_id === user?.id
    ? champLock.takeover_requested_name || "Another marker"
    : null;

  useEffect(() => {
    setHandoverOpen(!!takeoverRequester);
  }, [takeoverRequester]);

  // Somebody else now holds the lock (approved or forced take-over) → step out
  // of the marker and watch the game live instead of writing conflicting scores.
  useEffect(() => {
    if (!tournamentMatchId || !champLock || !user) return;
    if (champLockFresh && champLock.user_id !== user.id) {
      toast.info(`${champLock.user_name} has taken over marking`, {
        description: "Switching you to the live score.",
      });
      navigate(`/tournament-live/${tournamentMatchId}`, { replace: true });
    }
  }, [champLock, champLockFresh, tournamentMatchId, user, navigate]);

  const markTournamentLive = useCallback(async (matchId: string, scores: Array<{ a: number; b: number }> = []) => {
    const current = scores[scores.length - 1];
    try {
      const { error } = await fromExt("club_champs_matches")
        .update({
          status: "in_progress",
          side_a_points: current?.a ?? 0,
          side_b_points: current?.b ?? 0,
          game_scores: scores.length > 0 ? JSON.stringify({ sets: scores.slice(0, -1), current }) : null,
        } as any)
        .eq("id", matchId)
        .neq("status", "completed");
      if (error) console.warn("Could not mark tournament match live:", error);
      queryClient.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
    } catch (e) {
      console.warn("Could not mark tournament match live:", e);
    }
  }, [queryClient]);

  useEffect(() => {
    if (!searchParams.has("matchId") && !searchParams.has("bookingId")) return;
    try {
      // Same match/booking → keep this device's in-progress scoring state (server,
      // serve side, undo history). Different one → wipe it. Either way we clear the
      // stored *config* so the database is always re-read and the board resumes at
      // the real score instead of 0-0 when local state is missing or stale.
      const matchId = searchParams.get("matchId");
      const bookingId = searchParams.get("bookingId");
      const raw = localStorage.getItem(MARKER_CONFIG_KEY);
      let sameTarget = false;
      if (raw) {
        const existing = JSON.parse(raw);
        const targetId = matchId || bookingId;
        sameTarget = !!(existing?.sourceId && targetId && existing.sourceId === targetId);
      }
      localStorage.removeItem(MARKER_CONFIG_KEY);
      if (!sameTarget) localStorage.removeItem(MARKER_STATE_KEY);
    } catch {}
    setConfig(null);
  }, [searchParams]);


  useEffect(() => {
    const src = searchParams.get("source");
    const matchId = searchParams.get("matchId");
    if (src !== "tournament" || !matchId || config?.sourceId === matchId) return;

    let cancelled = false;
    const loadLinkedTournamentMatch = async () => {
      setTournamentLoadState("loading");
      const { data, error } = await fromExt("club_champs_matches")
        .select(`
          id, champ_id, handicap_a, handicap_b, status, side_a_points, side_b_points, game_scores,
          player_a_member_id, player_b_member_id,
          partner_a_member_id, partner_b_member_id,
          player_a:player_a_member_id(id, name, club_member_number),
          player_b:player_b_member_id(id, name, club_member_number),
          partner_a:partner_a_member_id(id, name, club_member_number),
          partner_b:partner_b_member_id(id, name, club_member_number)
        `)
        .eq("id", matchId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        console.error("Could not load tournament match for marking", error);
        setTournamentLoadState("error");
        toast.error("Could not load the saved tournament score", {
          description: "Please retry. The marker will not start a new 0–0 game.",
        });
        return;
      }

      const row = data as any;
      // Read the parent and its scoring rules directly. The compatibility
      // `club_champs` view is security-invoker and a rules/governance policy
      // change can hide the joined row even when this match itself is visible.
      // League marking does not depend on such a compatibility join; tournament
      // resume should be equally direct and server-authoritative.
      const [{ data: tournamentData, error: tournamentError }, { data: rulesData, error: rulesError }] = await Promise.all([
        fromExt("tournaments")
          .select("id, club_id, match_type")
          .eq("id", row.champ_id)
          .maybeSingle(),
        fromExt("tournament_rules")
          .select("tournament_id, scoring_mode, points_per_game, best_of, play_all_games, win_condition")
          .eq("tournament_id", row.champ_id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (tournamentError || rulesError || !tournamentData) {
        console.error("Could not load tournament scoring rules", tournamentError || rulesError);
        setTournamentLoadState("error");
        toast.error("Could not load the tournament scoring rules", {
          description: "Please retry. Your saved score has not been changed.",
        });
        return;
      }
      const champ = { ...(tournamentData as any), ...(rulesData as any) };
      if (champ?.scoring_mode === "time_capped_points") {
        navigate(`/bells-marker/${matchId}`, { replace: true });
        return;
      }

      // Marker lock gate: ownership now lives in `champ_marker_locks`, not in
      // this browser's local storage. If someone else is actively marking (fresh
      // heartbeat) and we did not arrive with an approved/forced take-over, send
      // the viewer to the read-only live scoreboard instead of a blank 0-0 board.
      if (searchParams.get("takeover") !== "1") {
        try {
          const lock = await fetchChampMarkerLock(matchId);
          if (!cancelled && lock && isLockFresh(lock) && lock.user_id !== user?.id) {
            toast.info(`${lock.user_name} is marking this match`, {
              description: "Showing the live score instead.",
            });
            navigate(`/tournament-live/${matchId}`, { replace: true });
            return;
          }
        } catch (e) {
          // Lock lookup must never block scoring.
          console.warn("Marker lock check failed", e);
        }
      }

      const ids = [
        row.player_a_member_id,
        row.player_b_member_id,
        row.partner_a_member_id,
        row.partner_b_member_id,
      ].filter(Boolean);

      const memberMap = new Map<string, any>();
      if (ids.length > 0) {
        const { data: members } = await supabase
          .from("club_members")
          .select("id, name, club_member_number")
          .in("id", ids);
        (members || []).forEach((m: any) => memberMap.set(m.id, m));

        const missingIds = ids.filter((id: string) => !memberMap.has(id));
        if (missingIds.length > 0) {
          const { data: visitors } = await supabase
            .from("club_visitors")
            .select("id, first_name, last_name, member_number, home_club_name")
            .in("id", missingIds);
          (visitors || []).forEach((v: any) => {
            memberMap.set(v.id, {
              id: v.id,
              name: `${v.first_name || ""} ${v.last_name || ""}`.trim(),
              club_member_number: v.member_number || "",
              club: v.home_club_name || "",
            });
          });
        }
      }

      const playerFor = (id: string | null | undefined, joined: any, fallback: string) => {
        const found = (id && memberMap.get(id)) || joined || null;
        return {
          name: found?.name || fallback,
          number: found?.club_member_number || "",
          club: found?.club || "Tournament",
          clubMemberId: id || undefined,
        };
      };

      const isDoubles = champ?.match_type === "doubles" || champ?.match_type === "mixed";
      const ppg = Number(champ?.points_per_game);
      const scoringFormat: "par11" | "par15" | "english9" =
        ppg === 15 ? "par15" : ppg === 9 ? "english9" : "par11";
      const rawBest = Number(champ?.best_of);
      const bestOf: 3 | 5 = rawBest === 5 ? 5 : 3;
      const deuceRule: "win_by_2" | "sudden_death" =
        champ?.win_condition === "sudden_death" ? "sudden_death" : "win_by_2";
      const nextConfig: MarkerConfig = {
        playerA: playerFor(row.player_a_member_id, row.player_a, "Player A"),
        playerB: playerFor(row.player_b_member_id, row.player_b, "Player B"),
        partnerA: isDoubles ? playerFor(row.partner_a_member_id, row.partner_a, "Partner A") : undefined,
        partnerB: isDoubles ? playerFor(row.partner_b_member_id, row.partner_b, "Partner B") : undefined,
        isDoubles,
        matchType: "club_champs",
        scoringFormat,
        bestOf,
        playAllGames: !!champ?.play_all_games,
        deuceRule,
        source: "tournament",
        sourceId: matchId,
        handicapA: Number(row.handicap_a) || 0,
        handicapB: Number(row.handicap_b) || 0,
        clubId: champ?.club_id || undefined,
        initialScores: parseTournamentScores(row),
      };

      if (cancelled) return;
      setConfig(nextConfig);
      setTournamentLoadState("idle");
      // Do NOT flip the tournament match to in_progress just because someone
      // opened the marker — only handleLiveScore (after a real point) should
      // set status=in_progress. Otherwise merely viewing a match strands it
      // as "LIVE 0-0" and creates a phantom resume prompt for the viewer.
      // Keep the linked-match URL intact while marking. Replacing it with the
      // bare `/match-marker` route left React Router with a stale in-memory
      // marker entry after Back → Tournaments → Resume; the second visit could
      // mount without a stable match identity until a full browser refresh.
      // A stable URL also means refresh/back-forward always re-hydrates this
      // exact match from the database instead of relying on local state alone.
    };

    loadLinkedTournamentMatch();
    return () => { cancelled = true; };
  }, [config?.sourceId, markTournamentLive, navigate, searchParams, user?.id]);

  useEffect(() => {
    if (config?.source !== "tournament" || !config.sourceId) return;

    let cancelled = false;
    const syncTournamentScoring = async () => {
      const { data } = await fromExt("club_champs_matches")
        .select("club_champs!inner(points_per_game, best_of, play_all_games, win_condition)")
        .eq("id", config.sourceId)
        .maybeSingle();

      if (cancelled || !data) return;
      const champ = Array.isArray((data as any).club_champs) ? (data as any).club_champs[0] : (data as any).club_champs;
      const ppg = Number(champ?.points_per_game);
      const scoringFormat: MarkerConfig["scoringFormat"] = ppg === 15 ? "par15" : ppg === 9 ? "english9" : "par11";
      const bestOf: MarkerConfig["bestOf"] = Number(champ?.best_of) === 5 ? 5 : 3;
      const playAllGames = !!champ?.play_all_games;
      const deuceRule: MarkerConfig["deuceRule"] = champ?.win_condition === "sudden_death" ? "sudden_death" : "win_by_2";

      if (
        config.scoringFormat !== scoringFormat ||
        config.bestOf !== bestOf ||
        !!config.playAllGames !== playAllGames ||
        config.deuceRule !== deuceRule
      ) {
        setConfig({ ...config, scoringFormat, bestOf, playAllGames, deuceRule });
      }
    };

    syncTournamentScoring();
    return () => { cancelled = true; };
  }, [config]);

  // Persist config so user can navigate away and resume
  useEffect(() => {
    try {
      if (config) localStorage.setItem(MARKER_CONFIG_KEY, JSON.stringify(config));
      else localStorage.removeItem(MARKER_CONFIG_KEY);
    } catch {}
  }, [config]);

  // Hold the PWA update poller + add a beforeunload guard while scoring.
  useEffect(() => {
    if (!config) return;
    setScoringActive(true);
    return () => setScoringActive(false);
  }, [config]);

  const startConfig = (c: MarkerConfig) => {
    try { localStorage.removeItem(MARKER_STATE_KEY); } catch {}
    setConfig(c);
    // Only flip the tournament match to in_progress if there are already
    // real scores being resumed — starting from 0-0 waits for the first
    // point (handleLiveScore) to avoid phantom LIVE indicators.
    if (c.source === "tournament" && c.sourceId) {
      const initial = ((c as any).initialScores || []) as Array<{ a: number; b: number }>;
      const hasProgress = initial.some((s) => (s?.a || 0) > 0 || (s?.b || 0) > 0);
      if (hasProgress) markTournamentLive(c.sourceId, initial);
    }
  };

  const resetMatch = () => {
    try {
      localStorage.removeItem(MARKER_CONFIG_KEY);
      localStorage.removeItem(MARKER_STATE_KEY);
    } catch {}
    setConfig(null);
  };

  // Push live score to the tournament match row so the Tournaments/Upcoming
  // page can highlight this match as LIVE and show the current running score.
  const liveThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const lastLiveRef = useRef<{ a: number; b: number } | null>(null);
  const handleLiveScore = useCallback(
    (_games: GameScore[], current: { a: number; b: number }) => {
      if (config?.source !== "tournament" || !config.sourceId) return;
      lastLiveRef.current = current;
      if (liveThrottleRef.current) return;
      liveThrottleRef.current = setTimeout(async () => {
        liveThrottleRef.current = null;
        const c = lastLiveRef.current;
        if (!c || !config.sourceId) return;
        try {
          await fromExt("club_champs_matches")
            .update({
              status: "in_progress",
              side_a_points: c.a,
              side_b_points: c.b,
              game_scores: serializeLiveScores(_games, c),
            } as any)
            .eq("id", config.sourceId);
          queryClient.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
        } catch (e) {
          console.warn("Live score push failed:", e);
        }
      }, 400);
    },
    [config, queryClient],
  );

  const handleTournamentProgress = useCallback(
    async (games: GameScore[]) => {
      if (config?.source !== "tournament" || !config.sourceId) return;
      try {
        await fromExt("club_champs_matches")
          .update({
            status: "in_progress",
            side_a_points: 0,
            side_b_points: 0,
            game_scores: serializeLiveScores(games),
          } as any)
          .eq("id", config.sourceId);
        queryClient.invalidateQueries({ queryKey: ["tournaments-all-matches"] });
      } catch (e) {
        console.warn("Live tournament progress push failed:", e);
      }
    },
    [config, queryClient],
  );

  useEffect(() => () => {
    if (liveThrottleRef.current) clearTimeout(liveThrottleRef.current);
  }, []);

  const handleScratch = async () => {
    // If this was a tournament match, roll the club_champs_matches row back
    // to a pending/scheduled state and clear any recorded score so it appears
    // in the "to be marked" list and standings recompute correctly.
    if (config?.source === "tournament" && config.sourceId) {
      try {
        await fromExt("club_champs_matches")
          .update({
            score: null,
            game_scores: null,
            winner_member_id: null,
            side_a_points: null,
            side_b_points: null,
            forfeit_member_id: null,
            status: "scheduled",
          } as any)
          .eq("id", config.sourceId);
        queryClient.invalidateQueries({ queryKey: ["club-champ-matches"] });
        queryClient.invalidateQueries({ queryKey: ["my-champ-matches-dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["my-champ-matches-events"] });
        queryClient.invalidateQueries({ queryKey: ["club-champs-all-entries"] });
      } catch (e) {
        console.warn("Could not reset tournament match on scratch:", e);
      }
    }
    resetMatch();
  };

  type MatchResult = {
    games: GameScore[];
    winnerId: "a" | "b";
    durationSeconds: number;
    forfeit?: { absentSide: "a" | "b" };
  };

  // A completed score must never be lost. If the save fails we keep the result
  // (and the persisted scoreboard state) and offer a safe retry. The row id is
  // generated once per completed match so a retry can never duplicate it.
  const pendingResultRef = useRef<MatchResult | null>(null);
  const pendingMatchIdRef = useRef<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleMatchComplete = async (result: MatchResult) => {
    if (!config) return;

    const playerAMemberId = config.playerA.clubMemberId;
    const playerBMemberId = config.playerB.clubMemberId;

    if (!playerAMemberId && !playerBMemberId) {
      toast.info("Match scored! Players must be members or visitors to save results.");
      return;
    }

    if (pendingResultRef.current !== result) {
      pendingResultRef.current = result;
      pendingMatchIdRef.current = crypto.randomUUID();
    }
    setSaving(true);
    setSaveError(null);

    try {
      // Look up user_ids — they may be null for unregistered members
      const memberIdsToLookup = [playerAMemberId, playerBMemberId].filter(Boolean) as string[];
      let memberA: { id: string; user_id: string | null } | undefined;
      let memberB: { id: string; user_id: string | null } | undefined;

      if (memberIdsToLookup.length > 0) {
        const { data: members } = await supabase
          .from("club_members")
          .select("id, user_id")
          .in("id", memberIdsToLookup);
        memberA = members?.find((m) => m.id === playerAMemberId);
        memberB = members?.find((m) => m.id === playerBMemberId);
      }

      // Only use member IDs that were found in club_members (not visitors)
      const validAMemberId = memberA ? playerAMemberId : null;
      const validBMemberId = memberB ? playerBMemberId : null;
      const winnerMemberId = result.winnerId === "a" ? validAMemberId : validBMemberId;
      const winnerUserId = result.winnerId === "a" ? memberA?.user_id : memberB?.user_id;

      const isForfeit = !!result.forfeit;
      const absentLabel = isForfeit ? (result.forfeit!.absentSide === "a" ? "A" : "B") : null;
      const gameScoresJson = isForfeit ? null : JSON.stringify({
        sets: result.games.map((g) => ({ a: g.a, b: g.b })),
      });

      const scoreStr = isForfeit
        ? `No show (${absentLabel} w/o)`
        : result.games.map((g) => `${g.a}-${g.b}`).join(", ");

      // Use member IDs as primary — user_ids are optional (may be null for unlinked members)
      // Auto-confirm friendly matches and matches where opponent has no user account
      const isFriendly = config.matchType === "friendly";
      const opponentHasAccount = result.winnerId === "a" ? !!memberB?.user_id : !!memberA?.user_id;
      const autoConfirm = isFriendly || !opponentHasAccount || isForfeit;

      // Build notes with player names (especially important for visitors not in club_members)
      const noteParts = [
        isForfeit
          ? `Marked via live scorer. Forfeit (No show / Injured).`
          : `Marked via live scorer. Format: ${config.scoringFormat}, Best of ${config.bestOf}${config.isDoubles ? ', Doubles' : ''}`,
      ];
      if (!memberA) noteParts.push(`Player 1: ${config.playerA.name} (${config.playerA.club})`);
      if (!memberB) noteParts.push(`Player 2: ${config.playerB.name} (${config.playerB.club})`);
      if (config.source !== 'manual') noteParts.push(`Source: ${config.source} ${config.sourceId || ''}`);

      const { error } = await supabase.from("matches").insert({
        player_a: memberA?.user_id || null,
        player_b: memberB?.user_id || null,
        player_a_member_id: validAMemberId,
        player_b_member_id: validBMemberId,
        winner_id: winnerUserId || null,
        winner_member_id: winnerMemberId,
        score: scoreStr,
        game_scores: gameScoresJson,
        duration_s: result.durationSeconds,
        submitted_by: user?.id || null,
        submitted_by_member_id: null,
        confirmed: autoConfirm,
        notes: noteParts.join(". "),
        club_id: config.clubId || null,
      } as any);

      if (error) {
        console.error("Failed to save match:", error);
        toast.error("Could not save match result");
        return;
      }

      // Match saved — clear persisted in-progress state
      try {
        localStorage.removeItem(MARKER_CONFIG_KEY);
        localStorage.removeItem(MARKER_STATE_KEY);
      } catch {}

      const isTournament = config.source === "tournament" && !!config.sourceId;
      toast.success(
        isTournament
          ? "Results posted"
          : autoConfirm
            ? "Match result saved and confirmed!"
            : "Match result saved! Awaiting player confirmation.",
      );

      // If this was a tournament match, update the club_champs_matches record too
      if (config.source === "tournament" && config.sourceId) {
        try {
          const updatePayload: any = {
            score: scoreStr,
            game_scores: gameScoresJson,
            winner_member_id: winnerMemberId,
            status: "completed",
          };

          if (isForfeit) {
            // Look up configured No Show points on the parent tournament
            const { data: champRow } = await fromExt("club_champs_matches")
              .select("champ_id, player_a_member_id, player_b_member_id, club_champs!inner(no_show_opponent_points, no_show_player_points)")
              .eq("id", config.sourceId)
              .maybeSingle();
            const opp = Number((champRow as any)?.club_champs?.no_show_opponent_points ?? 10);
            const pen = Number((champRow as any)?.club_champs?.no_show_player_points ?? 0);
            const absentSide = result.forfeit!.absentSide;
            // side_a points: if A absent → pen, else opp; side_b mirror
            updatePayload.side_a_points = absentSide === "a" ? pen : opp;
            updatePayload.side_b_points = absentSide === "b" ? pen : opp;
            updatePayload.forfeit_member_id = absentSide === "a"
              ? (champRow as any)?.player_a_member_id ?? validAMemberId
              : (champRow as any)?.player_b_member_id ?? validBMemberId;
          }

          await fromExt("club_champs_matches")
            .update(updatePayload)
            .eq("id", config.sourceId);
          // Refresh tournament views
          queryClient.invalidateQueries({ queryKey: ["club-champ-matches"] });
          queryClient.invalidateQueries({ queryKey: ["my-champ-matches-dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["my-champ-matches-events"] });
          queryClient.invalidateQueries({ queryKey: ["club-champs-all-entries"] });
          // Fire-and-forget: shift the next queued tournament match onto this
          // freed court + time if it makes the day run tighter.
          try {
            (await import("@/integrations/supabase/client")).supabase.functions.invoke(
              "reflow-freed-court",
              { body: { tournament_match_id: config.sourceId } },
            ).catch(() => {});
          } catch { /* ignore */ }
        } catch (e) {
          console.warn("Could not update tournament match:", e);
        }

        // Ranking points: enqueue if parent tournament has affects_ranking_points enabled.
        // Skip on forfeit — no games were actually played.
        if (!isForfeit) {
          try {
            if (winnerMemberId && validAMemberId && validBMemberId && config.clubId) {
              const { data: champRow } = await fromExt("club_champs_matches")
                .select("champ_id, club_champs!inner(affects_ranking_points)")
                .eq("id", config.sourceId)
                .maybeSingle();
              const affects = (champRow as any)?.club_champs?.affects_ranking_points;
              if (affects) {
                const loserMemberId = winnerMemberId === validAMemberId ? validBMemberId : validAMemberId;
                await enqueueRankingDelta({
                  clubId: config.clubId,
                  matchSourceType: "tournament",
                  matchSourceId: config.sourceId,
                  winnerMemberId,
                  loserMemberId,
                });
              }
            }
          } catch (e) {
            console.warn("Ranking-points enqueue (tournament) failed:", e);
          }
        }
      }

      if (isTournament) {
        setTimeout(() => navigate("/tournaments"), 900);
        return;
      }

      // Note: For league fixtures, marking is launched from the League Game Detail page
      // which already persists into league_match_results via its own handler.
      const otherMember = memberA?.user_id === user?.id ? memberB : memberA;
      if (otherMember?.user_id) {
        try {
          await supabase.from("notifications" as any).insert({
            user_id: otherMember.user_id,
            title: "Confirm Match Result",
            message: `A match result (${scoreStr}) has been submitted and needs your confirmation.`,
            type: "match",
            url: "/dashboard",
          });
        } catch { /* non-critical */ }
      }
    } catch (err) {
      console.error("Error saving match:", err);
      toast.error("Could not save match result");
    }
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Match Marker | SquashHub" description="Live squash scoring and marking tool for referees" />
      <PageHeader
        title="Match Marker"
        subtitle={config ? `${config.playerA.name} vs ${config.playerB.name}` : "Set up the match to begin scoring"}
      />

      <div className="px-4 mt-3 mb-6 max-w-lg mx-auto">
        {!config && tournamentLoadState === "loading" ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading saved tournament score…</div>
        ) : !config && tournamentLoadState === "error" ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm font-medium">The saved tournament score could not be loaded.</p>
            <p className="text-xs text-muted-foreground">A new 0–0 game has not been started.</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        ) : !config ? (
          <MarkerSetup onStart={startConfig} />
        ) : (
          <MarkerScoreboard
            key={config.source && config.sourceId ? `${config.source}:${config.sourceId}` : "manual-marker"}
            config={config}
            initialScores={
              config.source === "tournament"
                ? ((config as any).initialScores?.length
                  ? (config as any).initialScores
                  : ((config as any).handicapA || (config as any).handicapB)
                    ? [{ a: Number((config as any).handicapA) || 0, b: Number((config as any).handicapB) || 0 }]
                    : undefined)
                : undefined
            }
            onMatchComplete={handleMatchComplete}
            onReset={resetMatch}
            onScratch={handleScratch}
            onProgress={handleTournamentProgress}
            onLiveScore={handleLiveScore}
          />
        )}
      </div>

      <AlertDialog open={handoverOpen} onOpenChange={setHandoverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{takeoverRequester} wants to take over marking</AlertDialogTitle>
            <AlertDialogDescription>
              Hand over and they continue from the current score — you'll switch to the live view.
              Decline and you stay in charge of the marking.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { declineTakeover(); }}>No, I keep marking</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const id = tournamentMatchId;
                await approveTakeover();
                try {
                  localStorage.removeItem(MARKER_CONFIG_KEY);
                  localStorage.removeItem(MARKER_STATE_KEY);
                } catch {}
                toast.success("Marking handed over");
                if (id) navigate(`/tournament-live/${id}`, { replace: true });
              }}
            >
              Yes, hand over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BackToDashboard />
    </div>
  );
}
