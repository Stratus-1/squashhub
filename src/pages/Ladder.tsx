import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { LadderPlayerCard } from "@/components/LadderPlayerCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useProfile } from "@/hooks/use-data";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Ladder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: players, isLoading } = useLadder();
  const { data: profile } = useProfile();
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => queryClient.invalidateQueries({ queryKey: ["ladder"] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const getChallengeBlockReason = useMemo(() => {
    return (playerId: string, opponentRank: number | null) => {
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
  }, [myRank, user?.id]);

  const menPlayers = useMemo(() =>
    (players || []).filter(p => (p as any).gender?.toLowerCase() !== "female" && (p as any).gender?.toLowerCase() !== "ladies" && (p as any).gender?.toLowerCase() !== "f"),
    [players]
  );

  const ladiesPlayers = useMemo(() =>
    (players || []).filter(p => (p as any).gender?.toLowerCase() === "female" || (p as any).gender?.toLowerCase() === "ladies" || (p as any).gender?.toLowerCase() === "f"),
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

  const totalPlayers = (players || []).length;

  return (
    <div className="bottom-nav-safe">
      <SEO title="Player Ladder" description="See the latest squash ladder rankings at Gordon's Bay Squash Club." path="/ladder" noIndex />
      <PageHeader
        title="Player Ladder"
        subtitle={`${totalPlayers} players ranked`}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="px-4 mt-3 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Men's Ladder */}
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
              Men's Ladder
              <span className="text-muted-foreground font-normal ml-1.5">({menPlayers.length})</span>
            </h2>
            <div className="space-y-1.5">
              {menPlayers.map((player, index) => (
                <LadderPlayerCard
                  key={player.id}
                  player={player as any}
                  index={index}
                  isMe={player.id === user?.id}
                  onNavigate={handleNavigate}
                  onChallenge={handleChallenge}
                  challengeBlocked={!!getChallengeBlockReason(player.id, (player as any).rank)}
                />
              ))}
              {menPlayers.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No men's players yet</p>
              )}
            </div>
          </div>

          {/* Ladies' Ladder */}
          <div>
            <h2 className="text-sm font-heading font-bold text-foreground mb-2 uppercase tracking-wide">
              Ladies' Ladder
              <span className="text-muted-foreground font-normal ml-1.5">({ladiesPlayers.length})</span>
            </h2>
            <div className="space-y-1.5">
              {ladiesPlayers.map((player, index) => (
                <LadderPlayerCard
                  key={player.id}
                  player={player as any}
                  index={index}
                  isMe={player.id === user?.id}
                  onNavigate={handleNavigate}
                  onChallenge={handleChallenge}
                  challengeBlocked={!!getChallengeBlockReason(player.id, (player as any).rank)}
                />
              ))}
              {ladiesPlayers.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No ladies' players yet</p>
              )}
            </div>
          </div>
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
