import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IntegrationLogo } from "@/components/IntegrationLogo";
import { useHeadToHead, usePlayerProfile, useProfile, useSquashTotals, useLadder } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
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
  const { activeMember } = useMemberContext();
  const queryClient = useQueryClient();
  const { data: me } = useProfile();
  const { data: player, isLoading, error: playerError } = usePlayerProfile(id);
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;
  const { data: ladder } = useLadder(clubId);
  const challengeLevelsUp = (clubData?.club as any)?.challenge_levels_up ?? 2;
  const isSelf = !!id && (user?.id === id || activeMember?.id === id);
  const showRecentMatches = isSelf || (!!player && (((player as any)?.privacy_show_recent_matches) ?? true));
  const showTraining = isSelf || (!!player && (((player as any)?.privacy_show_training) ?? true));
  const showAbout = isSelf || (!!player && (((player as any)?.privacy_show_about) ?? true));
  const showAvailability = isSelf || (!!player && (((player as any)?.privacy_show_availability) ?? true));
  const showAdvanced = isSelf || (!!player && (((player as any)?.privacy_show_advanced_stats) ?? true));

  // Resolve the club_member_id for this player from the ladder data
  const playerMemberId = useMemo(() => {
    if (!ladder || !id) return null;
    const member = (ladder as any[]).find((m: any) => m.club_member_id === id || m.user_id === id || m.id === id);
    return member?.club_member_id || id;
  }, [ladder, id]);

  const myMemberId = activeMember?.id || null;

  const { data: squashTotals, isLoading: squashTotalsLoading } = useSquashTotals(
    showAdvanced ? id : null,
    { memberId: showAdvanced ? playerMemberId : null }
  );
  const { data: headToHead, isLoading: headToHeadLoading } = useHeadToHead(
    showRecentMatches ? id : null,
    10,
    { memberId: showRecentMatches ? playerMemberId : null }
  );

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ["player-matches", playerMemberId || id],
    queryFn: async () => {
      if (!id && !playerMemberId) return [];
      const { data: matches, error } = await (supabase as any)
        .from("matches")
        .select("*")
        .or(playerMemberId
          ? `player_a_member_id.eq.${playerMemberId},player_b_member_id.eq.${playerMemberId}`
          : `player_a.eq.${id},player_b.eq.${id}`)
        .order("match_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50) as any;
      if (error) throw error;

      const opponentIds = [...new Set((matches || []).flatMap((m: any) => [m.player_a, m.player_b]).filter((x: string) => x !== id))] as string[];
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

  const perfProgress = useMemo(() => {
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const played = Number(player?.matches_played || 0);
    const wins = Number(player?.wins || 0);
    const winPct = Number.isFinite(winRate) ? winRate : 0;
    return {
      played: clamp01(played / 50),
      wins: clamp01(wins / 25),
      winPct: clamp01(winPct / 100),
    };
  }, [player?.matches_played, player?.wins, winRate]);

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

  // Use ladder position for challenge eligibility
  const playerLadderPosition = useMemo(() => {
    if (!id || !ladder) return null;
    return ladder.find(p => p.id === id)?.ladder_position ?? null;
  }, [id, ladder]);

  const myLadderPosition = useMemo(() => {
    if (!user?.id || !ladder) return null;
    return ladder.find(p => p.id === user.id)?.ladder_position ?? null;
  }, [user?.id, ladder]);

  const canChallenge = useMemo(() => {
    if (!user?.id || !myLadderPosition || !playerLadderPosition) return false;
    if (player?.id === user.id) return false;
    if (myLadderPosition <= playerLadderPosition) return false;
    const diff = myLadderPosition - playerLadderPosition;
    return diff >= 1 && diff <= challengeLevelsUp;
  }, [myLadderPosition, playerLadderPosition, player?.id, user?.id, challengeLevelsUp]);

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

  if (playerError) {
    return (
      <div className="bottom-nav-safe">
        <PageHeader title="Player" />
        <div className="px-4 mt-4 space-y-3">
          <Card className="p-4 text-sm text-muted-foreground">
            Could not load this player profile. {String((playerError as any)?.message || "")}
          </Card>
          <Button variant="outline" onClick={() => navigate("/ladder")}>Back to ladder</Button>
        </div>
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
  const availabilityParts = availability
    ? availability
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Player Profile" subtitle={playerLadderPosition ? `Rank #${playerLadderPosition}` : "Unranked"} />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-4 pb-4">
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary via-accent to-transparent" />
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar initials={initials} rank={playerLadderPosition} size="md" avatarUrl={(player as any)?.avatar_url || null} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{player.name || "Player"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {player.matches_played} played · {player.wins}W {player.losses}L · {winRate}% win
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => navigate("/ladder")}
                >
                  View ladder
                </Button>
                {canChallenge ? (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => navigate(`/ladder`)}
                  >
                    <Swords className="w-3 h-3 mr-2" />
                    Challenge
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="p-4 overflow-hidden border-primary/15 bg-gradient-to-br from-fuchsia-500/10 via-background to-sky-500/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold font-heading">Performance</p>
              <p className="text-xs text-muted-foreground mt-0.5">At-a-glance stats.</p>
            </div>
            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border border-primary/20 shrink-0">
              {playerLadderPosition ? `Rank #${playerLadderPosition}` : "Unranked"}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
            <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
              <p className="text-[10px] uppercase tracking-wide text-foreground/70">Win rate</p>
              <div className="mt-2 flex items-center justify-center">
                <div className="relative w-28 h-28">
                  {(() => {
                  const ring = (radius: number, progress: number) => {
                    const c = 2 * Math.PI * radius;
                    const offset = c * (1 - progress);
                    return { c, offset };
                  };
                  const r1 = ring(44, perfProgress.played);
                  const r2 = ring(30, perfProgress.wins);
                  const r3 = ring(16, perfProgress.winPct);
                  return (
                    <svg viewBox="0 0 120 120" className="w-full h-full">
                      <circle cx="60" cy="60" r="44" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                      <circle
                        cx="60"
                        cy="60"
                        r="44"
                        fill="none"
                        stroke="#007aff"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${r1.c} ${r1.c}`}
                        strokeDashoffset={r1.offset}
                        transform="rotate(-90 60 60)"
                      />

                      <circle cx="60" cy="60" r="30" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                      <circle
                        cx="60"
                        cy="60"
                        r="30"
                        fill="none"
                        stroke="#34c759"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${r2.c} ${r2.c}`}
                        strokeDashoffset={r2.offset}
                        transform="rotate(-90 60 60)"
                      />

                      <circle cx="60" cy="60" r="16" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                      <circle
                        cx="60"
                        cy="60"
                        r="16"
                        fill="none"
                        stroke="#ff2d55"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${r3.c} ${r3.c}`}
                        strokeDashoffset={r3.offset}
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                  );
                })()}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-xl font-bold font-heading">{winRate}%</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#007aff]" />
                  <p className="text-[10px] uppercase tracking-wide text-foreground/70">Played</p>
                </div>
                <p className="text-lg font-bold font-heading mt-1">{player.matches_played || 0}</p>
                <p className="text-[11px] text-muted-foreground -mt-0.5">matches</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#34c759]" />
                  <p className="text-[10px] uppercase tracking-wide text-foreground/70">Wins</p>
                </div>
                <p className="text-lg font-bold font-heading mt-1">{player.wins || 0}</p>
                <p className="text-[11px] text-muted-foreground -mt-0.5">wins</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff9500]" />
                  <p className="text-[10px] uppercase tracking-wide text-foreground/70">Losses</p>
                </div>
                <p className="text-lg font-bold font-heading mt-1">{player.losses || 0}</p>
                <p className="text-[11px] text-muted-foreground -mt-0.5">losses</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff2d55]" />
                  <p className="text-[10px] uppercase tracking-wide text-foreground/70">Rank</p>
                </div>
                <p className="text-lg font-bold font-heading mt-1">{playerLadderPosition ? `#${playerLadderPosition}` : "—"}</p>
                <p className="text-[11px] text-muted-foreground -mt-0.5">ladder</p>
              </div>
            </div>
          </div>
        </Card>

      {showAdvanced ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

          <div>
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
        <div>
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

      <Separator className="my-2" />

      <div>
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {availabilityParts.map((part) => (
                    <Badge key={part} variant="secondary" className="text-[11px]">
                      {part}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  {availability}
                </p>
              </div>
            ) : !showAvailability ? (
              <p className="text-sm text-muted-foreground">Availability is hidden.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {showRecentMatches ? (
        <div>
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
                          {m.match_date} · {m.court_name || `Court ${m.court_id || "—"}`}
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
        <div>
          <Card className="p-4 text-sm text-muted-foreground">Match history is hidden.</Card>
        </div>
      )}

      {showTraining ? (
        <div>
          <Card className="p-4 overflow-hidden border-primary/15 bg-gradient-to-br from-rose-500/10 via-background to-sky-500/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold font-heading">Health & training</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(player as any)?.strava_connected ? "From Strava (last sync)." : "No connected training stats."}
                </p>
              </div>
              <IntegrationLogo provider="strava" className={(player as any)?.strava_connected ? "" : "opacity-40 grayscale"} />
            </div>

            {(player as any)?.strava_connected ? (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
                <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm flex items-center justify-center">
                  <div className="relative w-28 h-28">
                    <svg viewBox="0 0 120 120" className="w-full h-full">
                      <circle cx="60" cy="60" r="44" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                      <circle cx="60" cy="60" r="44" fill="none" stroke="#ff2d55" strokeWidth="12" />

                      <circle cx="60" cy="60" r="30" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                      <circle cx="60" cy="60" r="30" fill="none" stroke="#34c759" strokeWidth="12" />

                      <circle cx="60" cy="60" r="16" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" opacity="0.35" />
                      <circle cx="60" cy="60" r="16" fill="none" stroke="#007aff" strokeWidth="12" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-[10px] uppercase tracking-wide text-foreground/70">Activity</p>
                      <p className="text-sm font-semibold">{stravaKm != null ? `${stravaKm} km` : "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff2d55]" />
                      <p className="text-[10px] uppercase tracking-wide text-foreground/70">Distance</p>
                    </div>
                    <p className="text-lg font-bold font-heading mt-1">{stravaKm != null ? `${stravaKm}` : "—"}</p>
                    <p className="text-[11px] text-muted-foreground -mt-0.5">kilometers</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#34c759]" />
                      <p className="text-[10px] uppercase tracking-wide text-foreground/70">Time</p>
                    </div>
                    <p className="text-lg font-bold font-heading mt-1">{stravaMinutes != null ? `${stravaMinutes}` : "—"}</p>
                    <p className="text-[11px] text-muted-foreground -mt-0.5">minutes</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#007aff]" />
                      <p className="text-[10px] uppercase tracking-wide text-foreground/70">Elevation</p>
                    </div>
                    <p className="text-lg font-bold font-heading mt-1">{stravaElevationM != null ? `${stravaElevationM}` : "—"}</p>
                    <p className="text-[11px] text-muted-foreground -mt-0.5">meters</p>
                  </div>
                  <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff9500]" />
                      <p className="text-[10px] uppercase tracking-wide text-foreground/70">Activities</p>
                    </div>
                    <p className="text-lg font-bold font-heading mt-1">{stravaActivitiesCount != null ? stravaActivitiesCount : "—"}</p>
                    <p className="text-[11px] text-muted-foreground -mt-0.5">count</p>
                  </div>

                  <div className="col-span-2 rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-foreground/70">Last synced</p>
                      <p className="text-sm font-medium truncate">
                        {stravaLastSync ? stravaLastSync.toLocaleString() : "Not synced yet."}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] bg-primary/10 text-primary border border-primary/20">
                      Strava
                    </Badge>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      ) : (
        <div>
          <Card className="p-4 text-sm text-muted-foreground">Training stats are hidden.</Card>
        </div>
      )}

      <div className="pt-1">
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
    </div>
  );
}

function AboutItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3 cursor-default">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={value ? "text-sm font-medium mt-1" : "text-sm text-muted-foreground mt-1"}>
        {value || "—"}
      </p>
    </div>
  );
}
