import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

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
};

type ResultRow = {
  fixture_id: string;
  home_total_points: number | null;
  away_total_points: number | null;
  status: string | null;
};

type StandingRow = {
  team_code: string;
  total: number;
  played: number;
  weeks: Array<{ date: string; value: string; mine?: boolean }>;
};

const CURRENT_YEAR = new Date().getFullYear();

export function InternalStandingsTab({ clubId, associationId, clubLeagues, myLeagueCode }: Props) {
  const queryClient = useQueryClient();

  // Filter to leagues belonging to this association, sorted by code
  const leagueOptions = useMemo(
    () =>
      clubLeagues
        .filter((l) => l.association_id === associationId && !!l.code)
        .sort((a, b) => (a.code || "").localeCompare(b.code || "")),
    [clubLeagues, associationId]
  );

  const myLeague = useMemo(
    () => leagueOptions.find((l) => l.code === myLeagueCode) ?? leagueOptions[0] ?? null,
    [leagueOptions, myLeagueCode]
  );

  const [selection, setSelection] = useState<string>("");
  useEffect(() => {
    if (!selection && myLeague) setSelection(myLeague.id);
  }, [myLeague, selection]);

  const [seasonYear, setSeasonYear] = useState<string>(String(CURRENT_YEAR));
  const isAllMode = selection === "ALL";
  const leaguesToShow = useMemo(() => {
    if (isAllMode) return leagueOptions;
    const one = leagueOptions.find((l) => l.id === selection);
    return one ? [one] : [];
  }, [leagueOptions, selection, isAllMode]);

  const divisionCodes = leaguesToShow.map((l) => l.code!).filter(Boolean);

  // Fetch fixtures + results for the selected division(s)
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["internal-standings", associationId, seasonYear, divisionCodes.join(",")],
    enabled: divisionCodes.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const yearStart = `${seasonYear}-01-01`;
      const yearEnd = `${seasonYear}-12-31`;

      const { data: fixtures, error: fxErr } = await supabase
        .from("platform_league_fixtures")
        .select("id, fixture_date, division, home_team_code, away_team_code, status")
        .eq("association_id", associationId)
        .in("division", divisionCodes)
        .gte("fixture_date", yearStart)
        .lte("fixture_date", yearEnd)
        .order("fixture_date", { ascending: true });
      if (fxErr) throw fxErr;

      const fixtureIds = (fixtures || []).map((f) => f.id);
      let results: ResultRow[] = [];
      if (fixtureIds.length > 0) {
        const { data: res, error: resErr } = await supabase
          .from("league_fixture_results" as any)
          .select("fixture_id, home_total_points, away_total_points, status")
          .in("fixture_id", fixtureIds);
        if (resErr) throw resErr;
        results = (res || []) as any;
      }

      const resByFixture = new Map<string, ResultRow>();
      results.forEach((r) => resByFixture.set(r.fixture_id, r));

      // Group fixtures by division
      const byDivision = new Map<string, FixtureRow[]>();
      (fixtures || []).forEach((f) => {
        const list = byDivision.get(f.division) || [];
        list.push(f as any);
        byDivision.set(f.division, list);
      });

      // Build standings per division
      const out: Array<{ division: string; weeks: string[]; rows: StandingRow[] }> = [];
      for (const code of divisionCodes) {
        const fxs = byDivision.get(code) || [];
        const weekDates = Array.from(new Set(fxs.map((f) => f.fixture_date))).sort();
        const teams = Array.from(
          new Set(
            fxs.flatMap((f) => [f.home_team_code, f.away_team_code]).filter((c): c is string => !!c)
          )
        );
        const rows: StandingRow[] = teams.map((tc) => {
          const weeks = weekDates.map((d) => {
            const fx = fxs.find(
              (f) => f.fixture_date === d && (f.home_team_code === tc || f.away_team_code === tc)
            );
            if (!fx) return { date: d, value: "" };
            const r = resByFixture.get(fx.id);
            if (!r || (r.home_total_points == null && r.away_total_points == null)) {
              return { date: d, value: "" };
            }
            const isHome = fx.home_team_code === tc;
            const own = isHome ? r.home_total_points ?? 0 : r.away_total_points ?? 0;
            const opp = isHome ? r.away_total_points ?? 0 : r.home_total_points ?? 0;
            return { date: d, value: `${own}-${opp}` };
          });
          const total = weeks.reduce((s, w) => {
            if (!w.value) return s;
            const n = parseInt(w.value.split("-")[0], 10);
            return s + (Number.isFinite(n) ? n : 0);
          }, 0);
          const played = weeks.filter((w) => !!w.value).length;
          return { team_code: tc, total, played, weeks };
        });
        rows.sort((a, b) => b.total - a.total || a.team_code.localeCompare(b.team_code));
        out.push({ division: code, weeks: weekDates, rows });
      }
      return out;
    },
  });

  // Realtime: refresh standings whenever results are added/updated for this association
  useEffect(() => {
    if (!associationId) return;
    const ch = supabase
      .channel(`internal-standings:${associationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_fixture_results" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["internal-standings", associationId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_league_fixtures", filter: `association_id=eq.${associationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["internal-standings", associationId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [associationId, queryClient]);

  if (leagueOptions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">
          No internal leagues found yet. Allocate teams in Fill Up Leagues first.
        </p>
      </Card>
    );
  }

  const myCodes = new Set(clubLeagues.map((l) => l.code).filter((c): c is string => !!c));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selection} onValueChange={setSelection}>
          <SelectTrigger className="h-8 w-[260px] text-xs">
            <SelectValue placeholder="Select league" />
          </SelectTrigger>
          <SelectContent>
            {myLeague && (
              <SelectItem value={myLeague.id}>
                ⭐ My League — {myLeague.code}
              </SelectItem>
            )}
            <SelectItem value="ALL">All Internal Leagues (stacked)</SelectItem>
            <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground tracking-wide">All</div>
            {leagueOptions.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.code} {l.name && l.name !== l.code ? `· ${l.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={seasonYear} onValueChange={setSeasonYear}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[String(CURRENT_YEAR), String(CURRENT_YEAR - 1), String(CURRENT_YEAR - 2)].map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!isLoading &&
        (data || []).map(({ division, weeks, rows }) => {
          const league = leagueOptions.find((l) => l.code === division);
          return (
            <div key={division}>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {division}
                {league?.name && league.name !== division && (
                  <span className="font-normal text-xs text-muted-foreground">{league.name}</span>
                )}
                {league?.id === myLeague?.id && <Badge className="text-[10px]">My League</Badge>}
              </h2>

              {rows.length === 0 ? (
                <Card className="p-4 text-xs text-muted-foreground">
                  No teams in this league yet.
                </Card>
              ) : (
                <Card className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-center">#</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead className="text-center w-14 font-bold">Total</TableHead>
                        <TableHead className="text-center w-12">P</TableHead>
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
                            className={mine ? "bg-primary/10 font-medium" : ""}
                          >
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {i + 1}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{s.team_code}</TableCell>
                            <TableCell className="text-center font-bold">{s.total}</TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground">
                              {s.played}
                            </TableCell>
                            {s.weeks.map((w, j) => (
                              <TableCell key={j} className="text-center text-xs">
                                {w.value ? (
                                  w.value
                                ) : (
                                  <span className="text-muted-foreground/40">·</span>
                                )}
                              </TableCell>
                            ))}
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
