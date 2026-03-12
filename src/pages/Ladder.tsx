import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SEO } from "@/components/SEO";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Swords, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

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

  return (
    <div className="bottom-nav-safe">
      <SEO title="Player Ladder" description="See the latest squash ladder rankings at Gordon's Bay Squash Club." path="/ladder" noIndex />
      <PageHeader
        title="Player Ladder"
        subtitle={`${players?.length || 0} players ranked`}
      />

      <div className="px-4 mt-3 space-y-2 mb-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          (players || []).map((player, index) => {
            const winRate =
              player.matches_played > 0
                ? Math.round((player.wins / player.matches_played) * 100)
                : 0;

            const stravaKm =
              (player as any)?.strava_connected && (player as any)?.strava_distance_m != null
                ? Math.round((Number((player as any).strava_distance_m) / 1000) * 10) / 10
                : null;
            const stravaMinutes =
              (player as any)?.strava_connected && (player as any)?.strava_moving_time_s != null
                ? Math.round(Number((player as any).strava_moving_time_s) / 60)
                : null;

            const form = typeof (player as any)?.form_last5 === "string" ? String((player as any).form_last5) : "";
            const lastCompetitive = (player as any)?.last_competitive_match_at
              ? new Date(String((player as any).last_competitive_match_at)).getTime()
              : null;
            const inactiveDays =
              lastCompetitive != null ? Math.floor((Date.now() - lastCompetitive) / (1000 * 60 * 60 * 24)) : null;
            const isInactive = inactiveDays != null && inactiveDays >= 21;

            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={cn(
                  "p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors",
                  index === 0 && "border-accent/50 bg-accent/5",
                  index === 1 && "border-primary/30 bg-primary/5",
                  index === 2 && "border-primary/20 bg-primary/[0.02]"
                )}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (player.id === user?.id) navigate("/profile", { state: { backgroundLocation: location } });
                  else navigate(`/players/${player.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  if (player.id === user?.id) navigate("/profile", { state: { backgroundLocation: location } });
                  else navigate(`/players/${player.id}`);
                }}
                >
                  {/* Rank */}
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0",
                    index === 0 ? "bg-accent text-accent-foreground" :
                    index <= 2 ? "bg-primary/15 text-primary" :
                    "bg-secondary text-muted-foreground"
                  )}>
                    {player.rank ?? "—"}
                  </div>

                  <PlayerAvatar initials={getInitials(player.name)} size="sm" avatarUrl={(player as any)?.avatar_url || null} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold truncate">{player.name}</p>
                      {player.id === user?.id && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {player.wins}W - {player.losses}L
                      </span>
                      <span className="text-[11px] text-win font-medium flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3" />
                        {winRate}%
                      </span>
                      {isInactive && (
                        <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                      {stravaKm != null && stravaMinutes != null && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
                          <IntegrationLogo provider="strava" className="h-4 w-4 rounded-sm" />
                          <span className="truncate">
                            {stravaKm} km · {stravaMinutes} min
                          </span>
                        </span>
                      )}
                    </div>
                    {form ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Form</span>
                        <div className="flex items-center gap-1">
                          {form.split("").slice(0, 5).map((c, idx) => (
                            <span
                              key={idx}
                              className={cn(
                                "text-[10px] font-semibold w-5 h-5 rounded-full flex items-center justify-center",
                                c === "W" ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"
                              )}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-8 text-xs shrink-0 gap-1",
                      !!getChallengeBlockReason(player.id, player.rank) && "opacity-50 cursor-not-allowed"
                    )}
                    aria-disabled={!!getChallengeBlockReason(player.id, player.rank)}
                    onClick={(e) => {
                      e.stopPropagation();
                      const reason = getChallengeBlockReason(player.id, player.rank);
                      if (reason) {
                        setBlockedChallenge({
                          open: true,
                          title: "Can't challenge this player",
                          description: reason,
                        });
                        return;
                      }

                      navigate(`/challenges/new?opponent=${player.id}`);
                    }}
                  >
                    <Swords className="w-3 h-3" />
                    Challenge
                  </Button>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

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
            <Button onClick={() => setBlockedChallenge((s) => ({ ...s, open: false }))}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
