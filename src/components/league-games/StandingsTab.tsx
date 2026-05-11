import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InternalStandingsTab } from "./InternalStandingsTab";

type ClubLeague = {
  id: string;
  code: string | null;
  name: string;
  association_id: string | null;
  nsa_team_code: string | null;
};

type Props = {
  clubLeagues: ClubLeague[];
  myLeagueCode?: string | null;
  associationScope?: "internal" | "region";
  externalSource?: string | null;
  clubId?: string | null;
  associationId?: string | null;
};

type StandingRow = {
  team_code: string;
  total: number;
  weeks: Array<{ date: string; value: string }>;
};

type StandingsResult = {
  season_id: string;
  season_label: string;
  division_id: string;
  division_name: string;
  rows: StandingRow[];
};

// Parse "Men's 3rd League 2026" → { category: "Mens", number: 3, year: 2026 }
function parseLeagueName(name: string): { category: string; number: number; year: number | null } | null {
  const lower = name.toLowerCase();
  let category = "";
  if (lower.includes("ladies") || lower.includes("ladie") || lower.includes("women")) category = "Ladies";
  else if (lower.includes("mixed")) category = "Mixed";
  else if (lower.includes("men")) category = "Mens";
  else return null;

  const numMatch = name.match(/(\d+)(?:st|nd|rd|th)?\s*league/i);
  const number = numMatch ? parseInt(numMatch[1], 10) : NaN;
  const yearMatch = name.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (!number) return null;
  return { category, number, year };
}

const CURRENT_YEAR = new Date().getFullYear();

export function StandingsTab({ clubLeagues, myLeagueCode, associationScope = "region", externalSource, clubId, associationId }: Props) {
  // Build the dropdown of club leagues + parsed metadata
  const leagueOptions = useMemo(() => {
    return clubLeagues
      .map((l) => {
        const parsed = parseLeagueName(l.name);
        return parsed ? { ...l, ...parsed } : null;
      })
      .filter((x): x is ClubLeague & { category: string; number: number; year: number | null } => !!x)
      .sort((a, b) => {
        const catRank = (c: string) => (c === "Mens" ? 0 : c === "Mixed" ? 1 : 2);
        const c = catRank(a.category) - catRank(b.category);
        if (c !== 0) return c;
        return a.number - b.number;
      });
  }, [clubLeagues]);

  // Determine "my league" id from myLeagueCode
  const myLeague = useMemo(
    () => leagueOptions.find((l) => l.code === myLeagueCode) ?? leagueOptions[0] ?? null,
    [leagueOptions, myLeagueCode]
  );

  // Selection: league id, or "ALL" for all-club-stacked
  const [selection, setSelection] = useState<string>("");
  useEffect(() => {
    if (!selection && myLeague) setSelection(myLeague.id);
  }, [myLeague, selection]);

  // Season selector — default current year, allow past years
  const [seasonYear, setSeasonYear] = useState<string>(String(CURRENT_YEAR));

  // Fetch list of available seasons (so we can show a real dropdown)
  const { data: seasonsList } = useQuery({
    queryKey: ["nsa-seasons"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("nsa-proxy", {
        body: { endpoint: "standings", params: { list: "seasons" } },
      });
      if (error) throw error;
      return ((data?.data?.seasons || []) as Array<{ id: string; label: string }>).filter(
        // Only "plain" year seasons (skip BFIN, BSF, Blitz which are play-offs)
        (s) => /^\d{4}$/.test(s.label.trim())
      );
    },
    enabled: externalSource !== null && externalSource !== undefined ? externalSource === "nsa" : true,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const isAllMode = selection === "ALL";

  // Leagues to fetch standings for
  const leaguesToFetch = useMemo(() => {
    if (isAllMode) return leagueOptions;
    const one = leagueOptions.find((l) => l.id === selection);
    return one ? [one] : [];
  }, [leagueOptions, selection, isAllMode]);

  // Fetch standings (one query per league)
  const standingsQueries = useQuery({
    queryKey: ["nsa-standings", seasonYear, leaguesToFetch.map((l) => l.id).join(",")],
    queryFn: async () => {
      const out: Array<{ league: typeof leaguesToFetch[number]; result: StandingsResult | null; error?: string }> = [];
      // Fetch in parallel
      const settled = await Promise.allSettled(
        leaguesToFetch.map(async (l) => {
          const { data, error } = await supabase.functions.invoke("nsa-proxy", {
            body: {
              endpoint: "standings",
              params: {
                season_year: seasonYear,
                category: l.category,
                league_number: String(l.number),
              },
            },
          });
          if (error) throw new Error(error.message || "Standings fetch failed");
          if (data?.error) throw new Error(data.error);
          return { league: l, result: data?.data as StandingsResult };
        })
      );
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") out.push(s.value);
        else out.push({ league: leaguesToFetch[i], result: null, error: (s.reason as Error).message });
      });
      return out;
    },
    enabled: leaguesToFetch.length > 0,
    staleTime: 60 * 1000,
  });

  if (associationScope === "internal") {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">
          Internal league standings will appear here once weekly results are captured.
        </p>
      </Card>
    );
  }

  if (leagueOptions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">
          No club leagues found. Allocate teams in the Fill Up Leagues tab first.
        </p>
      </Card>
    );
  }

  const myCodes = new Set(clubLeagues.map((l) => l.nsa_team_code).filter((c): c is string => !!c));

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selection} onValueChange={setSelection}>
          <SelectTrigger className="h-8 w-[260px] text-xs">
            <SelectValue placeholder="Select league" />
          </SelectTrigger>
          <SelectContent>
            {myLeague && (
              <SelectItem value={myLeague.id}>
                ⭐ My League — {myLeague.category} {myLeague.number}
              </SelectItem>
            )}
            <SelectItem value="ALL">All Club Leagues (stacked)</SelectItem>
            <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground tracking-wide">All</div>
            {leagueOptions.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.category} {l.number}
                {l.code ? ` · ${l.code}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={seasonYear} onValueChange={setSeasonYear}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(seasonsList && seasonsList.length > 0
              ? seasonsList.map((s) => s.label)
              : [String(CURRENT_YEAR), String(CURRENT_YEAR - 1), String(CURRENT_YEAR - 2)]
            ).map((y) => (
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
          onClick={() => standingsQueries.refetch()}
          disabled={standingsQueries.isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${standingsQueries.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        <span className="text-[11px] text-muted-foreground ml-auto">
          Live from NSA · cached 60s
        </span>
      </div>

      {standingsQueries.isLoading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!standingsQueries.isLoading && (standingsQueries.data || []).map(({ league, result, error }) => (
        <div key={league.id}>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            {league.category} {league.number}
            {league.code && <span className="font-mono text-xs text-muted-foreground">{league.code}</span>}
            {result && <Badge variant="outline" className="text-[10px]">{result.division_name}</Badge>}
            {league.id === myLeague?.id && <Badge className="text-[10px]">My League</Badge>}
          </h2>

          {error ? (
            <Card className="p-4 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </Card>
          ) : !result || result.rows.length === 0 ? (
            <Card className="p-4 text-xs text-muted-foreground">No standings published yet for this division.</Card>
          ) : (
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-center">#</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-center w-14 font-bold">Total</TableHead>
                    {result.rows[0]?.weeks.map((w, i) => (
                      <TableHead key={i} className="text-center text-[10px] whitespace-nowrap min-w-[44px]">
                        {w.date}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((s, i) => {
                    const mine = myCodes.has(s.team_code);
                    const ourLeague = clubLeagues.find(
                      (cl) => (cl.nsa_team_code || cl.code) === s.team_code,
                    );
                    const customName =
                      ourLeague &&
                      ourLeague.name &&
                      !/^\s*(?:men'?s?|ladies|ladie|women|mixed)\b.*\bleague\b/i.test(ourLeague.name) &&
                      !/reserves?/i.test(ourLeague.name)
                        ? ourLeague.name
                        : null;
                    return (
                      <TableRow key={s.team_code} className={mine ? "bg-primary/10 font-medium" : ""}>
                        <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.team_code}
                          {customName && <span className="ml-2 font-sans font-semibold text-primary">{customName}</span>}
                        </TableCell>
                        <TableCell className="text-center font-bold">{s.total}</TableCell>
                        {s.weeks.map((w, j) => (
                          <TableCell key={j} className="text-center text-xs">
                            {w.value === " " || w.value === "" ? (
                              <span className="text-muted-foreground/40">·</span>
                            ) : (
                              w.value
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
      ))}
    </div>
  );
}
