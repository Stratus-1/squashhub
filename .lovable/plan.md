# Show Bells games as one schedule

## What changes
- On the Tournament Games page, any active Bells tournament switches the games display to one schedule ordered by date, time, then court.
- Remove the round/list grouping choice while that Bells schedule is active, so numbered round headings cannot appear.
- Keep the existing round grouping choices unchanged for standard tournaments.

## Verification
- Add a focused check for chronological ordering, including games that are live.
- Confirm the Tournament Games page builds cleanly and record the fix in the project issue history.

## Technical details
- This is presentation-only in `src/pages/Tournaments.tsx`; no fixtures, results, tournament rules, or database rows change.
