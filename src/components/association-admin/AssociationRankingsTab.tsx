import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, ChevronDown, DownloadCloud, Minus, RefreshCw, Search,
} from "lucide-react";
import {
  OVERALL_CATEGORY,
  useLatestRankingSnapshot,
  useNsaSyncRuns,
  useRankingCategories,
  useRankingEntries,
  useRecomputeRankings,
  useRunNsaScrape,
} from "@/hooks/use-nsa-rankings";

/** NSA season codes we can pull, newest first. */
const SEASONS = [
  { code: "s79", year: 2026 },
  { code: "s73", year: 2025 },
  { code: "s62", year: 2024 },
];

interface Props {
  clubId: string;
}

export function AssociationRankingsTab({ clubId }: Props) {
  const [category, setCategory] = useState(OVERALL_CATEGORY);
  const [search, setSearch] = useState("");

  const { data: snapshot, isLoading: loadingSnapshot } = useLatestRankingSnapshot(null);
  const { data: categories = [] } = useRankingCategories(snapshot?.id);
  const { data: entries = [], isLoading: loadingEntries } = useRankingEntries(snapshot?.id, category);
  const { data: runs = [] } = useNsaSyncRuns(8);

  const scrape = useRunNsaScrape();
  const recompute = useRecomputeRankings(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        (e.player_name ?? "").toLowerCase().includes(q) ||
        e.player_code.toLowerCase().includes(q) ||
        (e.club_label ?? "").toLowerCase().includes(q),
    );
  }, [entries, search]);

  const runScrape = (season: string, fullSeason: boolean) => {
    scrape.mutate(
      { season, full_season: fullSeason, lookback_days: fullSeason ? undefined : 14 },
      {
        onSuccess: () => toast.success("Pull started — results appear in the sync log below"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const runRecompute = () => {
    recompute.mutate(undefined, {
      onSuccess: (d: any) =>
        toast.success(
          d?.entries ? `Rankings rebuilt — ${d.entries} entries from ${d.rubbers_scored} rubbers` : "Rankings rebuilt",
        ),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="space-y-4 text-[13px]">
      {/* Data pull ------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DownloadCloud className="h-4 w-4" /> League data from NSA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">
            Every screen reads the local copy — this only refreshes it. Pull each past season once, then
            leave the nightly job to keep the current season up to date.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={scrape.isPending} onClick={() => runScrape("s79", false)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh recent (2026)
            </Button>
            {SEASONS.map((s) => (
              <Button
                key={s.code}
                size="sm"
                variant="outline"
                disabled={scrape.isPending}
                onClick={() => runScrape(s.code, true)}
              >
                Pull full {s.year} season
              </Button>
            ))}
            <Button size="sm" disabled={recompute.isPending} onClick={runRecompute}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recompute.isPending ? "animate-spin" : ""}`} />
              Rebuild rankings
            </Button>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-3.5 w-3.5" /> Sync log ({runs.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Season</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Seen</TableHead>
                      <TableHead className="text-right">Saved</TableHead>
                      <TableHead className="text-right">Skipped</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                          No pulls yet
                        </TableCell>
                      </TableRow>
                    )}
                    {runs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(r.started_at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}
                        </TableCell>
                        <TableCell>{r.kind === "rubbers_backfill" ? "Full season" : "Recent"}</TableCell>
                        <TableCell>{r.season_year ?? r.season_code ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === "failed" ? "destructive" : r.status === "running" ? "secondary" : "outline"}>
                            {r.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{r.seen_count}</TableCell>
                        <TableCell className="text-right">{r.created_count}</TableCell>
                        <TableCell className="text-right">{r.skipped_count}</TableCell>
                        <TableCell className="text-right">{r.error_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Rankings -------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Player rankings</CardTitle>
            {snapshot && (
              <span className="text-muted-foreground">
                {snapshot.player_count} players · seasons {snapshot.basis_seasons.join(", ")} · rebuilt{" "}
                {new Date(snapshot.computed_at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!snapshot && !loadingSnapshot && (
            <p className="text-muted-foreground">
              No rankings yet. Pull a season above, then choose <strong>Rebuild rankings</strong>.
            </p>
          )}

          {snapshot && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={category} onValueChange={setCategory}>
                  <TabsList>
                    {(categories.length ? categories : [OVERALL_CATEGORY]).map((c) => (
                      <TabsTrigger key={c} value={c}>
                        {c === OVERALL_CATEGORY ? "Overall" : c}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7 h-8"
                    placeholder="Search player, NSF number or team"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>NSF</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-right">Rubbers</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="w-16 text-right">Move</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingEntries && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell>
                      </TableRow>
                    )}
                    {!loadingEntries && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">No players match</TableCell>
                      </TableRow>
                    )}
                    {filtered.slice(0, 300).map((e) => {
                      const move = e.previous_rank == null ? null : e.previous_rank - e.rank;
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.rank}</TableCell>
                          <TableCell>{e.player_name ?? "Unknown"}</TableCell>
                          <TableCell className="text-muted-foreground">{e.player_code}</TableCell>
                          <TableCell className="text-muted-foreground">{e.club_label ?? "—"}</TableCell>
                          <TableCell className="text-right">{e.rubbers_counted}</TableCell>
                          <TableCell className="text-right font-medium">{Number(e.score).toFixed(1)}</TableCell>
                          <TableCell className="text-right">
                            {move == null ? (
                              <Badge variant="outline">new</Badge>
                            ) : move > 0 ? (
                              <span className="inline-flex items-center text-emerald-600">
                                <ArrowUp className="h-3.5 w-3.5" />{move}
                              </span>
                            ) : move < 0 ? (
                              <span className="inline-flex items-center text-red-600">
                                <ArrowDown className="h-3.5 w-3.5" />{Math.abs(move)}
                              </span>
                            ) : (
                              <Minus className="h-3.5 w-3.5 inline text-muted-foreground" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {filtered.length > 300 && (
                <p className="text-muted-foreground">Showing the top 300 of {filtered.length} — use search to narrow.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
