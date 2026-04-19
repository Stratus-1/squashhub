import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";

type Props = {
  platformAssocIds: string[];
  clubTeamCodes: string[];
  associationScope?: "internal" | "region";
};

type Standing = {
  team_code: string;
  division: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
};

export function StandingsTab({ platformAssocIds, clubTeamCodes }: Props) {
  // Pull all confirmed/submitted fixture results to compute standings
  const { data: fixtures, isLoading } = useQuery({
    queryKey: ["all-assoc-fixtures", platformAssocIds.join(",")],
    queryFn: async () => {
      if (platformAssocIds.length === 0) return [];
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("id, division, home_team_code, away_team_code, status, winner_team_code")
        .in("association_id", platformAssocIds);
      if (error) throw error;
      return data || [];
    },
    enabled: platformAssocIds.length > 0,
  });

  const fixtureIds = (fixtures || []).map((f) => f.id);
  const { data: results } = useQuery({
    queryKey: ["assoc-fixture-results", fixtureIds.join(",")],
    queryFn: async () => {
      if (fixtureIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_fixture_results" as any)
        .select("fixture_id, status, home_total_points, away_total_points, winner")
        .in("fixture_id", fixtureIds)
        .in("status", ["submitted", "confirmed"]);
      if (error) throw error;
      return data || [];
    },
    enabled: fixtureIds.length > 0,
  });

  const standingsByDivision = useMemo(() => {
    const groups = new Map<string, Map<string, Standing>>();
    const resMap = new Map<string, any>();
    for (const r of (results || []) as any[]) resMap.set(r.fixture_id, r);

    for (const f of fixtures || []) {
      const r = resMap.get(f.id);
      if (!r) continue;

      const div = f.division;
      if (!groups.has(div)) groups.set(div, new Map());
      const teamMap = groups.get(div)!;

      const ensure = (code: string): Standing => {
        let s = teamMap.get(code);
        if (!s) {
          s = { team_code: code, division: div, played: 0, won: 0, drawn: 0, lost: 0, points: 0 };
          teamMap.set(code, s);
        }
        return s;
      };

      const home = ensure(f.home_team_code);
      const away = ensure(f.away_team_code);
      home.played++;
      away.played++;
      home.points += r.home_total_points || 0;
      away.points += r.away_total_points || 0;

      if (r.winner === "home") {
        home.won++;
        away.lost++;
      } else if (r.winner === "away") {
        away.won++;
        home.lost++;
      } else if (r.winner === "draw") {
        home.drawn++;
        away.drawn++;
      }
    }

    // Sort each division by points desc, then won desc
    const result = new Map<string, Standing[]>();
    for (const [div, teamMap] of groups) {
      const arr = [...teamMap.values()].sort(
        (a, b) => b.points - a.points || b.won - a.won || a.team_code.localeCompare(b.team_code)
      );
      result.set(div, arr);
    }
    return result;
  }, [fixtures, results]);

  const myCodes = useMemo(() => new Set(clubTeamCodes), [clubTeamCodes]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (standingsByDivision.size === 0) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">
          No standings available yet. Tables update as fixture results are submitted.
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Official imported standings from the league association will appear here when available.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Live standings calculated from submitted fixture results. Official imported tables will display here when synced.
      </p>
      {[...standingsByDivision.entries()].map(([division, rows]) => (
        <div key={division}>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            {division}
            <Badge variant="outline" className="text-[10px]">Calculated</Badge>
          </h2>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-center">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center w-10">P</TableHead>
                  <TableHead className="text-center w-10">W</TableHead>
                  <TableHead className="text-center w-10">D</TableHead>
                  <TableHead className="text-center w-10">L</TableHead>
                  <TableHead className="text-center w-12 font-bold">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s, i) => (
                  <TableRow key={s.team_code} className={myCodes.has(s.team_code) ? "bg-primary/5 font-medium" : ""}>
                    <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{s.team_code}</TableCell>
                    <TableCell className="text-center text-xs">{s.played}</TableCell>
                    <TableCell className="text-center text-xs">{s.won}</TableCell>
                    <TableCell className="text-center text-xs">{s.drawn}</TableCell>
                    <TableCell className="text-center text-xs">{s.lost}</TableCell>
                    <TableCell className="text-center font-bold">{s.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      ))}
    </div>
  );
}
