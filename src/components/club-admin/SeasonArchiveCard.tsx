import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLeagues } from "@/hooks/use-club";
import {
  archiveConfirmation,
  groupLeaguesBySeason,
  unarchiveWarning,
  type SeasonGroup,
} from "@/lib/leagues/archive";

type Pending =
  | { kind: "archive"; year: number; count: number }
  | { kind: "unarchive"; year: number; count: number; warning: string | null }
  | null;

/**
 * Season-level archive controls.
 *
 * Archiving is always explicit — a club that never starts a new season keeps
 * its current one active forever. Archived seasons stay fully intact and are
 * browsable here; they are only hidden from active workflows.
 */
export function SeasonArchiveCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  // includeArchived — this is the historical view, it must see everything.
  const { data: allLeagues = [] } = useLeagues(clubId, { includeArchived: true });
  const [showArchived, setShowArchived] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupLeaguesBySeason(allLeagues), [allLeagues]);
  const activeSeasons = groups.filter((g) => g.activeCount > 0);
  const archivedSeasons = groups.filter((g) => g.archivedCount > 0);

  if (allLeagues.length === 0) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leagues"] });
    qc.invalidateQueries({ queryKey: ["club-leagues-for-tournament", clubId] });
    qc.invalidateQueries({ queryKey: ["leagues-with-captain"] });
  };

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const fn = pending.kind === "archive" ? "archive_club_season" : "unarchive_club_season";
      const args: Record<string, unknown> = { _club_id: clubId, _season_year: pending.year };
      const { data, error } = await (supabase.rpc as any)(fn, args);
      if (error) throw error;
      toast.success(
        pending.kind === "archive"
          ? `${data ?? 0} league team(s) archived for ${pending.year}`
          : `${data ?? 0} league team(s) restored for ${pending.year}`,
      );
      setPending(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Could not update the season");
    } finally {
      setBusy(false);
    }
  };

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const renderGroup = (g: SeasonGroup, archivedView: boolean) => {
    const key = String(g.seasonYear ?? "none");
    const open = expanded.has(key);
    return (
      <div key={key} className="rounded border border-border/60">
        <div className="flex items-center justify-between gap-2 p-2">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 text-left"
            onClick={() => toggleExpand(key)}
          >
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span className="text-sm font-medium">
              {g.seasonYear == null ? "No season year" : `${g.seasonYear} season`}
            </span>
            <Badge variant="secondary" className="text-[10px] h-5">
              {archivedView ? g.archivedCount : g.activeCount} team
              {(archivedView ? g.archivedCount : g.activeCount) === 1 ? "" : "s"}
            </Badge>
            {g.partial && (
              <Badge variant="outline" className="text-[10px] h-5">
                Partly archived
              </Badge>
            )}
            {archivedView && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1">
                <Lock className="w-3 h-3" />Read-only
              </Badge>
            )}
          </button>
          {g.seasonYear != null &&
            (archivedView ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  setPending({
                    kind: "unarchive",
                    year: g.seasonYear!,
                    count: g.archivedCount,
                    warning: unarchiveWarning(allLeagues, g.seasonYear!),
                  })
                }
              >
                <ArchiveRestore className="w-3.5 h-3.5 mr-1" />Restore
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setPending({ kind: "archive", year: g.seasonYear!, count: g.activeCount })}
              >
                <Archive className="w-3.5 h-3.5 mr-1" />Archive {g.seasonYear} leagues
              </Button>
            ))}
        </div>
        {open && (
          <ul className="border-t border-border/60 px-3 py-2 space-y-1">
            {g.leagues
              .filter((l) => (archivedView ? l.archived_at != null : l.archived_at == null))
              .map((l) => (
                <li key={l.id} className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className="truncate">{l.name}</span>
                  {(l as any).level != null && (
                    <span className="text-[10px] opacity-70">level {(l as any).level}</span>
                  )}
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <Card className="p-3 mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold">Seasons</h4>
          <p className="text-xs text-muted-foreground">
            Archive a finished season instead of deleting it — all teams, fixtures, results and history are kept.
          </p>
        </div>
        {archivedSeasons.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide archived seasons" : `Show archived seasons (${archivedSeasons.length})`}
          </Button>
        )}
      </div>

      <div className="space-y-2">{activeSeasons.map((g) => renderGroup(g, false))}</div>

      {showArchived && (
        <div className="space-y-2 pt-2 border-t border-border/60">
          <p className="text-xs font-medium text-muted-foreground">Archived</p>
          {archivedSeasons.map((g) => renderGroup(g, true))}
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "archive"
                ? `Archive the ${pending.year} season?`
                : `Restore the ${pending?.year} season?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "archive"
                ? archiveConfirmation(pending.year, pending.count)
                : `The ${pending?.year} season becomes editable and visible in day-to-day workflows again.${
                    pending?.kind === "unarchive" && pending.warning ? ` ${pending.warning}` : ""
                  }`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              {pending?.kind === "archive" ? "Archive season" : "Restore season"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
