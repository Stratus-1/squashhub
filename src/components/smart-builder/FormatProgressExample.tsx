import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LearnExample, LearnRound } from "@/lib/smart-builder/format-learn";

const FICTIONAL_NAMES = ["Alex", "Ben", "Cara", "Dani", "Evan", "Fran", "Gabi", "Hugo"];
export function exampleName(id: string) {
  const index = Number(id.slice(1)) - 1;
  return FICTIONAL_NAMES[index] ?? id;
}

export function FormatProgressExample({ example, active, onRound }: { example: LearnExample; active: LearnRound; onRound: (key: string) => void }) {
  const players = [...new Set(example.rounds[0].games.flatMap((game) => [game.a, game.b]))].sort();
  const swiss = example.format === "swiss";
  const before = example.standings?.[Math.max(0, example.rounds.indexOf(active) - 1)]?.rows;
  const position = (id: string) => active === example.rounds[0] || !swiss ? players.indexOf(id) + 1 : (before?.findIndex((row) => row.name === id) ?? -1) + 1;
  return <section className="space-y-3" aria-label="Example progression">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{swiss ? "Follow the rounds" : "Everyone meets everyone"}</h4><Badge variant="secondary">{players.length} players · {example.rounds.length} rounds</Badge></div>
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Choose a round">
      {example.rounds.map((round) => <Button key={round.key} type="button" size="sm" variant={round.key === active.key ? "default" : "outline"} className="h-8 text-xs" role="tab" aria-selected={round.key === active.key} onClick={() => onRound(round.key)}>{round.label}</Button>)}
    </div>
    {!swiss ? <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 overflow-x-auto border border-border rounded-md"><table className="w-full text-xs" aria-label="Round robin opponent grid">
        <thead className="bg-muted"><tr><th className="p-2 text-left">Pos</th><th className="p-2 text-left">Player</th>{players.map((player, index) => <th key={player} className="p-2" title={exampleName(player)}>{index + 1}</th>)}</tr></thead>
        <tbody>{players.map((player, index) => <tr key={player} className="border-t border-border"><td className="p-2 text-muted-foreground">{index + 1}</td><th className="p-2 text-left font-medium">{exampleName(player)}</th>{players.map((opponent) => {
          const round = example.rounds.find((row) => row.games.some((game) => game.a === player && game.b === opponent || game.b === player && game.a === opponent));
          return <td key={opponent} className={player === opponent ? "bg-muted p-2 text-center" : "p-1 text-center"}>{round ? <Button type="button" variant={round.key === active.key ? "default" : "ghost"} size="sm" className="h-7 w-8 p-0 text-xs" aria-label={`${exampleName(player)} versus ${exampleName(opponent)}, ${round.label}`} onClick={() => onRound(round.key)}>{round.key.toUpperCase()}</Button> : "—"}</td>;
        })}</tr>)}</tbody>
      </table></div>
      <RoundGames round={active} position={position} />
    </div> : <div className="grid gap-3 md:grid-cols-3">{example.rounds.map((round) => {
      const index = example.rounds.indexOf(round);
      const ranks = index ? example.standings?.[index - 1]?.rows.map((row) => row.name) ?? players : players;
      return <RoundGames key={round.key} round={round} selected={round.key === active.key} position={(id) => ranks.indexOf(id) + 1} />;
    })}</div>}
    {active.note && <p className="text-xs text-muted-foreground" role="tabpanel">{active.note}</p>}
  </section>;
}

function RoundGames({ round, position, selected = true }: { round: LearnRound; position: (id: string) => number; selected?: boolean }) {
  return <div className={selected ? "min-w-0 overflow-hidden rounded-md border border-primary" : "min-w-0 overflow-hidden rounded-md border border-border"}>
    <h5 className="border-b border-border bg-muted px-3 py-2 font-semibold">{round.label}</h5>
    <table className="w-full text-xs" aria-label={`${round.label} example games`}><thead className="text-muted-foreground"><tr><th className="px-2 py-2 text-left">Pos</th><th className="px-2 py-2 text-left">Player</th><th className="px-2 py-2 text-right">Result</th></tr></thead>
      <tbody>{round.games.map((game) => [game.a, game.b].map((player, index) => <tr key={`${game.a}-${player}`} className={index === 0 ? "border-t border-border" : "border-b border-border"}>
        <td className="px-2 py-1.5 text-muted-foreground">{position(player)}</td><td className={game.winner === player ? "px-2 py-1.5 font-semibold" : "px-2 py-1.5 text-muted-foreground"}>{exampleName(player)}</td><td className="whitespace-nowrap px-2 py-1.5 text-right">{game.winner === player ? `W ${game.winner === game.a ? game.score : game.score.split("-").reverse().join("-")}` : "L"}</td>
      </tr>))}</tbody>
    </table>
  </div>;
}