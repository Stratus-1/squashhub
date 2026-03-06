import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Swords, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useProfile } from "@/hooks/use-data";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Ladder() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: players, isLoading } = useLadder();
  const { data: profile } = useProfile();
  const myRank = profile?.rank ?? null;
  const queryClient = useQueryClient();

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

  return (
    <div className="bottom-nav-safe">
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

            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={cn(
                  "p-3 flex items-center gap-3",
                  index === 0 && "border-accent/50 bg-accent/5",
                  index === 1 && "border-primary/30 bg-primary/5",
                  index === 2 && "border-primary/20 bg-primary/[0.02]"
                )}>
                  {/* Rank */}
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0",
                    index === 0 ? "bg-accent text-accent-foreground" :
                    index <= 2 ? "bg-primary/15 text-primary" :
                    "bg-secondary text-muted-foreground"
                  )}>
                    {player.rank}
                  </div>

                  <PlayerAvatar initials={getInitials(player.name)} size="sm" />

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
                      {stravaKm != null && stravaMinutes != null && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
                          <IntegrationLogo provider="strava" className="h-4 w-4 rounded-sm" />
                          <span className="truncate">
                            {stravaKm} km · {stravaMinutes} min
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs shrink-0 gap-1"
                    disabled={
                      player.id === user?.id ||
                      !myRank ||
                      !player.rank ||
                      myRank - player.rank < 1 ||
                      myRank - player.rank > 2
                    }
                    onClick={() => navigate(`/challenges/new?opponent=${player.id}`)}
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
    </div>
  );
}
