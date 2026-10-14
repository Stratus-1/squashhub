import type { CalEvent } from "@/components/tournaments/FixtureCalendar";

/** Shared, read-only score presentation for calendar cards and their details. */
export function FixtureScoreDetails({ event, detailed = false }: { event: CalEvent; detailed?: boolean }) {
  const scorePending = !event.score && !event.currentGame && !event.gameScores?.length;
  const players = event.title.split(/\s+v\s+/);
  return <div className="space-y-1 tabular-nums" aria-live={detailed ? "polite" : "off"}>
    {event.score && <div className="font-bold">{detailed ? (event.state === "completed" ? "Final score · " : "Games won · ") : ""}{event.score}</div>}
    {detailed && event.score && players.length === 2 && <p className="break-words text-xs text-muted-foreground">Score order: {players[0]} · {players[1]}</p>}
    {event.currentGame && <div className="font-semibold">Game {event.currentGame.number} · {event.currentGame.a}–{event.currentGame.b}</div>}
    {detailed && event.gameScores?.length ? <ol className="space-y-1 text-sm">{event.gameScores.map((g, i) => <li key={i}>Game {i + 1} · {g.a}–{g.b}</li>)}</ol> : null}
    {scorePending && event.state === "live" && <p className="text-muted-foreground">Live · score pending</p>}
    {detailed && scorePending && event.state !== "live" && <p className="text-muted-foreground">No score recorded.</p>}
    {detailed && event.winner && <p className="font-semibold">Winner · {event.winner}</p>}
  </div>;
}