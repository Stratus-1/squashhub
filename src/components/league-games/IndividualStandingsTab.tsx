import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Users, RefreshCw } from "lucide-react";

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
  platformAssocId?: string | null;
  clubLeagues: ClubLeague[];
};

type PlayerRow = {
  player_code: string;
  name: string;
  ladder_position: number | null;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  diff: number;
  team_codes: Set<string>;
};

const CURRENT_YEAR = new Date().getFullYear();

export function IndividualStandingsTab({ clubId, associationId, platformAssocId, clubLeagues }: Props) {
  const queryClient = useQueryClient();
  const [seasonYear, setSeasonYear] = useState<string>(String(CURRENT_YEAR));

  // Resolve platform association id if not supplied
  const { data: resolvedAssocId } = useQuery({
    queryKey: ["league-assoc-platform-id-ind", associationId],
    enabled: !!associationId && !platformAssocId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("league_associations")
        .select("platform_association_id")
        .eq("id", associationId)
        .maybeSingle();
      return (data?.platform_association_id as string | null) ?? associationId;
    },
  });
  const assocIdToUse = platformAssocId ?? resolvedAssocId ?? associationId;

  const myCodes = useMemo(
    () =>
      Array.from(
        new Set(
          clubLeagues
            .flatMap((l) => [l.code, l.nsa_team_code])
            .filter((c): c is string => !!c)
            .map((c) => c.toUpperCase()),
        ),
      ),
    [clubLeagues],
  );

  // Filter for league selection
  const [selectedTeamCode, setSelectedTeamCode] = useState<string>("ALL");

  // Fetch club members (for name + ladder + member-number → player-code mapping)
  const { data: members = [] } = useQuery({
    queryKey: ["individual-standings-members", clubId],
    enabled: !!clubId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("club_members")
        .select("id, name, club_member_number, ladder_position")
        .eq("club_id", clubId);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string | null;
        club_member_number: string | null;
        ladder_position: number | null;
      }>;
    },
  });

  // Fetch fixtures + per-rubber results for our team codes for the season
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["individual-standings", assocIdToUse, seasonYear, myCodes.join(",")],
    enabled: !!assocIdToUse && myCodes.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const yearStart = `${seasonYear}-01-01`;
      const yearEnd = `${seasonYear}-12-31`;
      const { data: fixtures, error: fxErr } = await supabase
        .from("platform_league_fixtures")
        .select("id, fixture_date, home_team_code, away_team_code")
        .eq("association_id", assocIdToUse!)
        .gte("fixture_date", yearStart)
        .lte("fixture_date", yearEnd);
      if (fxErr) throw fxErr;

      const ours = (fixtures || []).filter((f: any) => {
        const h = (f.home_team_code || "").toUpperCase();
        const a = (f.away_team_code || "").toUpperCase();
        return myCodes.includes(h) || myCodes.includes(a);
      });
      const fixtureIds = ours.map((f: any) => f.id);
      if (fixtureIds.length === 0) return [] as PlayerRow[];

      // Page in groups of 500 to avoid URL length limits
      const chunks: string[][] = [];
      for (let i = 0; i < fixtureIds.length; i += 500) chunks.push(fixtureIds.slice(i, i + 500));
      const rubbers: any[] = [];
      for (const ids of chunks) {
        const { data: rs, error: rErr } = await supabase
          .from("league_match_results")
          .select(
            "fixture_id, position, home_player_code, home_player_name, away_player_code, away_player_name, home_games_won, away_games_won, winner, is_forfeit",
          )
          .in("fixture_id", ids);
        if (rErr) throw rErr;
        rubbers.push(...(rs || []));
      }

      const fxById = new Map<string, { home: string; away: string }>();
      ours.forEach((f: any) => {
        fxById.set(f.id, {
          home: (f.home_team_code || "").toUpperCase(),
          away: (f.away_team_code || "").toUpperCase(),
        });
      });

      const agg = new Map<string, PlayerRow>();
      for (const r of rubbers) {
        // Only count rubbers with a recorded outcome
        if (!r.winner) continue;
        const fx = fxById.get(r.fixture_id);
        if (!fx) continue;

        const homeOurs = myCodes.includes(fx.home);
        const awayOurs = myCodes.includes(fx.away);

        const pushPlayer = (
          code: string | null,
          name: string | null,
          teamCode: string,
          ownGames: number,
          oppGames: number,
          won: boolean,
        ) => {
          if (!code) return;
          if (selectedTeamCode !== "ALL" && teamCode !== selectedTeamCode) return;
          const key = code.toUpperCase();
          const existing = agg.get(key);
          const member = members.find(
            (m) => (m.club_member_number || "").toUpperCase() === key,
          );
          const row: PlayerRow = existing || {
            player_code: key,
            name: member?.name || name || key,
            ladder_position: member?.ladder_position ?? null,
            played: 0,
            won: 0,
            lost: 0,
            gamesWon: 0,
            gamesLost: 0,
            diff: 0,
            team_codes: new Set<string>(),
          };
          row.played += 1;
          if (won) row.won += 1;
          else row.lost += 1;
          row.gamesWon += ownGames;
          row.gamesLost += oppGames;
          row.diff = row.gamesWon - row.gamesLost;
          row.team_codes.add(teamCode);
          agg.set(key, row);
        };

        if (homeOurs) {
          pushPlayer(
            r.home_player_code,
            r.home_player_name,
            fx.home,
            r.home_games_won ?? 0,
            r.away_games_won ?? 0,
            r.winner === "home",
          );
        }
        if (awayOurs) {
          pushPlayer(
            r.away_player_code,
            r.away_player_name,
            fx.away,
            r.away_games_won ?? 0,
            r.home_games_won ?? 0,
            r.winner === "away",
          );
        }
      }

      const rows = Array.from(agg.values());
      // Sort: diff DESC, then ladder_position ASC (nulls last), then name
      rows.sort((a, b) => {
        if (b.diff !== a.diff) return b.diff - a.diff;
        const la = a.ladder_position ?? Number.POSITIVE_INFINITY;
        const lb = b.ladder_position ?? Number.POSITIVE_INFINITY;
        if (la !== lb) return la - lb;
        return a.name.localeCompare(b.name);
      });
      return rows;
    },
  });

  // Realtime refresh when results change
  useEffect(() => {
    if (!assocIdToUse) return;
    const ch = supabase
      .channel(`individual-standings:${assocIdToUse}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_match_results" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["individual-standings", assocIdToUse] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [assocIdToUse, queryClient]);

  const teamOptions = useMemo(() => {
    // Build {code, label, order} keyed by team code, ordered by league rank (1st, 2nd, 3rd…)
    const ordinalRx = /(\d+)\s*(?:st|nd|rd|th)?\s*league/i;
    const map = new Map<string, { code: string; label: string; order: number }>();
    clubLeagues.forEach((l) => {
      const m = (l.name || "").match(ordinalRx);
      const order = m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
      const num = m ? `${m[1]}` : null;
      const gender = /ladies|women/i.test(l.name || "") ? "L"
        : /mixed/i.test(l.name || "") ? "M"
        : /men/i.test(l.name || "") ? "" : "";
      const label = num ? `League ${num}${gender ? ` (${gender})` : ""}` : l.name || l.code || "";
      const add = (code: string | null) => {
        if (!code) return;
        const k = code.toUpperCase();
        const existing = map.get(k);
        if (!existing || order < existing.order) map.set(k, { code: k, label, order });
      };
      add(l.code);
      add(l.nsa_team_code);
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.code.localeCompare(b.code);
    });
  }, [clubLeagues]);

  const rows = data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedTeamCode} onValueChange={setSelectedTeamCode}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder="All leagues" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All leagues</SelectItem>
            {teamOptions.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.label} · {o.code}
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
          Sorted by net game contribution · ladder rank breaks ties
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">
            No individual results recorded yet for {seasonYear}.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-center w-14" title="Matches (rubbers) played">P</TableHead>
                <TableHead className="text-center w-14" title="Matches won">W</TableHead>
                <TableHead className="text-center w-14" title="Matches lost">L</TableHead>
                <TableHead className="text-center w-16" title="Total games (sets) won">GW</TableHead>
                <TableHead className="text-center w-16" title="Total games (sets) lost">GL</TableHead>
                <TableHead className="text-center w-20 font-bold" title="Net contribution: games won − games lost">
                  +/−
                </TableHead>
                <TableHead className="text-center w-14 text-[10px]" title="Club ladder position">
                  Ladder
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.player_code}>
                  <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{r.player_code}</span>
                      {r.team_codes.size > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {Array.from(r.team_codes).map((tc) => (
                            <Badge key={tc} variant="outline" className="text-[9px] px-1 py-0">
                              {tc}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-xs">{r.played}</TableCell>
                  <TableCell className="text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {r.won}
                  </TableCell>
                  <TableCell className="text-center text-xs text-rose-600 dark:text-rose-400">
                    {r.lost}
                  </TableCell>
                  <TableCell className="text-center text-xs">{r.gamesWon}</TableCell>
                  <TableCell className="text-center text-xs">{r.gamesLost}</TableCell>
                  <TableCell
                    className={`text-center font-bold ${
                      r.diff > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : r.diff < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </TableCell>
                  <TableCell className="text-center text-[11px] text-muted-foreground">
                    {r.ladder_position ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
