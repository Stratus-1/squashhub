import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3 } from "lucide-react";

type ClubLeague = { id: string; code: string | null; name: string };
type Standing = { position: number | null; team: string; team_id: string | null; points: number; played: number; won: number; lost: number; drawn: number };
type Week = { date: string; points: Record<string, string> };
type Rubber = { order: number; home: string[]; away: string[]; home_games: number | null; away_games: number | null; scores: string | null };
type Fixture = {
  fixture_id: string; played_on: string | null; played_at: string | null; venue: string | null;
  home: { id: string; name: string } | null; away: { id: string; name: string } | null;
  rubbers: Rubber[]; totals: Record<string, [string, string]>;
};
type Division = {
  fixtures?: Fixture[];
  external_division_id: string;
  division_name: string;
  external_league_name: string | null;
  standings: Standing[];
  weekly: Week[];
  fetched_at: string;
};

/** Standings mirrored from an outside league system (e.g. Western Province on SportyHQ). */
export function ExternalStandingsTab({ associationId, clubLeagues, myLeagueCode }: { associationId: string; clubLeagues: ClubLeague[]; myLeagueCode?: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["external-standings", associationId, clubLeagues.map((l) => l.id).join(",")],
    queryFn: async () => {
      const ids = clubLeagues.map((l) => l.id);
      const { data: lg, error: e1 } = await supabase.from("leagues").select("id, code, name, external_team_id, external_division_id").in("id", ids);
      if (e1) throw e1;
      const divIds = [...new Set((lg ?? []).map((l) => l.external_division_id).filter(Boolean))] as string[];
      if (!divIds.length) return { leagues: lg ?? [], divisions: [] as Division[] };
      const { data: divs, error: e2 } = await supabase
        .from("external_league_divisions")
        .select("external_division_id, division_name, external_league_name, standings, weekly, fixtures, fetched_at")
        .in("external_division_id", divIds);
      if (e2) throw e2;
      return { leagues: lg ?? [], divisions: (divs ?? []) as unknown as Division[] };
    },
  });

  const options = useMemo(() => {
    return (data?.leagues ?? [])
      .filter((l) => l.external_division_id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [data]);
  const defaultId = options.find((o) => o.code === myLeagueCode)?.id ?? options[0]?.id ?? "";
  const [sel, setSel] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const current = options.find((o) => o.id === (sel || defaultId));
  const div = data?.divisions.find((d) => d.external_division_id === current?.external_division_id);

  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Loading standings…</Card>;
  if (!options.length || !current) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">No league results have been imported for this league body yet.</p>
      </Card>
    );
  }

  const header = div?.weekly?.[0] ? Object.keys(div.weekly[0].points) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={current.id} onValueChange={setSel}>
          <SelectTrigger className="h-8 w-[300px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {div && (
          <span className="text-[11px] text-muted-foreground">
            {div.external_league_name} · {div.division_name} · from SportyHQ, updated {new Date(div.fetched_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {!div ? (
        <Card className="p-6 text-sm text-muted-foreground">Standings for this team haven't been imported yet.</Card>
      ) : (
        <>
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                  <TableHead className="text-right">P</TableHead>
                  <TableHead className="text-right">W</TableHead>
                  <TableHead className="text-right">L</TableHead>
                  <TableHead className="text-right">D</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {div.standings.map((s) => {
                  const mine = s.team_id && s.team_id === current.external_team_id;
                  return (
                    <TableRow key={s.team} className={mine ? "bg-primary/10 font-semibold" : ""}>
                      <TableCell>{s.position}</TableCell>
                      <TableCell>{s.team}{mine && <Badge variant="secondary" className="ml-2 text-[10px]">Us</Badge>}</TableCell>
                      <TableCell className="text-right font-semibold">{s.points}</TableCell>
                      <TableCell className="text-right">{s.played}</TableCell>
                      <TableCell className="text-right">{s.won}</TableCell>
                      <TableCell className="text-right">{s.lost}</TableCell>
                      <TableCell className="text-right">{s.drawn}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {div.weekly.length > 0 && (
            <Card className="overflow-x-auto">
              <div className="px-3 py-2 text-xs font-semibold">Points per round</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {header.map((h) => <TableHead key={h} className="text-right whitespace-nowrap">{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {div.weekly.map((w) => (
                    <TableRow key={w.date}>
                      <TableCell className="whitespace-nowrap">{w.date}</TableCell>
                      {header.map((h) => <TableCell key={h} className="text-right">{w.points[h] || "—"}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {(() => {
            const mineFx = (div.fixtures ?? []).filter((f) => f.home?.id === current.external_team_id || f.away?.id === current.external_team_id);
            if (!mineFx.length) return null;
            return (
              <Card className="overflow-x-auto">
                <div className="px-3 py-2 text-xs font-semibold">Fixtures &amp; rubber scores — tap a fixture</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Home</TableHead>
                      <TableHead className="text-center">Rubbers</TableHead>
                      <TableHead>Away</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mineFx.map((f) => {
                      const hw = f.rubbers.filter((r) => (r.home_games ?? 0) > (r.away_games ?? 0)).length;
                      const aw = f.rubbers.filter((r) => (r.away_games ?? 0) > (r.home_games ?? 0)).length;
                      const tot = f.totals?.Total;
                      const isOpen = open === f.fixture_id;
                      return (
                        <Fragment key={f.fixture_id}>
                          <TableRow className="cursor-pointer" onClick={() => setOpen(isOpen ? null : f.fixture_id)}>
                            <TableCell className="whitespace-nowrap">{f.played_on ?? f.played_at ?? "—"}</TableCell>
                            <TableCell className={f.home?.id === current.external_team_id ? "font-semibold" : ""}>{f.home?.name}</TableCell>
                            <TableCell className="text-center font-semibold">{hw} – {aw}</TableCell>
                            <TableCell className={f.away?.id === current.external_team_id ? "font-semibold" : ""}>{f.away?.name}</TableCell>
                            <TableCell className="text-right">{tot ? `${tot[0] || 0} – ${tot[1] || 0}` : "—"}</TableCell>
                          </TableRow>
                          {isOpen && f.rubbers.map((r) => (
                            <TableRow key={r.order} className="bg-muted/40 text-[12px]">
                              <TableCell className="text-muted-foreground">#{r.order}</TableCell>
                              <TableCell>{r.home.join(" / ") || "—"}</TableCell>
                              <TableCell className="text-center">
                                <div className="font-semibold">{r.home_games ?? "–"} – {r.away_games ?? "–"}</div>
                                <div className="text-[11px] text-muted-foreground">{r.scores}</div>
                              </TableCell>
                              <TableCell>{r.away.join(" / ") || "—"}</TableCell>
                              <TableCell className="text-right text-[11px] text-muted-foreground">{r.order === 1 ? f.venue : ""}</TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
