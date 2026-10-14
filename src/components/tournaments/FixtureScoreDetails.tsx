import type { CalEvent } from "@/components/tournaments/FixtureCalendar";

/** Shared, read-only score presentation for calendar cards and their details. */
export function FixtureScoreDetails({ event, detailed = false }: { event: CalEvent; detailed?: boolean }) {
  return <div className="space-y-1 tabular-nums">
    {event.score && <div className="font-bold">{detailed ? (event.state === "completed" ? "Final score · " : "Games won · ") : ""}{event.score}</div>}
    {event.currentGame && <div className="font-semibold">Game {event.currentGame.number} · {event.currentGame.a}–{event.currentGame.b}</div>}
    {detailed && event.gameScores?.length ? <ol className="space-y-1 text-sm">{event.gameScores.map((g, i) => <li key={i}>Game {i + 1} · {g.a}–{g.b}</li>)}</ol> : null}
    {detailed && !event.score && !event.currentGame && !event.gameScores?.length && <p className="text-muted-foreground">No score recorded.</p>}
    {detailed && event.winner && <p className="font-semibold">Winner · {event.winner}</p>}
  </div>;
}