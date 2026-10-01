# Live Diamond League summary tiles

## Changes
- Make Front runner and Wooden spooner use the latest available running team table: finals while underway, otherwise semi-finals, otherwise pool standings.
- Use the same stage's live marker so the summary updates as each result arrives.
- Keep Top position and the renamed Wooden spoon position driven by accumulated position points across pool, semi-final, and final games.
- Rename “Last position” to “Wooden spoon position”.

## Checks
- Add focused coverage for selecting the current running table and live-team set.
- Run the Diamond League standings tests and inspect the preview.
- Record the fix in the issue history; do not publish.

## Technical details
- Extract the current-stage summary selection into a small pure helper so pool, semi-final, and final behavior can be tested without rendering the full page.
- Preserve existing scoring, tie completion, bonuses, final pairing, tenant isolation, and saved results.
