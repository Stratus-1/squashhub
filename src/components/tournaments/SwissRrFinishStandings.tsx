import type { RrGroupStanding } from "@/lib/tournaments/swiss-rr-standings";

/** Riverside: live round-robin tables (one per locked group of four), styled like the standalone round-robin standings. */
export function SwissRrFinishStandings({ groups, fromRound, showPoints = true, compact = false }: { compact?: boolean; groups: RrGroupStanding[]; fromRound: number; showPoints?: boolean }) {
  if (!groups.length) return null;
  return (
    <section className={compact ? "space-y-2 text-[11px]" : "space-y-3 text-xs"} data-testid="rr-finish-standings">
      <div>
        <h3 className="font-semibold">{compact ? `Round Robin Standings · live from R${fromRound}` : `Round-robin standings — live from Round ${fromRound}`}</h3>
        <p className={compact ? "sr-only" : "text-muted-foreground"}>Only Round {fromRound}+ group games count. "Pos." is the locked pairing slot and never moves; Rank runs 1–N across groups (Group 2 ranks from 5, etc.) and updates with each result.</p>
      </div>
      {groups.map((g) => (
        <div key={g.group} className="overflow-hidden rounded-md border border-border" data-testid={`rr-group-${g.group}`}>
          <div className="riverside-rr-band flex items-center gap-2 px-2 py-1 font-semibold" data-rr-group={g.group}>
            <span>Group {g.group}</span><span className="font-normal text-muted-foreground">positions {g.positions[0]}–{g.positions[1]} · {g.played}/{g.total} played</span>
          </div>
          {/* table-fixed keeps every group's columns the same width so the
              P/W/L/Games/GD columns line up vertically across groups. */}
          <div className="overflow-x-auto"><table className="w-full table-fixed border-collapse">
            <thead><tr className="text-left text-muted-foreground">
              <th className="w-[14%] px-2">Rank</th><th className="w-[10%] px-2">Pos.</th><th className="px-2">Player</th><th className="w-[9%] px-2">P</th><th className="w-[9%] px-2">W</th><th className="w-[9%] px-2">L</th><th className="w-[13%] px-2">Games</th><th className="w-[9%] px-2">GD</th>{showPoints && <th className="w-[14%] px-2">Pts F/A</th>}
            </tr></thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} className="riverside-rr-band border-t border-border" data-rr-group={g.group} data-testid={`rr-row-${r.id}`}>
                  <td className="px-2 py-1 font-semibold">{r.played ? `${g.positions[0] - 1 + r.rank}${r.tied ? "=" : ""}` : "—"}</td>
                  <td className="px-2 tabular-nums">{r.pairingPosition}</td>
                  <td className="px-2 whitespace-nowrap">{(r as any).name ?? r.id}</td>
                  <td className="px-2">{r.played}</td><td className="px-2">{r.wins}</td><td className="px-2">{r.losses}</td>
                  <td className="px-2">{r.gamesKnown ? `${r.gamesWon}–${r.gamesLost}` : "—"}</td>
                  <td className="px-2">{r.gamesKnown ? r.gamesWon - r.gamesLost : "—"}</td>
                  {showPoints && <td className="px-2 whitespace-nowrap">{r.pointsKnown && r.played ? `${r.pointsFor}/${r.pointsAgainst}` : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}
    </section>
  );
}
