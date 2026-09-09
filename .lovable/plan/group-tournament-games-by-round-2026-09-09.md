# Group tournament games by round

Right now every game sits in one long list, and the "please play by" date is repeated on each row. With Nelspruit part-way through round 3 while round 4 has started, nobody can tell which games belong to which round.

## What changes

The Tournament Games list gets round headings.

```text
ROUND 3  ·  4 games left of 8  ·  Please book your court and play by Fri 12 Sep
  Wed 09 Sep 14:00  Taylor Gower vs Carla Coetzee   [Junior Girls · Pool A]  ...
  ...
ROUND 4  ·  6 games  ·  Please book your court and play by Fri 19 Sep
  ...
```

- Each heading shows the round name (from the round plan — "Round 3", "Semi-final", "Final"), how many games are still outstanding in that round, and the play-by date for that round, worded as an instruction: "Please book your court and play by <date>".
- Any organiser note captured for that round appears under the heading.
- Rounds are ordered lowest first, so unfinished earlier rounds stay at the top where they need attention. Games with no round (pool/league play, empty slots) collect under a "Pool games" heading.
- Sections are collapsible, opened by default, and show a small "still outstanding" marker on rounds that are behind.
- The repeated per-row "book your court by …" nudge is removed once the game sits under a round heading, so the row is cleaner.

## Grouping choice

The existing "Group by slot" button becomes a small three-way toggle: **By round** (new default) / **By slot** / **Flat list**. The choice is remembered per user as it is today.

Round grouping also works together with the existing date and league/pool filters and with the All Games / My Games tabs.

## Technical notes

- `src/pages/Tournaments.tsx`: `renderMatchList` gains a round-grouped branch; `groupBySlot` state becomes a `groupMode` string (migrating the existing localStorage value).
- Round labels and play-by dates come from the data already loaded: `champs.round_play_by` merged with `club_champs_rounds` via `mergeRoundDeadlines` / `deadlineForRound`, keyed on each match's `round_number`.
- Outstanding counts come from match status against the full match set of that round (not just the filtered view), so a filtered view still reports the true round progress.
- No schema, RPC or scheduling-logic changes; presentation only.
