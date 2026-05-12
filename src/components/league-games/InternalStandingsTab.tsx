import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, RefreshCw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useIsClubAdmin, useIsSuperAdmin } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  weeks: Array<{ date: string; value: string; fixture_id: string | null; status: string | null }>;
};

const CURRENT_YEAR = new Date().getFullYear();

// Strip " round N" / " week N" suffix to get the tier label, e.g.
// "1st League round 1" -> "1st League"
function tierFromRoundName(name: string): string {
  return name
    .replace(/\s+(round|week|wk|rd)\s*\d+\s*$/i, "")
    .trim() || name.trim();
}

export function InternalStandingsTab({ clubId, associationId, clubLeagues, myLeagueCode }: Props) {
  const queryClient = useQueryClient();

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

  const [seasonYear, setSeasonYear] = useState<string>(String(CURRENT_YEAR));

  // Fetch all rounds for this tenant association → derive tiers
  const { data: tiers = [] } = useQuery({
    queryKey: ["internal-standings-tiers", associationId, seasonYear],
    enabled: !!associationId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const yearStart = `${seasonYear}-01-01`;
      const yearEnd = `${seasonYear}-12-31`;
      const { data, error } = await supabase
        .from("league_rounds")
        .select("id, name, round_number, round_date")
        .eq("association_id", associationId)
        .gte("round_date", yearStart)
        .lte("round_date", yearEnd)
        .order("round_number", { ascending: true });
      if (error) throw error;
      const grouped = new Map<string, { tier: string; roundIds: string[]; firstNumber: number }>();
      (data || []).forEach((r: any) => {
        const tier = tierFromRoundName(r.name || `Round ${r.round_number}`);
        const ex = grouped.get(tier);
        if (ex) {
          ex.roundIds.push(r.id);
        } else {
          grouped.set(tier, { tier, roundIds: [r.id], firstNumber: r.round_number ?? 0 });
        }
      });
      return Array.from(grouped.values()).sort((a, b) => a.firstNumber - b.firstNumber);
    },
  });

  // Map team_code -> team display name (from leagues table for this association)
  const { data: teamNameByCode } = useQuery({
    queryKey: ["team-names-by-code", associationId],
    enabled: !!associationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leagues")
        .select("code, name")
        .eq("association_id", associationId);
      if (error) throw error;
      const map = new Map<string, string>();
      (data || []).forEach((l: any) => {
        if (l.code) map.set(l.code, l.name || l.code);
      });
      return map;
    },
  });

  // Selection: a tier label or "ALL"
  const [selection, setSelection] = useState<string>("");
  useEffect(() => {
    if (!selection && tiers.length > 0) setSelection(tiers[0].tier);
  }, [tiers, selection]);

  const isAllMode = selection === "ALL";
  const tiersToShow = useMemo(
    () => (isAllMode ? tiers : tiers.filter((t) => t.tier === selection)),
    [tiers, selection, isAllMode]
  );

  const allRoundIds = useMemo(
    () => tiersToShow.flatMap((t) => t.roundIds),
    [tiersToShow]
  );

  // Fetch fixtures + results for the selected tier(s)
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["internal-standings", platformAssocId, seasonYear, allRoundIds.join(",")],
    enabled: allRoundIds.length > 0 && !!platformAssocId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: fixtures, error: fxErr } = await supabase
        .from("platform_league_fixtures")
        .select("id, fixture_date, division, home_team_code, away_team_code, status, round_id")
        .eq("association_id", platformAssocId!)
        .in("round_id", allRoundIds)
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

      // Group fixtures by tier
      const byTier = new Map<string, FixtureRow[]>();
      (fixtures || []).forEach((f: any) => {
        const tier =
          tiersToShow.find((t) => t.roundIds.includes(f.round_id))?.tier || "Other";
        const list = byTier.get(tier) || [];
        list.push(f as FixtureRow);
        byTier.set(tier, list);
      });

      const out: Array<{ tier: string; weeks: string[]; rows: StandingRow[] }> = [];
      for (const t of tiersToShow) {
        const fxs = byTier.get(t.tier) || [];
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
            if (!fx) return { date: d, value: "", fixture_id: null, status: null };
            const r = resByFixture.get(fx.id);
            if (!r || (r.home_total_points == null && r.away_total_points == null)) {
              return { date: d, value: "", fixture_id: fx.id, status: r?.status ?? null };
            }
            const isHome = fx.home_team_code === tc;
            const own = isHome ? r.home_total_points ?? 0 : r.away_total_points ?? 0;
            const opp = isHome ? r.away_total_points ?? 0 : r.home_total_points ?? 0;
            return { date: d, value: `${own}-${opp}`, fixture_id: fx.id, status: r.status };
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
        out.push({ tier: t.tier, weeks: weekDates, rows });
      }
      return out;
    },
  });

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
          No league rounds set up yet for {seasonYear}. Create rounds in the Rounds tab first.
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
        (data || []).map(({ tier, weeks, rows }) => {
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
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {teamNameByCode?.get(s.team_code) || s.team_code}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {s.team_code}
                                </span>
                              </div>
                            </TableCell>
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
