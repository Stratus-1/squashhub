import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Crown, Flame, Loader2, Medal, Swords, Star, Trophy, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useSeasons, useSeasonAwards } from "@/hooks/use-analytics";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AWARD_ICONS: Record<string, any> = {
  champion: Crown,
  most_improved: Star,
  most_active: Flame,
  runner_up: Medal,
  default: Trophy,
};

const AWARD_COLORS: Record<string, string> = {
  champion: "text-accent-foreground bg-accent/20",
  most_improved: "text-primary bg-primary/10",
  most_active: "text-destructive bg-destructive/10",
  runner_up: "text-muted-foreground bg-muted",
};

export default function Seasons() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: seasons, isLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [showAllSeasonMatches, setShowAllSeasonMatches] = useState(false);

  const activeSeason = (seasons || []).find((s: any) => !!s.is_active);
  const pastSeasons = (seasons || []).filter((s: any) => !s.is_active);
  const viewingId = selectedSeasonId || activeSeason?.id || pastSeasons[0]?.id;
  const viewingSeason = useMemo(() => (seasons || []).find((s: any) => s.id === viewingId) || null, [seasons, viewingId]);

  const { data: awards, isLoading: awardsLoading } = useSeasonAwards(viewingId);

  useEffect(() => {
    setShowAllSeasonMatches(false);
  }, [viewingId]);

  const { data: membershipCount } = useQuery({
    queryKey: ["season-members-count", viewingId],
    queryFn: async () => {
      if (!viewingId) return 0;
      const { count, error } = await (supabase as any)
        .from("season_memberships")
        .select("id", { count: "exact", head: true })
        .eq("season_id", viewingId);
      if (error) {
        if ((error as any).code === "42P01") return 0;
        throw error;
      }
      return typeof count === "number" ? count : 0;
    },
    enabled: !!viewingId,
  });

  const { data: joinedActiveSeason } = useQuery({
    queryKey: ["season-membership", user?.id, activeSeason?.id],
    queryFn: async () => {
      if (!user || !activeSeason) return false;
      const { data, error } = await (supabase as any)
        .from("season_memberships")
        .select("season_id")
        .eq("season_id", activeSeason.id)
        .eq("user_id", user.id)
        .limit(1);
      if (error) {
        if ((error as any).code === "42P01") return false;
        throw error;
      }
      return (data || []).length > 0;
    },
    enabled: !!user && !!activeSeason?.id,
  });

  const joinSeason = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("join_active_season");
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      toast.success("Joined the season");
      await queryClient.invalidateQueries({ queryKey: ["season-membership", user?.id, activeSeason?.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not join season"),
  });

  const { data: seasonMatches, isLoading: seasonMatchesLoading, error: seasonMatchesError } = useQuery({
    queryKey: ["season-matches", viewingId, viewingSeason?.starts_on, viewingSeason?.ends_on],
    queryFn: async () => {
      if (!viewingSeason) {
        return {
          totalMatches: 0,
          confirmedMatches: 0,
          disputedMatches: 0,
          totalMinutes: null as number | null,
          uniquePlayers: 0,
          rows: [] as any[],
        };
      }

      const from = viewingSeason.starts_on as string;
      const to = (viewingSeason.ends_on as string | null) || new Date().toISOString().slice(0, 10);

      const applySeasonFilters = (q: any) =>
        q.eq("is_friendly", false)
          .gte("match_date", from)
          .lte("match_date", to);

      const { count, error: countError } = await applySeasonFilters(
        (supabase as any).from("matches").select("id", { count: "exact", head: true })
      );
      if (countError) throw countError;

      const { data: matches, error } = await applySeasonFilters((supabase as any).from("matches").select("*"))
        .order("match_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;

      const ids = [...new Set((matches || []).flatMap((m: any) => [m.player_a, m.player_b]).filter(Boolean))] as string[];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (profilesError) throw profilesError;

      const nameById = new Map((profiles || []).map((p: any) => [p.id, p.name as string]));
      const mapped = (matches || []).map((m: any) => ({
        ...m,
        player_a_name: nameById.get(m.player_a) || "Unknown",
        player_b_name: nameById.get(m.player_b) || "Unknown",
      }));

      const confirmedMatches = mapped.filter((m: any) => !!m.confirmed).length;
      const disputedMatches = mapped.filter((m: any) => !!m.disputed).length;
      const totalSeconds = mapped.reduce((acc: number, m: any) => acc + (typeof m.duration_s === "number" ? m.duration_s : 0), 0);
      const totalMinutes = totalSeconds > 0 ? Math.round(totalSeconds / 60) : null;

      return {
        totalMatches: typeof count === "number" ? count : mapped.length,
        confirmedMatches,
        disputedMatches,
        totalMinutes,
        uniquePlayers: ids.length,
        rows: mapped,
      };
    },
    enabled: !!viewingId && !!viewingSeason,
  });

  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ["season-standings", viewingId, viewingSeason?.is_active],
    queryFn: async () => {
      if (!viewingSeason || !viewingId) return [];

      if (viewingSeason.is_active) {
        const { data, error } = await (supabase as any)
          .from("profiles")
          .select("id,name,rank,matches_played,wins,losses")
          .not("rank", "is", null)
          .order("rank", { ascending: true })
          .limit(12);
        if (error) throw error;
        return data || [];
      }

      const { data: snapshot, error } = await (supabase as any)
        .from("season_profiles")
        .select("season_id,user_id,rank,matches_played,wins,losses")
        .eq("season_id", viewingId)
        .order("rank", { ascending: true })
        .limit(12);
      if (error) {
        if ((error as any).code === "42P01") return [];
        throw error;
      }

      const userIds = [...new Set((snapshot || []).map((r: any) => r.user_id).filter(Boolean))] as string[];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (profilesError) throw profilesError;

      const nameById = new Map((profiles || []).map((p: any) => [p.id, p.name as string]));
      return (snapshot || []).map((r: any) => ({
        id: r.user_id,
        name: nameById.get(r.user_id) || "Unknown",
        rank: r.rank,
        matches_played: r.matches_played,
        wins: r.wins,
        losses: r.losses,
      }));
    },
    enabled: !!viewingId && !!viewingSeason,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Seasons" subtitle="Quarterly competitions & awards" />

      {/* Season selector */}
      {seasons && seasons.length > 0 ? (
        <div className="px-4 sm:px-6 lg:px-[5%] mt-3 space-y-4 pb-6">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {(seasons || []).map((season: any) => (
              <button
                key={season.id}
                onClick={() => setSelectedSeasonId(season.id)}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-full text-xs font-medium transition-all border",
                  viewingId === season.id
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "bg-card border-border/50 hover:bg-secondary"
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="truncate max-w-[180px]">{season.name}</span>
                  {season.is_active ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-accent/20 text-accent-foreground border border-accent/20">
                      Live
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground border border-border/40">
                      Archive
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* Season spotlight */}
          {viewingId && (() => {
            const season = (seasons || []).find((s: any) => s.id === viewingId);
            if (!season) return null;
            return (
              <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-background to-accent/10">
                <div className="h-1 bg-gradient-to-r from-primary via-accent to-transparent" />
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold font-heading truncate">{season.name}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {season.starts_on} → {season.ends_on || "—"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] border",
                            season.is_active
                              ? "bg-accent/15 text-accent-foreground border-accent/20"
                              : season.ends_on
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-muted text-muted-foreground border-border/40"
                          )}
                        >
                          {season.is_active ? "Live" : season.ends_on ? "Completed" : "Ended"}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] bg-background/70 border border-border/60">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Users className="w-3 h-3 opacity-70" />
                            {membershipCount ?? 0} joined
                          </span>
                        </Badge>
                      </div>
                    </div>

                    {season.is_active ? (
                      <div className="flex flex-col sm:items-end gap-2">
                        <p className="text-xs text-muted-foreground sm:text-right max-w-[340px]">
                          Join to take part in season socials and competitions.
                        </p>
                        {joinedActiveSeason ? (
                          <Badge variant="secondary" className="text-[10px] bg-accent/15 text-accent-foreground border border-accent/20">
                            Joined
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="h-9 text-xs"
                            onClick={() => joinSeason.mutate()}
                            disabled={joinSeason.isPending}
                          >
                            {joinSeason.isPending ? "Joining…" : "Join season"}
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.65fr] gap-4">
            {/* Season overview + matches */}
            {viewingSeason ? (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold font-heading">Season overview</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Competitive matches only (friendly games excluded).
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {viewingSeason.is_active ? "Live" : "Archive"}
                    </Badge>
                  </div>

                  {seasonMatchesError ? (
                    <div className="mt-3 rounded-md border p-3 text-sm text-muted-foreground flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <p className="min-w-0">Could not load season matches. {String((seasonMatchesError as any)?.message || "")}</p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Swords className="w-4 h-4 text-primary" />
                            <p className="text-[10px] uppercase tracking-wide text-foreground/70">Matches</p>
                          </div>
                          <p className="text-sm font-semibold mt-1 tabular-nums">
                            {seasonMatchesLoading ? "…" : (seasonMatches?.totalMatches ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-accent-foreground" />
                            <p className="text-[10px] uppercase tracking-wide text-foreground/70">Confirmed</p>
                          </div>
                          <p className="text-sm font-semibold mt-1 tabular-nums">
                            {seasonMatchesLoading ? "…" : (seasonMatches?.confirmedMatches ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                            <p className="text-[10px] uppercase tracking-wide text-foreground/70">Disputes</p>
                          </div>
                          <p className="text-sm font-semibold mt-1 tabular-nums">
                            {seasonMatchesLoading ? "…" : (seasonMatches?.disputedMatches ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <p className="text-[10px] uppercase tracking-wide text-foreground/70">Players</p>
                          </div>
                          <p className="text-sm font-semibold mt-1 tabular-nums">
                            {seasonMatchesLoading ? "…" : (seasonMatches?.uniquePlayers ?? 0)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur p-3 shadow-sm sm:col-span-1 col-span-2">
                          <p className="text-[10px] uppercase tracking-wide text-foreground/70">Total minutes</p>
                          <p className="text-sm font-semibold mt-1 tabular-nums">
                            {seasonMatchesLoading ? "…" : (seasonMatches?.totalMinutes != null ? `${seasonMatches.totalMinutes}m` : "—")}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold font-heading uppercase tracking-wider text-muted-foreground">
                            Matches
                          </p>
                          {(seasonMatches?.rows?.length || 0) > 6 ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-[11px]"
                              onClick={() => setShowAllSeasonMatches((v) => !v)}
                            >
                              {showAllSeasonMatches ? "Show less" : `Show all (${seasonMatches?.rows?.length || 0})`}
                            </Button>
                          ) : null}
                        </div>

                        {seasonMatchesLoading ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          </div>
                        ) : (seasonMatches?.rows || []).length === 0 ? (
                          <Card className="mt-2 p-4 text-sm text-muted-foreground">
                            No competitive matches recorded in this season yet.
                          </Card>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {(showAllSeasonMatches ? (seasonMatches?.rows || []) : (seasonMatches?.rows || []).slice(0, 6)).map((m: any) => (
                              <div key={m.id} className="rounded-xl border border-border/70 bg-background/60 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {m.player_a_name} vs {m.player_b_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {m.match_date} · Court {m.court_id || "—"}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="text-sm font-semibold tabular-nums">{m.score || "—"}</p>
                                    <div className="mt-1 flex items-center justify-end gap-1">
                                      {!m.confirmed ? (
                                        <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground border-0">
                                          Unconfirmed
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-[10px] bg-accent/15 text-accent-foreground border border-accent/20">
                                          Confirmed
                                        </Badge>
                                      )}
                                      {m.disputed ? (
                                        <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20">
                                          Disputed
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <div className="space-y-4">
              {/* Standings snapshot */}
              {viewingSeason ? (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold font-heading">
                          {viewingSeason.is_active ? "Current ladder" : "Final standings"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {viewingSeason.is_active
                            ? "Top ranked players right now."
                            : "Snapshot saved when the season ended."}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">Top 12</Badge>
                    </div>

                    {standingsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : (standings || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-3">
                        {viewingSeason.is_active ? "No ranked players yet." : "No standings snapshot found for this season."}
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {(standings || []).map((p: any, idx: number) => (
                          <div
                            key={p.id}
                            className={cn(
                              "rounded-xl border p-3 flex items-center justify-between gap-3",
                              idx === 0 && "border-primary/25 bg-primary/5"
                            )}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                <span className="tabular-nums text-muted-foreground mr-2">#{p.rank}</span>
                                {p.name || "Player"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {p.matches_played || 0} played · {p.wins || 0}W {p.losses || 0}L
                              </p>
                            </div>
                            <Badge variant="secondary" className="text-[10px] shrink-0 tabular-nums">
                              {p.wins || 0}-{p.losses || 0}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {/* Awards */}
              {awardsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : awards && awards.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold font-heading uppercase tracking-wider text-muted-foreground">Awards</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                    {awards.map((award: any, i: number) => {
                      const Icon = AWARD_ICONS[award.award_type] || AWARD_ICONS.default;
                      const colorClass = AWARD_COLORS[award.award_type] || AWARD_COLORS.runner_up;
                      return (
                        <motion.div
                          key={award.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <Card className="h-full">
                            <CardContent className="p-3 flex items-center gap-3">
                              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", colorClass)}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{award.award_label}</p>
                                <p className="text-[10px] text-muted-foreground capitalize">{award.award_type.replace(/_/g, " ")}</p>
                              </div>
                              {award.stat_value ? (
                                <Badge variant="secondary" className="text-[10px] shrink-0 tabular-nums">{award.stat_value}</Badge>
                              ) : null}
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Card className="p-6 text-center">
                  <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">No awards yet for this season.</p>
                  <p className="text-xs text-muted-foreground">Awards are given at the end of each quarter.</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 mt-8 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">No seasons created yet.</p>
          <p className="text-xs text-muted-foreground">The club admin will set up quarterly seasons.</p>
        </div>
      )}
    </div>
  );
}
