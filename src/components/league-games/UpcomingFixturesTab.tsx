import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Star, Trophy, Pencil, UserCheck, CalendarIcon, Wifi, Check, X } from "lucide-react";
import { format, parseISO, addDays, startOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useMemberContext } from "@/contexts/MemberContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { useNsaFixtures, type NsaFixture } from "@/hooks/use-nsa";
import { toast } from "sonner";

type Props = {
  platformAssocIds: string[];
  clubTeamCodes: string[];
  myTeamCodes: Set<string>;
  /** Optional map of team code -> custom team/league display name (e.g. "Cobras"). */
  teamNameByCode?: Record<string, string>;
  /** Start of the configured squash week (yyyy-MM-dd). Falls back to today. */
  weekStart?: string;
  /** End of the squash week window (yyyy-MM-dd). Falls back to weekStart + 6 days, or today + 14 days. */
  weekEnd?: string;
  /** 'internal' associations have no platform fixture feed — show a tailored empty state. */
  associationScope?: "internal" | "region";
  /** Used to surface tournament fixtures linked to leagues in this club. */
  clubId?: string;
  /** Filters tournament fixtures to leagues belonging to this association. */
  associationId?: string;
  /** External source on this association ("nsa") — triggers live API merge. */
  externalSource?: string | null;
  /** External system's club ID (e.g. "6" for CSIR on NSA). */
  externalClubId?: string | null;
  /** Day-of-week (0=Sun..6=Sat) the squash week starts on, for availability week computation. */
  weekStartDow?: number;
};

export function UpcomingFixturesTab({ platformAssocIds, clubTeamCodes, myTeamCodes, teamNameByCode, weekStart, weekEnd, associationScope = "region", clubId, associationId, externalSource, externalClubId, weekStartDow }: Props) {
  const { activeMember } = useMemberContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  type RangeMode = "this-week" | "next-week" | "next-two-weeks" | "custom";
  const [rangeMode, setRangeMode] = useState<RangeMode>("this-week");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);

  const defaultStart = weekStart ?? format(new Date(), "yyyy-MM-dd");
  const defaultEnd = weekEnd ?? format(addDays(weekStart ? parseISO(weekStart) : new Date(), weekStart ? 6 : 14), "yyyy-MM-dd");

  const { rangeStart, rangeEnd } = useMemo(() => {
    const baseStart = weekStart ? parseISO(weekStart) : new Date();
    if (rangeMode === "this-week") {
      return { rangeStart: defaultStart, rangeEnd: defaultEnd };
    }
    if (rangeMode === "next-week") {
      const start = addDays(baseStart, 7);
      const end = addDays(start, 6);
      return { rangeStart: format(start, "yyyy-MM-dd"), rangeEnd: format(end, "yyyy-MM-dd") };
    }
    if (rangeMode === "next-two-weeks") {
      const end = addDays(baseStart, 13);
      return { rangeStart: defaultStart, rangeEnd: format(end, "yyyy-MM-dd") };
    }
    // custom
    if (customRange?.from) {
      const start = customRange.from;
      const end = customRange.to ?? customRange.from;
      return { rangeStart: format(start, "yyyy-MM-dd"), rangeEnd: format(end, "yyyy-MM-dd") };
    }
    return { rangeStart: defaultStart, rangeEnd: defaultEnd };
  }, [rangeMode, customRange, weekStart, defaultStart, defaultEnd]);

  // Derive club code prefixes (alpha part) from registered team codes, e.g. "CSI001" -> "CSI"
  const clubPrefixes = useMemo(() => {
    const prefixes = new Set<string>();
    for (const code of clubTeamCodes) {
      const m = code.match(/^([A-Za-z]+)/);
      if (m) prefixes.add(m[1].toUpperCase());
    }
    return [...prefixes];
  }, [clubTeamCodes]);

  const { data: fixtures, isLoading } = useQuery({
    queryKey: ["upcoming-league-fixtures", rangeStart, rangeEnd, platformAssocIds.join(","), clubPrefixes.join(",")],
    queryFn: async () => {
      if (platformAssocIds.length === 0 || clubPrefixes.length === 0) return [];
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .in("association_id", platformAssocIds)
        .gte("fixture_date", rangeStart)
        .lte("fixture_date", rangeEnd)
        .order("fixture_date")
        .order("division");
      if (error) throw error;
      return (data || []).filter((f) => {
        const home = (f.home_team_code || "").toUpperCase();
        const away = (f.away_team_code || "").toUpperCase();
        return clubPrefixes.some((p) => {
          const re = new RegExp(`^${p}\\d+$`);
          return re.test(home) || re.test(away);
        });
      });
    },
    enabled: platformAssocIds.length > 0 && clubPrefixes.length > 0,
  });

  // Fixtures are read from the DB only (synced nightly from NSA via the
  // `nsa-sync-fixtures` edge function + super-admin "Sync from NSA" button).
  // No live API merge — keeps the listing fast, offline-capable, and stable.
  const isNsaLinked = externalSource === "nsa";
  const nsaLoading = false;
  const nsaError: any = null;
  const displayFixtures = (fixtures || []) as any[];

  // Only the snapshot fixtures (with real UUIDs) get result/lineup lookups
  const fixtureIds = useMemo(
    () => (displayFixtures as any[]).filter((f) => !f._isLive || f._hasSnapshot).map((f) => f.id),
    [displayFixtures]
  );
  const { data: existingResults } = useQuery({
    queryKey: ["league-fixture-results", fixtureIds.join(",")],
    queryFn: async () => {
      if (fixtureIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_fixture_results" as any)
        .select("fixture_id, status, home_total_points, away_total_points, winner")
        .in("fixture_id", fixtureIds);
      if (error) throw error;
      return data || [];
    },
    enabled: fixtureIds.length > 0,
  });

  const resultMap = useMemo(() => {
    const map = new Map<string, { status: string; homePoints: number; awayPoints: number; winner: string | null }>();
    for (const r of (existingResults || []) as any[]) {
      map.set(r.fixture_id, {
        status: r.status,
        homePoints: r.home_total_points ?? 0,
        awayPoints: r.away_total_points ?? 0,
        winner: r.winner,
      });
    }
    return map;
  }, [existingResults]);

  // Find which fixtures I'm assigned to play in (lineup)
  const { data: myLineupRows } = useQuery({
    queryKey: ["my-fixture-lineups", activeMember?.id, fixtureIds.join(",")],
    queryFn: async () => {
      if (!activeMember?.id || fixtureIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_fixture_lineups")
        .select("fixture_id")
        .eq("club_member_id", activeMember.id)
        .in("fixture_id", fixtureIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeMember?.id && fixtureIds.length > 0,
  });

  const myLineupFixtureIds = useMemo(() => {
    return new Set((myLineupRows || []).map((r: any) => r.fixture_id as string));
  }, [myLineupRows]);

  // ---------- Availability (per squash week) ----------
  const dow = (typeof weekStartDow === "number" ? weekStartDow : 3); // default Wed
  const fixtureWeekStart = (fixtureDate: string): string =>
    format(startOfWeek(parseISO(fixtureDate), { weekStartsOn: dow as any }), "yyyy-MM-dd");

  const fixtureWeeks = useMemo(() => {
    const set = new Set<string>();
    for (const f of (displayFixtures || []) as any[]) {
      if (f?.fixture_date) set.add(fixtureWeekStart(f.fixture_date));
    }
    return [...set];
  }, [displayFixtures, dow]);

  const { data: availRows = [] } = useQuery<{ week_start_date: string }[]>({
    queryKey: ["my-lwa", clubId, activeMember?.id, fixtureWeeks.join(",")],
    enabled: !!clubId && !!activeMember?.id && fixtureWeeks.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("league_week_availability")
        .select("week_start_date")
        .eq("club_id", clubId)
        .eq("club_member_id", activeMember!.id)
        .in("week_start_date", fixtureWeeks);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: unavailRows = [] } = useQuery<{ week_start_date: string }[]>({
    queryKey: ["my-lwu", clubId, activeMember?.id, fixtureWeeks.join(",")],
    enabled: !!clubId && !!activeMember?.id && fixtureWeeks.length > 0,
    queryFn: async () => {
      const { data, error } = await fromExt("league_week_unavailability")
        .select("week_start_date")
        .eq("club_id", clubId)
        .eq("club_member_id", activeMember!.id)
        .in("week_start_date", fixtureWeeks);
      if (error) throw error;
      return data || [];
    },
  });

  const availableWeeks = useMemo(() => new Set(availRows.map((r) => r.week_start_date)), [availRows]);
  const unavailableWeeks = useMemo(() => new Set(unavailRows.map((r) => r.week_start_date)), [unavailRows]);

  const respondAvailability = useMutation({
    mutationFn: async ({ weekStartDate, response }: { weekStartDate: string; response: "available" | "unavailable" }) => {
      if (!activeMember?.id) throw new Error("Not signed in as a club member");
      const { error } = await supabase.rpc("respond_league_week_availability" as any, {
        _club_member_id: activeMember.id,
        _week_start_date: weekStartDate,
        _response: response,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["my-lwa", clubId, activeMember?.id] });
      qc.invalidateQueries({ queryKey: ["my-lwu", clubId, activeMember?.id] });
      qc.invalidateQueries({ queryKey: ["lwa", clubId] });
      qc.invalidateQueries({ queryKey: ["lwu", clubId] });
      toast.success(vars.response === "available" ? "Marked available" : "Marked unavailable");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to update availability"),
  });

  // NOTE: Tournament/championship matches intentionally excluded here — they live on the dedicated /tournaments page.

  const fixturesByDate = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const f of (displayFixtures || []) as any[]) {
      const date = f.fixture_date;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(f);
    }
    return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [displayFixtures]);

  const isMyFixture = (f: any) => myTeamCodes.has(f.home_team_code) || myTeamCodes.has(f.away_team_code);
  const isInLineup = (f: any) => myLineupFixtureIds.has(f.id);

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <Select value={rangeMode} onValueChange={(v) => setRangeMode(v as RangeMode)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="this-week">This week</SelectItem>
          <SelectItem value="next-week">Next week</SelectItem>
          <SelectItem value="next-two-weeks">Next two weeks</SelectItem>
          <SelectItem value="custom">Custom date range</SelectItem>
        </SelectContent>
      </Select>
      {rangeMode === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("justify-start text-left font-normal min-w-[240px]", !customRange?.from && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {customRange?.from ? (
                customRange.to ? (
                  <>
                    {format(customRange.from, "dd MMM")} – {format(customRange.to, "dd MMM yyyy")}
                  </>
                ) : (
                  format(customRange.from, "dd MMM yyyy")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={setCustomRange}
              numberOfMonths={2}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      )}
      {isNsaLinked && (
        <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-muted-foreground">
          <Wifi className="w-3 h-3" />
          Synced from NSA
        </Badge>
      )}
      <span className="text-xs text-muted-foreground ml-auto">
        Showing {format(parseISO(rangeStart), "dd MMM")} – {format(parseISO(rangeEnd), "dd MMM yyyy")}
      </span>
    </div>
  );

  if (isLoading || (isNsaLive && nsaLoading && (!nsaFixtures || nsaFixtures.length === 0))) {
    return (
      <div>
        {filterBar}
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (fixturesByDate.size === 0) {
    if (associationScope === "internal") {
      return (
        <div>
          {filterBar}
          <Card className="p-8 text-center">
            <Trophy className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              Internal league — fixtures aren't auto-imported from a regional feed.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Use <span className="font-medium text-foreground">Fill Up Leagues</span> to assign players each week, then capture results from the scoring screen.
            </p>
          </Card>
        </div>
      );
    }
    return (
      <div>
        {filterBar}
        <Card className="p-8 text-center">
          <Trophy className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No league fixtures between{" "}
            <span className="font-medium text-foreground">{format(parseISO(rangeStart), "dd MMM")}</span> –{" "}
            <span className="font-medium text-foreground">{format(parseISO(rangeEnd), "dd MMM")}</span>.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {filterBar}
      {[...fixturesByDate.entries()].map(([date, dayFixtures]) => (
        <div key={date}>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">
            {format(parseISO(date), "EEEE, dd MMMM yyyy")}
          </h2>
          <div className="space-y-2">
            {(dayFixtures || []).map((f) => {
              const mine = isMyFixture(f);
              const inLineup = isInLineup(f);
              const result = resultMap.get(f.id);
              const fxWeek = f?.fixture_date ? fixtureWeekStart(f.fixture_date) : null;
              const isAvailable = !!(fxWeek && availableWeeks.has(fxWeek));
              const isUnavailable = !!(fxWeek && unavailableWeeks.has(fxWeek));
              const showAvailability =
                !!activeMember?.id &&
                !!clubId &&
                mine &&
                !inLineup &&
                !(result && (result.status === "submitted" || result.status === "confirmed"));
              return (
                <Card
                  key={f.id}
                  className={`p-3 ${
                    inLineup
                      ? "border-2 border-primary border-l-[6px] bg-primary/20 dark:bg-primary/25 shadow-lg ring-1 ring-primary/40 backdrop-blur-sm"
                      : mine
                      ? "border border-primary/60 border-l-[6px] bg-card shadow-md ring-1 ring-primary/25"
                      : "bg-card/80 backdrop-blur-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1 mb-1">
                        {inLineup && (
                          <Badge className="bg-primary text-primary-foreground text-[10px]">
                            <UserCheck className="w-3 h-3 mr-1" /> You're playing
                          </Badge>
                        )}
                        {!inLineup && mine && (
                          <Badge className="bg-primary/15 text-primary text-[10px]">
                            <Star className="w-3 h-3 mr-1" /> Your League
                          </Badge>
                        )}
                        {(mine || inLineup) && isAvailable && (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 border border-emerald-500/40">
                            <Check className="w-3 h-3 mr-1" /> Available
                          </Badge>
                        )}
                        {(mine || inLineup) && isUnavailable && (
                          <Badge variant="destructive" className="text-[10px]">
                            <X className="w-3 h-3 mr-1" /> Not available
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold flex flex-col leading-tight">
                          <span>{f.home_team_code}</span>
                          {teamNameByCode?.[(f.home_team_code || "").toUpperCase()] && (
                            <span className="text-[11px] font-medium text-primary">{teamNameByCode[(f.home_team_code || "").toUpperCase()]}</span>
                          )}
                        </span>
                        {result && (result.status === "submitted" || result.status === "confirmed") ? (
                          <>
                            <span className="font-bold text-primary">{result.homePoints}</span>
                            <span className="text-muted-foreground text-xs">-</span>
                            <span className="font-bold text-primary">{result.awayPoints}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">vs</span>
                        )}
                        <span className="font-bold flex flex-col leading-tight">
                          <span>{f.away_team_code}</span>
                          {teamNameByCode?.[(f.away_team_code || "").toUpperCase()] && (
                            <span className="text-[11px] font-medium text-primary">{teamNameByCode[(f.away_team_code || "").toUpperCase()]}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {f.venue_name}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{f.division}</Badge>
                        {result?.status === "submitted" && <Badge variant="secondary" className="text-[10px]">Scored</Badge>}
                        {result?.status === "confirmed" && <Badge className="bg-green-500/15 text-green-700 text-[10px]">Confirmed</Badge>}
                        {f._isLive && !f._hasSnapshot && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700">Not yet imported</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={inLineup || mine ? "default" : "outline"}
                      className="shrink-0"
                      disabled={f._isLive && !f._hasSnapshot}
                      title={f._isLive && !f._hasSnapshot ? "This fixture isn't in our database yet — import the latest snapshot to enable scoring." : undefined}
                      onClick={() => navigate(f.isTournament ? `/club-champs/${f.champId}` : `/league-games/${f.id}`)}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      {f.isTournament ? "Tournament" : "Set up & Score"}
                    </Button>
                  </div>
                  {showAvailability && fxWeek && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Are you available this squash week?
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={isAvailable ? "default" : "outline"}
                        className={cn(
                          "h-7 px-2 text-[11px] gap-1",
                          isAvailable && "bg-emerald-600 hover:bg-emerald-600/90 text-white border-transparent",
                        )}
                        disabled={respondAvailability.isPending}
                        onClick={() => respondAvailability.mutate({ weekStartDate: fxWeek, response: "available" })}
                      >
                        <Check className="w-3 h-3" /> Available
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={isUnavailable ? "destructive" : "outline"}
                        className="h-7 px-2 text-[11px] gap-1"
                        disabled={respondAvailability.isPending}
                        onClick={() => respondAvailability.mutate({ weekStartDate: fxWeek, response: "unavailable" })}
                      >
                        <X className="w-3 h-3" /> Not available
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
