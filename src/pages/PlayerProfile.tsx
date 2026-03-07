import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { useHeadToHead, usePlayerProfile, useProfile, useSquashTotals } from "@/hooks/use-data";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Flame, Loader2, Swords, Target, Timer, Trophy, TrendingUp } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  const isSelf = !!id && user?.id === id;
  const showRecentMatches = isSelf || (!!player && (((player as any)?.privacy_show_recent_matches) ?? true));
  const showTraining = isSelf || (!!player && (((player as any)?.privacy_show_training) ?? true));
  const showAbout = isSelf || (!!player && (((player as any)?.privacy_show_about) ?? true));
  const showAvailability = isSelf || (!!player && (((player as any)?.privacy_show_availability) ?? true));
  const showAdvanced = isSelf || (!!player && (((player as any)?.privacy_show_advanced_stats) ?? true));

  const { data: squashTotals, isLoading: squashTotalsLoading } = useSquashTotals(showAdvanced ? id : null);
  const { data: headToHead, isLoading: headToHeadLoading } = useHeadToHead(showRecentMatches ? id : null, 10);

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ["player-matches", id],
    queryFn: async () => {
      if (!id) return [];
      const { data: matches, error } = await supabase
        .from("matches")
        .select("*")
        .or(`player_a.eq.${id},player_b.eq.${id}`)
        .eq("is_friendly", false)
        .order("match_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const opponentIds = [...new Set((matches || []).flatMap((m: any) => [m.player_a, m.player_b]).filter((x: string) => x !== id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", opponentIds.length > 0 ? opponentIds : ["00000000-0000-0000-0000-000000000000"]);
      if (profilesError) throw profilesError;

      const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.name as string]));
      return (matches || []).map((m: any) => {
        const opponentId = m.player_a === id ? m.player_b : m.player_a;
        let sets_text: string | null = null;
        if (m.game_scores) {
          try {
            const parsed = JSON.parse(m.game_scores);
            const sets = parsed?.sets;
            if (Array.isArray(sets) && sets.length > 0) {
              sets_text = sets
                .slice(0, 5)
                .map((s: any) => `${s?.a}-${s?.b}`)
                .join(" · ");
            }
          } catch {
            sets_text = null;
          }
        }
        return {
          ...m,
          opponent_name: nameMap.get(opponentId) || "Unknown",
          is_win: m.winner_id === id,
          sets_text,
        };
      });
    },
    enabled: !!id && !!player && showRecentMatches,
  });

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

  const rivals = useMemo(() => {
    const rows = headToHead || [];
    return rows
      .filter((r: any) => (r?.matches ?? 0) >= 2)
      .slice()
      .sort((a: any, b: any) => {
        if ((b.matches ?? 0) !== (a.matches ?? 0)) return (b.matches ?? 0) - (a.matches ?? 0);
        return Math.abs((a.win_rate ?? 0) - 50) - Math.abs((b.win_rate ?? 0) - 50);
      })
      .slice(0, 3);
  }, [headToHead]);

  const headToHeadVsMe = useMemo(() => {
    if (!user?.id || !id || user.id === id) return null;
    return (headToHead || []).find((r: any) => r.opponent_id === user.id) || null;
  }, [headToHead, id, user?.id]);

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
  const stravaElevationM =
    (player as any)?.strava_connected && (player as any)?.strava_elevation_m != null
      ? Math.round(Number((player as any).strava_elevation_m) * 10) / 10
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
  const bio = ((player as any).bio as string | null) || null;
  const location = ((player as any).location as string | null) || null;
  const homeClub = ((player as any).home_club as string | null) || null;
  const dominantHand = ((player as any).dominant_hand as string | null) || null;
  const yearsPlaying = ((player as any).years_playing as number | null) ?? null;
  const playingStyle = ((player as any).playing_style as string | null) || null;
  const favoriteShot = ((player as any).favorite_shot as string | null) || null;
  const availability = ((player as any).availability as string | null) || null;

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

      {showAdvanced ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 mt-2">
            <StatCard
              label="Streak"
              value={squashTotals?.current_streak || (squashTotalsLoading ? "…" : "—")}
              icon={<Flame className="w-4 h-4" />}
            />
            <StatCard
              label="Sets F/A"
              value={
                squashTotals
                  ? `${squashTotals.sets_for}-${squashTotals.sets_against}`
                  : squashTotalsLoading ? "…" : "—"
              }
              icon={<Activity className="w-4 h-4" />}
            />
            <StatCard
              label="Points F/A"
              value={
                squashTotals
                  ? `${squashTotals.points_for}-${squashTotals.points_against}`
                  : squashTotalsLoading ? "…" : "—"
              }
              icon={<Activity className="w-4 h-4" />}
            />
            <StatCard
              label="Avg mins"
              value={squashTotals?.avg_duration_min != null ? `${squashTotals.avg_duration_min}m` : squashTotalsLoading ? "…" : "—"}
              icon={<Timer className="w-4 h-4" />}
            />
          </div>

          <div className="px-4 mt-2">
            <Card className="p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Confirmed:{" "}
                  <span className="text-foreground font-medium">
                    {squashTotals ? `${squashTotals.wins}W ${squashTotals.losses}L` : squashTotalsLoading ? "…" : "—"}
                  </span>{" "}
                  ·{" "}
                  <span className="text-foreground font-medium">
                    {squashTotals ? `${squashTotals.win_rate}%` : squashTotalsLoading ? "…" : "—"} win
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Last:{" "}
                  <span className="text-foreground font-medium">
                    {squashTotals?.last_match_date || (squashTotalsLoading ? "…" : "—")}
                  </span>
                </p>
              </div>
              {(player as any)?.form_last5 ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Recent form:{" "}
                  <span className="text-foreground font-medium">{String((player as any).form_last5)}</span>
                </p>
              ) : null}
            </Card>
          </div>
        </>
      ) : null}

      {showRecentMatches ? (
        <div className="px-4 mt-3">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold font-heading">Head-to-head</p>
                <p className="text-xs text-muted-foreground mt-0.5">Competitive confirmed matches only.</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                Top
              </Badge>
            </div>

            {headToHeadVsMe ? (
              <div className="mt-3 rounded-md border p-3">
                <p className="text-sm font-medium">vs you</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {headToHeadVsMe.matches} matches · {headToHeadVsMe.wins}W {headToHeadVsMe.losses}L · {headToHeadVsMe.win_rate}% win
                </p>
              </div>
            ) : null}

            {rivals.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {rivals.map((r: any) => (
                  <div key={r.opponent_id} className="rounded-md border p-3">
                    <p className="text-sm font-medium truncate">{r.opponent_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.matches} matches · {r.wins}W {r.losses}L
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-3">
              {headToHeadLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : (headToHead || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No head-to-head data yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Opponent</TableHead>
                      <TableHead className="w-[18%]">W/L</TableHead>
                      <TableHead className="w-[22%]">Sets</TableHead>
                      <TableHead className="w-[20%] text-right">Last</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(headToHead || []).slice(0, 6).map((r: any) => (
                      <TableRow key={r.opponent_id}>
                        <TableCell className="p-3 text-sm">{r.opponent_name}</TableCell>
                        <TableCell className="p-3 text-sm tabular-nums">{r.wins}-{r.losses}</TableCell>
                        <TableCell className="p-3">
                          <p className="text-sm tabular-nums">{r.sets_for}-{r.sets_against}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {r.points_for}-{r.points_against} pts
                          </p>
                        </TableCell>
                        <TableCell className="p-3 text-sm text-right text-muted-foreground tabular-nums">
                          {r.last_match_date || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      <Separator className="my-5 mx-4" />

      <div className="px-4 mb-4">
        <Card className="p-4">
          <p className="text-sm font-semibold font-heading">About</p>
          <div className="mt-2 space-y-3">
            {showAbout ? (
              <>
                {bio ? (
                  <p className="text-sm leading-relaxed">{bio}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No bio yet.</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <AboutItem label="Location" value={location} />
                  <AboutItem label="Home club" value={homeClub} />
                  <AboutItem
                    label="Dominant hand"
                    value={
                      dominantHand
                        ? dominantHand === "right"
                          ? "Right"
                          : dominantHand === "left"
                            ? "Left"
                            : dominantHand === "ambidextrous"
                              ? "Ambidextrous"
                              : dominantHand
                        : null
                    }
                  />
                  <AboutItem label="Years playing" value={yearsPlaying != null ? String(yearsPlaying) : null} />
                  <AboutItem label="Playing style" value={playingStyle} />
                  <AboutItem label="Favorite shot" value={favoriteShot} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">This player has hidden their about section.</p>
            )}

            {showAvailability && availability ? (
              <div className="rounded-md border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Availability</p>
                <p className="text-sm mt-1">{availability}</p>
              </div>
            ) : !showAvailability ? (
              <p className="text-sm text-muted-foreground">Availability is hidden.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {showRecentMatches ? (
        <div className="px-4 mb-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold font-heading">Recent Matches</p>
              <Badge variant="secondary" className="text-[10px]">
                Last 10
              </Badge>
            </div>

            {matchesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : (matches || []).length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">No matches recorded yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {(matches || []).slice(0, 10).map((m: any) => (
                  <div key={m.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          vs {m.opponent_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.match_date} · Court {m.court_id || "—"}
                        </p>
                        {m.sets_text && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Sets: {m.sets_text}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{m.score || "—"}</p>
                        {m.winner_id ? (
                          <Badge variant="secondary" className={m.is_win ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}>
                            {m.is_win ? "Win" : "Loss"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground">
                            Pending
                          </Badge>
                        )}
                        {!m.confirmed && (
                          <p className="text-[10px] text-muted-foreground mt-1">Unconfirmed</p>
                        )}
                        {m.disputed && (
                          <p className="text-[10px] text-destructive mt-1">Disputed</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="px-4 mb-4">
          <Card className="p-4 text-sm text-muted-foreground">Match history is hidden.</Card>
        </div>
      )}

      {showTraining ? (
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
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</p>
                  <p className="text-sm font-semibold">{stravaKm != null ? `${stravaKm} km` : "—"}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Time</p>
                  <p className="text-sm font-semibold">{stravaMinutes != null ? `${stravaMinutes} min` : "—"}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Elevation</p>
                  <p className="text-sm font-semibold">{stravaElevationM != null ? `${stravaElevationM} m` : "—"}</p>
                </div>
                <div className="rounded-md border p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Activities</p>
                  <p className="text-sm font-semibold">{stravaActivitiesCount != null ? stravaActivitiesCount : "—"}</p>
                </div>
                <p className="text-[11px] text-muted-foreground col-span-2 sm:col-span-4">
                  {stravaLastSync ? `Last synced: ${stravaLastSync.toLocaleString()}` : "Not synced yet."}
                </p>
              </div>
            ) : null}
          </Card>
        </div>
      ) : (
        <div className="px-4 mb-4">
          <Card className="p-4 text-sm text-muted-foreground">Training stats are hidden.</Card>
        </div>
      )}

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

function AboutItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={value ? "text-sm font-medium mt-1" : "text-sm text-muted-foreground mt-1"}>
        {value || "—"}
      </p>
    </div>
  );
}
