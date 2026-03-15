import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { MarkerSetup, type MarkerConfig } from "@/components/marker/MarkerSetup";
import { MarkerScoreboard, type GameScore } from "@/components/marker/MarkerScoreboard";
import { SEO } from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function MatchMarker() {
  const [config, setConfig] = useState<MarkerConfig | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleMatchComplete = async (result: {
    games: GameScore[];
    winnerId: "a" | "b";
    durationSeconds: number;
  }) => {
    if (!user || !config) return;

    const playerAId = config.playerA.clubMemberId;
    const playerBId = config.playerB.clubMemberId;

    // Both players need to be linked club members (with user_id) to save to matches table
    // For now, save if both have clubMemberIds - we look up their user_ids
    try {
      // Look up user_ids for the club members
      const memberIds = [playerAId, playerBId].filter(Boolean);
      if (memberIds.length < 2) {
        toast.info("Match scored! Results are shown above but not saved (both players must be club members).");
        return;
      }

      const { data: members } = await supabase
        .from("club_members")
        .select("id, user_id")
        .in("id", memberIds as string[]);

      const memberA = members?.find((m) => m.id === playerAId);
      const memberB = members?.find((m) => m.id === playerBId);

      if (!memberA?.user_id || !memberB?.user_id) {
        toast.info("Match scored! Both players need linked accounts to save results.");
        return;
      }

      const winnerUserId = result.winnerId === "a" ? memberA.user_id : memberB.user_id;

      const gameScoresJson = JSON.stringify({
        sets: result.games.map((g) => ({ a: g.a, b: g.b })),
      });

      const scoreStr = result.games.map((g) => `${g.a}-${g.b}`).join(", ");

      const { error } = await supabase.from("matches").insert({
        player_a: memberA.user_id,
        player_b: memberB.user_id,
        winner_id: winnerUserId,
        score: scoreStr,
        game_scores: gameScoresJson,
        duration_s: result.durationSeconds,
        submitted_by: user.id,
        confirmed: false,
        notes: `Marked via live scorer. Format: ${config.scoringFormat}, Best of ${config.bestOf}.`,
      });

      // Notify the other player to confirm
      if (!error) {
        const otherUserId = memberA.user_id === user.id ? memberB.user_id : memberA.user_id;
        try {
          await supabase.from("notifications" as any).insert({
            user_id: otherUserId,
            title: "Confirm Match Result",
            message: `A match result (${scoreStr}) has been submitted and needs your confirmation.`,
            type: "match",
            url: "/dashboard",
          });
        } catch { /* non-critical */ }
      }

      if (error) {
        console.error("Failed to save match:", error);
        toast.error("Could not save match result");
      } else {
        toast.success("Match result saved! Awaiting player confirmation.");
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
          <MarkerSetup onStart={setConfig} />
        ) : (
          <MarkerScoreboard
            config={config}
            onMatchComplete={handleMatchComplete}
            onReset={() => setConfig(null)}
          />
        )}
      </div>
    </div>
  );
}
