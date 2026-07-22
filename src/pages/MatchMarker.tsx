import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MARKER_CONFIG_KEY, MARKER_STATE_KEY } from "@/lib/marker-storage";
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

export default function MatchMarker() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState<MarkerConfig | null>(() => {
    if (new URLSearchParams(window.location.search).has("matchId")) return null;
    try {
      const raw = localStorage.getItem(MARKER_CONFIG_KEY);
      return raw ? (JSON.parse(raw) as MarkerConfig) : null;
    } catch {
      return null;
    }
  });
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!searchParams.has("matchId") && !searchParams.has("bookingId")) return;
    try {
      localStorage.removeItem(MARKER_CONFIG_KEY);
      localStorage.removeItem(MARKER_STATE_KEY);
    } catch {}
    setConfig(null);
  }, [searchParams]);

  useEffect(() => {
    const src = searchParams.get("source");
    const matchId = searchParams.get("matchId");
    if (src !== "tournament" || !matchId || config?.sourceId === matchId) return;

    let cancelled = false;
    const loadLinkedTournamentMatch = async () => {
      const { data, error } = await fromExt("club_champs_matches")
        .select(`
          id, champ_id, handicap_a, handicap_b,
          player_a_member_id, player_b_member_id,
          partner_a_member_id, partner_b_member_id,
          club_champs!inner(id, club_id, match_type, scoring_mode, points_per_game, best_of, play_all_games, win_condition),
          player_a:player_a_member_id(id, name, club_member_number),
          player_b:player_b_member_id(id, name, club_member_number),
          partner_a:partner_a_member_id(id, name, club_member_number),
          partner_b:partner_b_member_id(id, name, club_member_number)
        `)
        .eq("id", matchId)
        .maybeSingle();

      if (cancelled || error || !data) return;

      const row = data as any;
      const champ = Array.isArray(row.club_champs) ? row.club_champs[0] : row.club_champs;
      if (champ?.scoring_mode === "time_capped_points") {
        navigate(`/bells-marker/${matchId}`, { replace: true });
        return;
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
      };

      if (cancelled) return;
      setConfig(nextConfig);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("source");
        next.delete("matchId");
        return next;
      }, { replace: true });
    };

    loadLinkedTournamentMatch();
    return () => { cancelled = true; };
  }, [config?.sourceId, navigate, searchParams, setSearchParams]);

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
  };

  const resetMatch = () => {
    try {
      localStorage.removeItem(MARKER_CONFIG_KEY);
      localStorage.removeItem(MARKER_STATE_KEY);
    } catch {}
    setConfig(null);
  };

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

  const handleMatchComplete = async (result: {
    games: GameScore[];
    winnerId: "a" | "b";
    durationSeconds: number;
    forfeit?: { absentSide: "a" | "b" };
  }) => {
    if (!config) return;

    const playerAMemberId = config.playerA.clubMemberId;
    const playerBMemberId = config.playerB.clubMemberId;

    if (!playerAMemberId && !playerBMemberId) {
      toast.info("Match scored! Players must be members or visitors to save results.");
      return;
    }

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
        {!config ? (
          <MarkerSetup onStart={startConfig} />
        ) : (
          <MarkerScoreboard
            config={config}
            initialScores={
              config.source === "tournament" && ((config as any).handicapA || (config as any).handicapB)
                ? [{ a: Number((config as any).handicapA) || 0, b: Number((config as any).handicapB) || 0 }]
                : undefined
            }
            onMatchComplete={handleMatchComplete}
            onReset={resetMatch}
            onScratch={handleScratch}
          />
        )}
      </div>
      <BackToDashboard />
    </div>
  );
}
