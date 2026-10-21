import { Badge } from "@/components/ui/badge";
import type { RrGroupStanding } from "@/lib/tournaments/swiss-rr-standings";

/** Riverside pilot: live round-robin group tables, separate from the fixed pairing positions and total standings. */
export function SwissRrFinishStandings({ groups, fromRound, showPoints }: { groups: RrGroupStanding[]; fromRound: number; showPoints: boolean }) {
  if (!groups.length) return null;
  return (
    <section className="space-y-2 rounded-lg border border-border p-3 text-xs" data-testid="rr-finish-standings">
      <h3 className="font-semibold">Round-robin standings — from Round {fromRound} <Badge variant="outline" className="ml-1">Pilot</Badge></h3>
      <p className="text-muted-foreground">Only Round {fromRound}+ group games count. "Pairing pos." is fixed after Round {fromRound - 1} and decides who plays whom; "Rank" changes with results. Overall standings above are separate.</p>
      {groups.map((g) => (
        <div key={g.group} data-testid={`rr-group-${g.group}`}>
          <div className="font-medium">Group {g.group} · positions {g.positions[0]}–{g.positions[1]} · {g.played}/{g.total} games played</div>
          <table className="mt-1 border-collapse">
            <thead><tr className="text-left text-muted-foreground">
              <th className="pr-3">Rank</th><th className="pr-3">Pairing pos.</th><th className="pr-3">Player</th><th className="pr-3">P</th><th className="pr-3">W</th><th className="pr-3">L</th><th className="pr-3">Games</th><th className="pr-3">Game diff</th>{showPoints && <th className="pr-3">Points diff</th>}
            </tr></thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} className="border-t border-border" data-testid={`rr-row-${r.id}`}>
                  <td className="pr-3 font-semibold">{r.played ? `${r.rank}${r.tied ? "=" : ""}` : "—"}</td>
                  <td className="pr-3">{r.pairingPosition}</td>
                  <td className="pr-3 whitespace-nowrap">{(r as any).name ?? r.id}</td>
                  <td className="pr-3">{r.played}</td><td className="pr-3">{r.wins}</td><td className="pr-3">{r.losses}</td>
                  <td className="pr-3">{r.gamesKnown ? `${r.gamesWon}–${r.gamesLost}` : "—"}</td>
                  <td className="pr-3">{r.gamesKnown ? r.gamesWon - r.gamesLost : "—"}</td>
                  {showPoints && <td className="pr-3">{r.pointsKnown && r.played ? r.pointsFor - r.pointsAgainst : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
