import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { LadderPlayerCard, type LadderPlayer } from "@/components/LadderPlayerCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useProfile } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export default function Ladder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: players, isLoading } = useLadder();
  const { data: profile } = useProfile();
  const { data: clubData } = useMyClub();
  const ladderStatus = (clubData?.club as any)?.ladder_status || "unranked";
  const myRank = profile?.rank ?? null;
  const queryClient = useQueryClient();
  const [blockedChallenge, setBlockedChallenge] = useState<{
    open: boolean;
    title: string;
    description: string;
  }>({ open: false, title: "Can't challenge this player", description: "" });

  useEffect(() => {
    const channel = supabase
      .channel("realtime:ladder-profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" },
        () => queryClient.invalidateQueries({ queryKey: ["ladder"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const getChallengeBlockReason = useMemo(() => {
    return (playerId: string, opponentRank: number | null) => {
      if (ladderStatus !== "active") return "The ladder is not yet active. Challenges will be enabled once the admin activates the ladder.";
      if (!user?.id) return "You must be logged in to challenge players.";
      if (playerId === user.id) return "You can't challenge yourself.";
      if (!myRank) return "You need a ladder rank before you can challenge players.";
      if (!opponentRank) return "This player is not ranked yet.";
      const diff = Math.abs(myRank - opponentRank);
      if (diff < 1) return "You can't challenge a player with the same rank.";
      if (diff > 2) return "You may only challenge players within 2 ladder positions.";
      if (myRank <= opponentRank) return "You may only challenge players ranked above you.";
      return null;
    };
  }, [myRank, user?.id, ladderStatus]);

  const menPlayers = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() !== "female" && p.gender?.toLowerCase() !== "ladies" && p.gender?.toLowerCase() !== "f") as LadderPlayer[],
    [players]
  );

  const ladiesPlayers = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() === "female" || p.gender?.toLowerCase() === "ladies" || p.gender?.toLowerCase() === "f") as LadderPlayer[],
    [players]
  );

  const handleNavigate = (playerId: string, isMe: boolean) => {
    if (isMe) navigate("/profile", { state: { backgroundLocation: location } });
    else navigate(`/players/${playerId}`);
  };

  const handleChallenge = (playerId: string, rank: number | null) => {
    const reason = getChallengeBlockReason(playerId, rank);
    if (reason) {
      setBlockedChallenge({ open: true, title: "Can't challenge this player", description: reason });
      return;
    }
    navigate(`/challenges/new?opponent=${playerId}`);
  };

  const renderColumn = (title: string, list: LadderPlayer[]) => (
    <div>
      <h2 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
        {title}
        <span className="text-muted-foreground font-normal ml-1.5">({list.length})</span>
      </h2>
      <div className="space-y-1.5">
        {list.map((player, index) => (
          <LadderPlayerCard
            key={player.id}
            player={player}
            index={index}
            isMe={player.id === user?.id}
            isAdmin={false}
            onNavigate={handleNavigate}
            onChallenge={handleChallenge}
            challengeBlocked={!!getChallengeBlockReason(player.id, player.rank)}
          />
        ))}
        {list.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No players yet</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="bottom-nav-safe">
      <SEO title="Player Ladder" description="See the latest squash ladder rankings at Gordon's Bay Squash Club." path="/ladder" noIndex />
      <PageHeader
        title="Player Ladder"
        subtitle={`${(players || []).length} players ranked`}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="px-4 mt-3 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderColumn("Men's Ladder", menPlayers)}
          {renderColumn("Ladies' Ladder", ladiesPlayers)}
        </div>
      )}

      <Dialog
        open={blockedChallenge.open}
        onOpenChange={(open) => setBlockedChallenge((s) => ({ ...s, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{blockedChallenge.title}</DialogTitle>
            <DialogDescription>{blockedChallenge.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setBlockedChallenge((s) => ({ ...s, open: false }))}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
