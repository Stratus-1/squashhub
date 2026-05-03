import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MARKER_CONFIG_KEY, MARKER_STATE_KEY } from "@/lib/marker-storage";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { MarkerSetup, type MarkerConfig } from "@/components/marker/MarkerSetup";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import { fromExt } from "@/lib/supabase-ext";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function MatchMarker() {
  const [config, setConfig] = useState<MarkerConfig | null>(() => {
    try {
      const raw = localStorage.getItem(MARKER_CONFIG_KEY);
      return raw ? (JSON.parse(raw) as MarkerConfig) : null;
    } catch {
      return null;
    }
  });
  const { user } = useAuth();
  const navigate = useNavigate();

  // Persist config so user can navigate away and resume
  useEffect(() => {
    try {
      if (config) localStorage.setItem(MARKER_CONFIG_KEY, JSON.stringify(config));
      else localStorage.removeItem(MARKER_CONFIG_KEY);
    } catch {}
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

  const handleMatchComplete = async (result: {
    games: GameScore[];
    winnerId: "a" | "b";
    durationSeconds: number;
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

      const gameScoresJson = JSON.stringify({
        sets: result.games.map((g) => ({ a: g.a, b: g.b })),
      });

      const scoreStr = result.games.map((g) => `${g.a}-${g.b}`).join(", ");

      // Use member IDs as primary — user_ids are optional (may be null for unlinked members)
      // Auto-confirm friendly matches and matches where opponent has no user account
      const isFriendly = config.matchType === "friendly";
      const opponentHasAccount = result.winnerId === "a" ? !!memberB?.user_id : !!memberA?.user_id;
      const autoConfirm = isFriendly || !opponentHasAccount;

      // Build notes with player names (especially important for visitors not in club_members)
      const noteParts = [`Marked via live scorer. Format: ${config.scoringFormat}, Best of ${config.bestOf}${config.isDoubles ? ', Doubles' : ''}`];
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
      });

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

      toast.success(autoConfirm ? "Match result saved and confirmed!" : "Match result saved! Awaiting player confirmation.");

      // If this was a tournament match, update the club_champs_matches record too
      if (config.source === "tournament" && config.sourceId) {
        try {
          await fromExt("club_champs_matches")
            .update({
              score: scoreStr,
              game_scores: gameScoresJson,
              winner_member_id: winnerMemberId,
              status: "completed",
            })
            .eq("id", config.sourceId);
        } catch (e) {
          console.warn("Could not update tournament match:", e);
        }
      }
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
            onMatchComplete={handleMatchComplete}
            onReset={resetMatch}
          />
        )}
      </div>
      <BackToDashboard />
    </div>
  );
}
