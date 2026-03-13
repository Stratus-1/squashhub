import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { LadderPlayerCard, type LadderPlayer } from "@/components/LadderPlayerCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useProfile } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


export default function Ladder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  const { data: players, isLoading } = useLadder(clubId);
  const { data: profile } = useProfile();
  
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

  const menPlayers = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() !== "female" && p.gender?.toLowerCase() !== "ladies" && p.gender?.toLowerCase() !== "f") as LadderPlayer[],
    [players]
  );

  const ladiesPlayers = useMemo(() =>
    (players || []).filter((p: any) => p.gender?.toLowerCase() === "female" || p.gender?.toLowerCase() === "ladies" || p.gender?.toLowerCase() === "f") as LadderPlayer[],
    [players]
  );

  // Build position maps from the gender-filtered sorted ladder (index+1 = position)
  const positionMap = useMemo(() => {
    const map = new Map<string, number>();
    menPlayers.forEach((p, i) => map.set(p.id, i + 1));
    ladiesPlayers.forEach((p, i) => map.set(p.id, i + 1));
    return map;
  }, [menPlayers, ladiesPlayers]);

  const myPosition = user?.id ? positionMap.get(user.id) ?? null : null;

  const challengeLevelsUp = (clubData?.club as any)?.challenge_levels_up ?? 2;

  const getChallengeBlockReason = useMemo(() => {
    return (playerId: string, opponentPosition: number | null) => {
      if (!user?.id) return "You must be logged in to challenge players.";
      if (playerId === user.id) return "You can't challenge yourself.";
      if (!myPosition) return "You need a ladder rank before you can challenge players.";
      if (!opponentPosition) return "This player is not ranked yet.";
      if (myPosition === opponentPosition) return "You can't challenge a player with the same rank.";
      if (myPosition <= opponentPosition) return "You may only challenge players ranked above you.";
      const diff = myPosition - opponentPosition;
      if (diff > challengeLevelsUp) return `You may only challenge players within ${challengeLevelsUp} ladder positions above you.`;
      return null;
    };
  }, [myPosition, user?.id, challengeLevelsUp]);

  const handleNavigate = (playerId: string, isMe: boolean) => {
    if (isMe) navigate("/profile", { state: { backgroundLocation: location } });
    else navigate(`/players/${playerId}`);
  };

  const handleChallenge = (playerId: string, _rank: number | null) => {
    const opponentPosition = positionMap.get(playerId) ?? null;
    const reason = getChallengeBlockReason(playerId, opponentPosition);
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
        {list.map((player, index) => {
          const playerPosition = positionMap.get(player.id) ?? null;
          return (
            <LadderPlayerCard
              key={player.id}
              player={player}
              index={index}
              isMe={player.id === user?.id}
              isAdmin={false}
              onNavigate={handleNavigate}
              onChallenge={handleChallenge}
              challengeBlocked={!!getChallengeBlockReason(player.id, playerPosition)}
            />
          );
        })}
        {list.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No players yet</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="bottom-nav-safe">
      <SEO title="Player Ladder" description="See the latest squash ladder rankings." path="/ladder" noIndex />
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
