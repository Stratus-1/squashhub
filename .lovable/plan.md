# Apply final tournament ranking to the club ladder

## What you get
- When a category is finished (all rounds played), organisers see a button **"Apply final ranking to ladder"** in the Tournament Summary, next to that category's 1–N list.
- Pressing it first shows a **preview**: each player's current ladder spot, their new spot, and how far they move up or down. Nothing changes until you press **Confirm**.
- It only happens when someone presses the button. Nothing moves on its own.

## How players are placed
- Only players in that category are reordered. Members who didn't play keep their exact ladder spots.
- The tournament players **share the ladder spots they already hold between them**, given out in final-ranking order. Example: if the 18 Ladies B players hold spots 3, 5, 9 … 40, the winner gets 3, second place gets 5, and so on.
- Category ranking used:
  - Swiss + round robin with a Swiss remainder (Ladies B): the 1–18 final ranking.
  - Everyone in groups (men): Group 1 finishers first, then Group 2, and so on, each group in its own finishing order.
- Players who aren't on the ladder, are in a different ladder group (e.g. men's vs ladies) or withdrew are left out and listed in the preview.

## Safety
- One apply per category. Pressing it again for that category shows "Already applied" with the date and who did it.
- Every move is recorded in the ladder history as "Tournament final ranking", so it can be traced and undone by hand.
- Only club admins (or people with ladder permission) can apply it. This deliberately allows the normal limit on large ladder reshuffles to be exceeded, and it is recorded in the history.
- Live tournament results, fixtures and the per-game ladder moves already made stay as they are.

## Rollout
- Test on Riverside first (Ladies B and the men's category), then roll out after your sign-off. Uitsig stays unchanged until then.

## Technical details
- New audited, server-side ladder function: it checks the admin's permission and the category's completion on the server, rejects an apply that has already been done, and rewrites `ladder_position` only for the players listed. History rows use a new change source, `tournament_final_ranking`.
- Small new record of which tournament categories have been applied (so the same category can't be applied twice), with access rules limited to the club.
- The ranking comes from the existing shared `rrFinalRanking`; the preview runs in the browser, but the server recalculates and checks all positions before saving.
- Tests: spots are shared among the category's players only, everyone else stays put, a second apply is rejected, and someone without permission is refused.
