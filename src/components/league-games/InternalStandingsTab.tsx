import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, RefreshCw, Pencil, Eye, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useIsClubAdmin, useIsSuperAdmin } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TeamLogo } from "./TeamLogo";
import { rankTint } from "@/lib/rank-tint";
import { useLeagueSeasons } from "@/hooks/use-league-seasons";
import { pickSeasonScoped, seasonLabel } from "@/lib/leagues/seasons";
import {
  buildTierStandings,
  deriveTiers,
  inSeason,
  tierOfFixture,
  type StandingsResult,
  type StandingsRound,
  type Tier,
} from "@/lib/leagues/team-standings";
import { activeSeasonPenalties, applyTeamPenalties } from "@/lib/leagues/team-penalties";
import { useTeamPenalties } from "@/hooks/use-league-penalties";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";


type ClubLeague = {
  id: string;
  code: string | null;
  name: string;
  association_id: string | null;
  nsa_team_code: string | null;
};

type Props = {
  clubId: string;
  associationId: string;
  clubLeagues: ClubLeague[];
  myLeagueCode?: string | null;
};

type FixtureRow = {
  id: string;
  fixture_date: string;
  division: string;
  home_team_code: string | null;
  away_team_code: string | null;
  status: string | null;
  round_id: string | null;
  season_id?: string | null;
};

const CURRENT_YEAR = new Date().getFullYear();

export function InternalStandingsTab({ clubId, associationId, clubLeagues, myLeagueCode }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isClubAdmin = useIsClubAdmin();
  const isSuperAdmin = useIsSuperAdmin();
  const { activeMember } = useMemberContext();

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isAdmin = isClubAdmin || isSuperAdmin;
  const canEditCell = (_teamCode: string, dateStr: string) => {
    if (dateStr > todayStr) return false;
    return isAdmin;
  };

  // Resolve the platform association id (fixtures live under platform_association_id,
  // not the tenant league_associations.id)
  const { data: platformAssocId } = useQuery({
    queryKey: ["league-assoc-platform-id", associationId],
    enabled: !!associationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("league_associations")
        .select("platform_association_id")
        .eq("id", associationId)
        .maybeSingle();
      if (error) throw error;
      return (data?.platform_association_id as string | null) ?? associationId;
    },
  });

  // Season context (Phase 3): the season, not the calendar year, scopes reads.
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const { seasons, currentSeason, currentSeasonId } = useLeagueSeasons({
    associationId,
    selectedSeasonId,
  });
  const seasonYear = String(currentSeason?.season_year ?? CURRENT_YEAR);
  const seasonId = currentSeasonId;
  const hasSeasons = seasons.length > 0;

  const seasonWindow = useMemo(
    () => ({
      id: seasonId,
      season_year: Number(seasonYear),
      starts_on: currentSeason?.starts_on ?? null,
      ends_on: currentSeason?.ends_on ?? null,
    }),
    [seasonId, seasonYear, currentSeason?.starts_on, currentSeason?.ends_on],
  );

  // Fixtures are the source of truth: every fixture of this league in the
  // selected season (linked by season_id, or unlinked and dated in the season).
  // Rounds only label/group them, so a missing or unlinked round never hides
  // a completed result.
  const { data: seasonData } = useQuery({
    queryKey: ["internal-standings-season", associationId, platformAssocId, seasonId, seasonYear],
    enabled: !!associationId && !!platformAssocId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const [{ data: rounds, error: rErr }, { data: fixtures, error: fErr }] = await Promise.all([
        supabase
          .from("league_rounds")
          .select("id, name, round_number, round_date, season_id")
          .eq("association_id", associationId)
          .order("round_number", { ascending: true }),
        (() => {
          // Scope server-side to the selected season (mirrors inSeason): rows
          // linked to this season, or unlinked rows dated inside the season
          // window. Without this the request returns the association's entire
          // history, and PostgREST's 1000-row cap silently drops the newest
          // fixtures once the history grows past it.
          const from = seasonWindow.starts_on || `${seasonWindow.season_year}-01-01`;
          const to = seasonWindow.ends_on || `${seasonWindow.season_year}-12-31`;
          const dated = `and(season_id.is.null,fixture_date.gte.${from},fixture_date.lte.${to})`;
          const scope = seasonWindow.id ? `season_id.eq.${seasonWindow.id},${dated}` : dated;
          return supabase
            .from("platform_league_fixtures")
            .select(
              "id, fixture_date, division, home_team_code, away_team_code, home_team_name_snapshot, away_team_name_snapshot, status, round_id, season_id",
            )
            .eq("association_id", platformAssocId!)
            .or(scope)
            .order("fixture_date", { ascending: true });
        })(),
      ]);
      if (rErr) throw rErr;
      if (fErr) throw fErr;
      const scoped = ((fixtures || []) as any[]).filter((f) =>
        inSeason({ season_id: f.season_id, date: f.fixture_date }, seasonWindow),
      );
      return {
        fixtures: scoped as FixtureRow[],
        tiers: deriveTiers((rounds || []) as StandingsRound[], scoped, seasonWindow),
      };
    },
  });
  const tiers: Tier[] = seasonData?.tiers ?? [];
  // Team penalties deduct from season standings only (never fixture scores).
  const { data: allPenalties = [] } = useTeamPenalties(associationId);
  const seasonPenalties = useMemo(() => activeSeasonPenalties(allPenalties, seasonWindow), [allPenalties, seasonWindow]);

  // Map team_code -> { name, logo_url }, scoped to the selected season so a
  // future season's team cannot relabel historical standings rows.
  const { data: teamInfoByCode } = useQuery({
    queryKey: ["team-logos-by-code", associationId, seasonId],
    enabled: !!associationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("code, name, logo_url, season_id")
        .eq("association_id", associationId);
      if (error) throw error;
      const map = new Map<string, { name: string; logo_url: string | null }>();
      pickSeasonScoped((data || []) as any[], seasonId).forEach((l: any) => {
        if (l.code) map.set(l.code, { name: l.name || l.code, logo_url: l.logo_url || null });
      });
      return map;
    },
  });


  // Selection: a tier label or "ALL" — persisted in URL
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTier = searchParams.get("tier");
  const [selection, setSelection] = useState<string>(urlTier || "");
  useEffect(() => {
    // Reset when the selected group doesn't exist in this league/season
    // (e.g. after switching league tabs or seasons).
    if (tiers.length > 0 && selection !== "ALL" && !tiers.some((t) => t.tier === selection)) {
      setSelection(tiers[0].tier);
    }
  }, [tiers, selection]);

  const handleSelectTier = (val: string) => {
    setSelection(val);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val && val !== (tiers[0]?.tier || "")) next.set("tier", val);
      else next.delete("tier");
      return next;
    }, { replace: true });
  };

  const isAllMode = selection === "ALL";
  const tiersToShow = useMemo(
    () => (isAllMode ? tiers : tiers.filter((t) => t.tier === selection)),
    [tiers, selection, isAllMode]
  );

  // Fetch results for the selected tier(s)
  const { data: standings, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["internal-standings", platformAssocId, seasonId, seasonYear, selection, tiers.map((t) => t.tier).join("|")],
    enabled: !!seasonData && tiersToShow.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const fixtures = (seasonData?.fixtures || []).filter((f) =>
        tiersToShow.some((t) => t.tier === tierOfFixture(f, tiers)),
      );
      const fixtureIds = fixtures.map((f) => f.id);
      let results: StandingsResult[] = [];
      for (let i = 0; i < fixtureIds.length; i += 200) {
        const { data: res, error: resErr } = await supabase
          .from("league_fixture_results" as any)
          .select("fixture_id, home_total_points, away_total_points, status")
          .in("fixture_id", fixtureIds.slice(i, i + 200));
        if (resErr) throw resErr;
        results = results.concat((res || []) as any);
      }
      const out = tiersToShow.map((t) => ({
        tier: t.tier,
        ...buildTierStandings(fixtures.filter((f) => tierOfFixture(f, tiers) === t.tier), results),
      }));

      // Historical name snapshots taken when the fixture was created — these win
      // over the current team name so past seasons never get relabelled.
      const snapshots = new Map<string, string>();
      (fixtures || []).forEach((f: any) => {
        if (f.home_team_code && f.home_team_name_snapshot) {
          snapshots.set(f.home_team_code, f.home_team_name_snapshot);
        }
        if (f.away_team_code && f.away_team_name_snapshot) {
          snapshots.set(f.away_team_code, f.away_team_name_snapshot);
        }
      });

      return { tiers: out, snapshots };
    },
  });

  const data = standings?.tiers;
  const snapshotNameByCode = standings?.snapshots;
  const teamNameFor = (code: string) =>
    snapshotNameByCode?.get(code) || teamInfoByCode?.get(code)?.name || code;


  // Realtime: refresh standings whenever results / fixtures change
  useEffect(() => {
    if (!associationId) return;
    const ch = supabase
      .channel(`internal-standings:${associationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_fixture_results" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["internal-standings", platformAssocId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "platform_league_fixtures",
          filter: platformAssocId
            ? `association_id=eq.${platformAssocId}`
            : `association_id=eq.${associationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["internal-standings", platformAssocId] });
          queryClient.invalidateQueries({ queryKey: ["internal-standings-season", associationId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [associationId, platformAssocId, queryClient]);

  if (tiers.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">
          No league fixtures scheduled for {seasonYear} yet.
        </p>
      </Card>
    );
  }

  const myCodes = new Set(clubLeagues.map((l) => l.code).filter((c): c is string => !!c));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selection} onValueChange={handleSelectTier}>
          <SelectTrigger className="h-8 w-[260px] text-xs">
            <SelectValue placeholder="Select league" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Leagues (stacked)</SelectItem>
            <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground tracking-wide">
              Leagues
            </div>
            {tiers.map((t) => (
              <SelectItem key={t.tier} value={t.tier}>
                {t.tier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasSeasons ? (
          <Select
            value={currentSeasonId ?? undefined}
            onValueChange={(v) => setSelectedSeasonId(v)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {seasonLabel(s)}
                  {s.is_current ? " · current" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="h-8 inline-flex items-center rounded border px-2 text-xs text-muted-foreground">
            {seasonYear}
          </span>
        )}


        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 text-xs"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <span className="text-[11px] text-muted-foreground ml-auto">
          Live · auto-updates as captains publish results
        </span>
      </div>

      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <MousePointerClick className="w-3.5 h-3.5 text-primary shrink-0" />
        <span>
          Tap any score cell <span className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded bg-background border"><Eye className="w-3 h-3 text-primary/70" /></span>
          to open the scoreboard. Captains and admins see <Pencil className="inline w-3 h-3 mx-1 opacity-60" /> to edit.
        </span>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!isLoading &&
        (data || []).map(({ tier, weeks, rows: rawRows }) => {
          const rows = applyTeamPenalties(rawRows, seasonPenalties);
          const anyPen = rows.some((r) => r.penalty > 0);
          const mineHere = rows.some((r) => myCodes.has(r.team_code));
          return (
            <div key={tier}>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {tier}
                {mineHere && <Badge className="text-[10px]">My League</Badge>}
              </h2>

              {rows.length === 0 ? (
                <Card className="p-4 text-xs text-muted-foreground">
                  No teams have played in this league yet.
                </Card>
              ) : (
                <Card className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-center">#</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead className="text-center w-14 font-bold">Total</TableHead>
                        {anyPen && <TableHead className="text-center w-12" title="Penalty points deducted">Pen</TableHead>}
                        <TableHead className="text-center w-12">P</TableHead>
                        <TableHead className="text-center w-14" title="Average points per game played">Avg</TableHead>
                        {weeks.map((d) => (
                          <TableHead
                            key={d}
                            className="text-center text-[10px] whitespace-nowrap min-w-[56px]"
                          >
                            {format(new Date(d), "d MMM")}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((s, i) => {
                        const mine = myCodes.has(s.team_code);
                        return (
                          <TableRow
                            key={s.team_code}
                            className={mine ? "font-medium ring-1 ring-primary/40" : ""}
                            style={rankTint(i, rows.length)}
                          >
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {i + 1}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-2">
                                <TeamLogo
                                  logoUrl={teamInfoByCode?.get(s.team_code)?.logo_url}
                                  name={teamNameFor(s.team_code)}
                                  size={22}
                                />
                                <span className="font-medium">
                                  {teamNameFor(s.team_code)}

                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {s.team_code}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-bold">
                              {s.penalty > 0 ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button type="button" className="inline-flex items-center gap-0.5 underline decoration-dotted"
                                      aria-label={`${s.adjusted} points after ${s.penalty} penalty points deducted from ${s.total}. Show penalty details`}>
                                      {s.adjusted}<span className="text-destructive" aria-hidden>*</span>
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 text-xs space-y-2">
                                    <div className="font-semibold">{s.total} earned − {s.penalty} penalty = {s.adjusted}</div>
                                    {s.penalties.map((p) => (
                                      <div key={p.id} className="border-t pt-1">
                                        <div><span className="text-destructive font-semibold">−{p.points}</span> {p.rule_name}</div>
                                        <div className="text-muted-foreground">
                                          {format(new Date(p.effective_date), "d MMM yyyy")} · {p.fixture_id ? "Fixture penalty" : "Season penalty"}
                                        </div>
                                        {p.reason && <div>{p.reason}</div>}
                                        {p.fixture_id && (
                                          <button type="button" className="text-primary underline" onClick={() => navigate(`/league-games/${p.fixture_id}`)}>View fixture</button>
                                        )}
                                      </div>
                                    ))}
                                  </PopoverContent>
                                </Popover>
                              ) : s.total}
                            </TableCell>
                            {anyPen && (
                              <TableCell className="text-center text-xs font-semibold text-destructive">
                                {s.penalty > 0 ? `−${s.penalty}` : ""}
                              </TableCell>
                            )}
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {s.played}
                            </TableCell>
                            <TableCell className="text-center text-xs font-medium">
                              {s.played > 0 ? (s.total / s.played).toFixed(1) : "—"}
                            </TableCell>
                            {s.weeks.map((w, j) => {
                              if (w.isBye) {
                                return (
                                  <TableCell key={j} className="text-center text-xs p-1 text-muted-foreground/60">
                                    BYE
                                  </TableCell>
                                );
                              }
                              const editable = !!w.fixture_id && canEditCell(s.team_code, w.date);
                              const isPast = w.date <= todayStr;
                              const hasResult = !!w.value;
                              const viewable = !!w.fixture_id && (hasResult || isPast);
                              const clickable = editable || viewable;
                              const missing = !w.value && isPast && !!w.fixture_id;
                              const tip = !w.fixture_id
                                ? "No fixture"
                                : editable
                                ? (w.value ? "Edit results" : "Enter results")
                                : hasResult
                                ? "View scoreboard"
                                : isPast
                                ? "View fixture"
                                : "Future fixture";
                              const cell = (
                                <button
                                  type="button"
                                  disabled={!clickable}
                                  onClick={() => clickable && navigate(`/league-games/${w.fixture_id}`)}
                                  className={`w-full h-full px-1 py-0.5 rounded inline-flex items-center justify-center gap-1 ${
                                    clickable
                                      ? "hover:bg-primary/10 cursor-pointer ring-1 ring-primary/20 hover:ring-primary/60"
                                      : "cursor-default"
                                  } ${missing ? "text-destructive font-semibold" : ""}`}
                                >
                                  {w.value ? (
                                    <span>{w.value}</span>
                                  ) : missing ? (
                                    <span>—</span>
                                  ) : (
                                    <span className="text-muted-foreground/40">·</span>
                                  )}
                                  {editable ? (
                                    <Pencil className="w-3 h-3 opacity-60" />
                                  ) : viewable && hasResult ? (
                                    <Eye className="w-3 h-3 text-primary/70" />
                                  ) : null}
                                </button>
                              );
                              return (
                                <TableCell key={j} className="text-center text-xs p-1">
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>{cell}</TooltipTrigger>
                                      <TooltipContent className="text-[11px]">{tip}</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          );
        })}
    </div>
  );
}
