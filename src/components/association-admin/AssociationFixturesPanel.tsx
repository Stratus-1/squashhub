/**
 * Rounds & fixtures for an association tenant.
 *
 * Reads the association's own fixtures from `platform_league_fixtures` (the
 * same rows Super Admin used to show) so the association tenant is the single
 * source of truth. Where the association is fed by an external source (NSA),
 * the sync actions live here too.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ChevronRight, RefreshCw, Search } from "lucide-react";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PlatformAssociation } from "@/hooks/use-platform-association";
import { SeasonFixtureBuilder } from "@/components/association-admin/SeasonFixtureBuilder";
import { useQuery as useTeamsQuery } from "@tanstack/react-query";
import { type AssocTeam } from "@/lib/leagues/association-tree";

const ALL = "__all__";

interface FixtureRow {
  id: string;
  fixture_date: string;
  division: string;
  venue_name: string | null;
  home_team_code: string;
  away_team_code: string;
  home_team_name_snapshot: string | null;
  away_team_name_snapshot: string | null;
  status: string;
  score: string | null;
  winner_team_code: string | null;
}

export function AssociationFixturesPanel({ association, tenantId }: { association: PlatformAssociation | null; tenantId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState<string>(String(new Date().getFullYear()));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<"fixtures" | "members" | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const { data: teams = [] } = useTeamsQuery({
    queryKey: ["assoc-league-teams", tenantId, "builder"],
    enabled: !!association?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("association_league_teams", { _tenant_id: tenantId });
      if (error) throw error;
      return (data || []) as AssocTeam[];
    },
  });

  const { data: fixtures = [], isLoading } = useQuery({
    queryKey: ["assoc-platform-fixtures", association?.id],
    enabled: !!association?.id,
    queryFn: async () => {
      const pageSize = 1000;
      const all: FixtureRow[] = [];
      for (let from = 0; from < 20000; from += pageSize) {
        const { data, error } = await supabase
          .from("platform_league_fixtures")
          .select(
            "id, fixture_date, division, venue_name, home_team_code, away_team_code, home_team_name_snapshot, away_team_name_snapshot, status, score, winner_team_code"
          )
          .eq("association_id", association!.id)
          .order("fixture_date", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data || []) as FixtureRow[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return all;
    },
  });

  const seasons = useMemo(
    () =>
      Array.from(new Set(fixtures.map((f) => (f.fixture_date || "").slice(0, 4)).filter(Boolean))).sort(
        (a, b) => Number(b) - Number(a)
      ),
    [fixtures]
  );

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fixtures.filter((f) => {
      if (season !== ALL && (f.fixture_date || "").slice(0, 4) !== season) return false;
      if (!q) return true;
      return [
        f.division,
        f.venue_name,
        f.home_team_code,
        f.away_team_code,
        f.home_team_name_snapshot,
        f.away_team_name_snapshot,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [fixtures, season, query]);

  const groups = useMemo(() => {
    const map = new Map<string, FixtureRow[]>();
    for (const f of scoped) {
      const key = f.division || "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [scoped]);

  const sync = async (kind: "fixtures" | "members") => {
    if (!association?.id) return;
    setSyncing(kind);
    try {
      const fn = kind === "fixtures" ? "nsa-sync-fixtures" : "nsa-sync-members";
      const { data, error } = await supabase.functions.invoke(fn, { body: { association_id: association.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success((data as any)?.summary || "Synced");
      qc.invalidateQueries({ queryKey: ["assoc-platform-fixtures", association.id] });
      qc.invalidateQueries({ queryKey: ["platform-association-for-tenant"] });
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  if (!association) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-xs text-muted-foreground">
          This tenant is not linked to a league association yet, so there are no fixtures to show.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Rounds &amp; fixtures
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Every fixture on record for {association.name}, grouped by league. This is the association's own fixture
                list — the single source of truth for the season.
              </p>
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={() => setBuilderOpen(true)}>
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" /> Build season fixtures
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
        {association.external_source && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-2.5">
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold uppercase tracking-wide text-foreground">
                {association.external_source}
              </span>
              {association.external_season && <span className="ml-1">· season {association.external_season}</span>}
              {association.last_fixtures_sync_at ? (
                <span className="ml-2">
                  · last synced{" "}
                  {formatDistanceToNow(new Date(association.last_fixtures_sync_at), { addSuffix: true })}
                </span>
              ) : (
                <span className="ml-2 text-amber-600">· never synced</span>
              )}
              {association.last_fixtures_sync_summary && (
                <div className="mt-0.5 opacity-75">{association.last_fixtures_sync_summary}</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => sync("members")} disabled={!!syncing}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing === "members" && "animate-spin")} />
                Sync members
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => sync("fixtures")} disabled={!!syncing}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing === "fixtures" && "animate-spin")} />
                Sync fixtures
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search league, team or venue"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Select value={season} onValueChange={setSeason}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All seasons</SelectItem>
              {seasons.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {scoped.length} fixtures · {groups.length} leagues
        </p>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No fixtures for this selection.</p>
        ) : (
          <div className="space-y-1.5">
            {groups.map(([division, rows]) => {
              const isOpen = open[division] ?? false;
              return (
                <div key={division} className="rounded-md border">
                  <button
                    type="button"
                    onClick={() => setOpen((m) => ({ ...m, [division]: !isOpen }))}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <ChevronRight className={cn("h-4 w-4 transition-transform text-muted-foreground", isOpen && "rotate-90")} />
                    <span className="flex-1 truncate text-sm font-medium">{division}</span>
                    <Badge variant="secondary" className="h-5 text-[10px] font-normal">
                      {rows.length} fixtures
                    </Badge>
                  </button>
                  {isOpen && (
                    <div className="divide-y border-t">
                      {rows.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 px-2 py-1 pl-8 text-[11px]">
                          <span className="w-20 shrink-0 text-muted-foreground">
                            {f.fixture_date ? format(parseISO(f.fixture_date), "dd MMM") : "TBC"}
                          </span>
                          <span className="flex-1 truncate">
                            {f.home_team_name_snapshot || f.home_team_code} vs{" "}
                            {f.away_team_name_snapshot || f.away_team_code}
                          </span>
                          {f.score && <span className="text-muted-foreground">{f.score}</span>}
                          <span className="hidden truncate text-muted-foreground sm:inline">{f.venue_name}</span>
                          <Badge
                            variant={f.status === "completed" ? "secondary" : "outline"}
                            className="h-4 px-1 text-[9px] font-normal"
                          >
                            {f.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </CardContent>
      </Card>
      <SeasonFixtureBuilder
        tenantId={tenantId}
        association={association}
        teams={teams}
        open={builderOpen}
        onOpenChange={setBuilderOpen}
      />
    </>
  );
}

export default AssociationFixturesPanel;
