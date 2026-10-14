import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fromExt } from "@/lib/supabase-ext";
import { progressionTable, type ProgressionGame } from "@/lib/tournaments/swiss-progression";

export const SWISS_PROGRESSION_FEATURE = "tournament_swiss_progression_view";

/** Per-club pilot switch in club_beta_features. Fails CLOSED (off unless switched on). */
export function useClubBetaFeature(clubId: string | undefined, feature: string) {
  return useQuery({
    queryKey: ["club-beta", feature, clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_beta_features")
        .select("club_id").eq("club_id", clubId!).eq("feature", feature).maybeSingle();
      return !error && !!data;
    },
    enabled: !!clubId,
    staleTime: 60_000,
  });
}

export interface SwissProgressionInput {
  seedOrder: string[];
  games: ProgressionGame[];
  tieBreaks?: string[];
  names: Map<string, string>;
  withdrawn?: Set<string>;
}

/**
 * Riverside pilot: admins can switch the Swiss standings to a progression table.
 * Display only — the ranking comes from the same shared Swiss engine.
 */
export function SwissProgressionPilot({ clubId, canManage, input, classic }: {
  clubId?: string; canManage: boolean; input?: SwissProgressionInput; classic: React.ReactNode;
}) {
  const { data: enabled } = useClubBetaFeature(clubId, SWISS_PROGRESSION_FEATURE);
  const [view, setView] = useState<"classic" | "progression">("progression");
  if (!enabled || !canManage || !input) return <>{classic}</>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2" role="group" aria-label="Standings view">
        <Button size="sm" variant={view === "progression" ? "default" : "outline"} aria-pressed={view === "progression"} onClick={() => setView("progression")}>Progression</Button>
        <Button size="sm" variant={view === "classic" ? "default" : "outline"} aria-pressed={view === "classic"} onClick={() => setView("classic")}>Classic view</Button>
        <Badge variant="outline" className="text-[10px]">Pilot · admins only</Badge>
      </div>
      {view === "classic" ? classic : <SwissProgressionTable input={input} />}
    </div>
  );
}

export function SwissProgressionTable({ input }: { input: SwissProgressionInput }) {
  const t = progressionTable(input.seedOrder, input.games, input.tieBreaks, input.withdrawn);
  const name = (id: string) => input.names.get(id) || "Unknown";
  const seedOf = new Map(t.rows.map((r) => [r.id, r.seed]));
  if (!t.rows.length) return <p className="text-sm text-muted-foreground">No players yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-2 font-medium w-10">Pos</th>
            <th className="py-2 pr-2 font-medium w-10" aria-label="Movement" />
            <th className="py-2 pr-2 font-medium">Player</th>
            <th className="py-2 pr-2 font-medium text-center w-12">Seed</th>
            {t.rounds.map((r) => <th key={r} className="py-2 px-2 font-medium text-center min-w-[7rem]">R{r}</th>)}
            <th className="py-2 px-1 font-medium text-center w-8">P</th>
            <th className="py-2 px-1 font-medium text-center w-8">W</th>
            <th className="py-2 px-1 font-medium text-center w-8">L</th>
            {!t.positionSwap && <th className="py-2 px-1 font-medium text-center w-10">Pts</th>}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r) => (
            <tr key={r.id} className={`border-b border-border/60 ${r.withdrawn ? "opacity-50" : ""}`}>
              <td className="py-1.5 pr-2 font-semibold tabular-nums">{r.withdrawn ? "–" : r.position}</td>
              <td className="py-1.5 pr-2">
                {r.movement == null || r.movement === 0 ? <Minus className="w-3.5 h-3.5 text-muted-foreground" aria-label="No change" />
                  : r.movement > 0 ? <span className="inline-flex items-center text-primary tabular-nums" aria-label={`Up ${r.movement}`}><ArrowUp className="w-3.5 h-3.5" />{r.movement}</span>
                  : <span className="inline-flex items-center text-destructive tabular-nums" aria-label={`Down ${-r.movement}`}><ArrowDown className="w-3.5 h-3.5" />{-r.movement}</span>}
              </td>
              <td className="py-1.5 pr-2 truncate max-w-[12rem]">{name(r.id)}{r.withdrawn && <span className="ml-1 text-[11px] text-muted-foreground">(withdrawn)</span>}</td>
              <td className="py-1.5 pr-2 text-center tabular-nums text-muted-foreground">{r.seed}</td>
              {r.cells.map((c, i) => (
                <td key={i} className="py-1.5 px-2 text-center">
                  {c.kind === "none" ? <span className="text-muted-foreground">—</span>
                    : c.kind === "bye" ? <Badge variant="secondary" className="text-[10px]">BYE</Badge>
                    : <div className="leading-tight">
                        <div className="truncate text-[12px]">#{seedOf.get(c.opponent)} {name(c.opponent)}</div>
                        {c.kind === "pending" ? <div className="text-[11px] text-muted-foreground">pending</div>
                          : <div className={`text-[11px] font-semibold tabular-nums ${c.won ? "text-primary" : "text-destructive"}`}>{c.won ? "W" : "L"}{c.score ? ` ${c.score}` : ""}</div>}
                      </div>}
                </td>
              ))}
              <td className="py-1.5 px-1 text-center tabular-nums">{r.played}</td>
              <td className="py-1.5 px-1 text-center tabular-nums">{r.wins}</td>
              <td className="py-1.5 px-1 text-center tabular-nums">{r.losses}</td>
              {!t.positionSwap && <td className="py-1.5 px-1 text-center tabular-nums font-semibold">{r.points}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
