import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { usePlayerProfile, useProfile } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Swords, Trophy, Target, TrendingUp } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function PlayerProfile() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: me } = useProfile();
  const { data: player, isLoading } = usePlayerProfile(id);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`realtime:player-profile:${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["player-profile", id] });
          queryClient.invalidateQueries({ queryKey: ["ladder"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  const winRate = useMemo(() => {
    if (!player) return 0;
    return player.matches_played > 0 ? Math.round((player.wins / player.matches_played) * 100) : 0;
  }, [player]);

  const canChallenge = useMemo(() => {
    if (!user?.id || !me?.rank || !player?.rank) return false;
    if (player.id === user.id) return false;
    const diff = me.rank - player.rank;
    return diff >= 1 && diff <= 2;
  }, [me?.rank, player?.id, player?.rank, user?.id]);

  const stravaKm =
    (player as any)?.strava_connected && (player as any)?.strava_distance_m != null
      ? Math.round((Number((player as any).strava_distance_m) / 1000) * 10) / 10
      : null;
  const stravaMinutes =
    (player as any)?.strava_connected && (player as any)?.strava_moving_time_s != null
      ? Math.round(Number((player as any).strava_moving_time_s) / 60)
      : null;
  const stravaActivitiesCount =
    (player as any)?.strava_connected && typeof (player as any)?.strava_activities_count === "number"
      ? ((player as any).strava_activities_count as number)
      : null;
  const stravaLastSync =
    (player as any)?.strava_connected && (player as any)?.strava_last_sync_at
      ? new Date((player as any).strava_last_sync_at as string)
      : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="bottom-nav-safe">
        <PageHeader title="Player" />
        <div className="px-4 mt-4">
          <Card className="p-4 text-sm text-muted-foreground">Player not found.</Card>
        </div>
      </div>
    );
  }

  const initials = player.name ? initialsFromName(player.name) : "?";

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Player Profile" subtitle={player.rank ? `Rank #${player.rank}` : "Unranked"} />

      <div className="px-4 mt-3">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar initials={initials} rank={player.rank} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{player.name || "Player"}</p>
                <p className="text-xs text-muted-foreground">
                  {player.matches_played} played · {player.wins}W {player.losses}L · {winRate}% win
                </p>
              </div>
            </div>
            {canChallenge && (
              <Button
                size="sm"
                className="h-8 text-xs shrink-0"
                onClick={() => navigate(`/challenges/new?opponent=${player.id}`)}
              >
                <Swords className="w-3 h-3 mr-2" />
                Challenge
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 mt-4">
        <StatCard label="Rank" value={player.rank ? `#${player.rank}` : "—"} icon={<Trophy className="w-4 h-4" />} />
        <StatCard label="Played" value={player.matches_played || 0} icon={<Target className="w-4 h-4" />} />
        <StatCard label="Wins" value={player.wins || 0} variant="win" />
        <StatCard label="Win %" value={`${winRate}%`} icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      <Separator className="my-5 mx-4" />

      <div className="px-4 mb-4">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">Training Stats</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(player as any)?.strava_connected ? "From Strava (last sync)." : "No connected training stats."}
              </p>
            </div>
            <IntegrationLogo provider="strava" className={(player as any)?.strava_connected ? "" : "opacity-40 grayscale"} />
          </div>

          {(player as any)?.strava_connected ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</p>
                <p className="text-sm font-semibold">{stravaKm != null ? `${stravaKm} km` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Time</p>
                <p className="text-sm font-semibold">{stravaMinutes != null ? `${stravaMinutes} min` : "—"}</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Activities</p>
                <p className="text-sm font-semibold">{stravaActivitiesCount != null ? stravaActivitiesCount : "—"}</p>
              </div>
              <p className="text-[11px] text-muted-foreground col-span-3">
                {stravaLastSync ? `Last synced: ${stravaLastSync.toLocaleString()}` : "Not synced yet."}
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="px-4 pb-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate("/ladder");
          }}
        >
          Back
        </Button>
      </div>
    </div>
  );
}
