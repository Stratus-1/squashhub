# Correct completed tournament results

## What will change
- Add **Edit result** beside completed games in **Past Fixtures**, including the screen shown for Myburg 7’s.
- Open the saved game scores, with player names and the category’s actual scoring format (including PAR 7).
- Require an explicit **Save correction** action and record the previous result, corrected result and person making the correction.
- Allow the tournament’s authorised managers to correct results; do not give ordinary members or public scoring links management access.
- Refresh the result and standings after a successful correction.

## Protect live play
- Opening or cancelling the editor will never change a result.
- If a correction could change already-generated opponents, ranking awards or ladder moves, show the impact and block an unsafe save rather than silently changing later games.
- No existing HSC results, fixtures or allocations will be changed during development or verification. Publication remains separate.

## Technical details
- The existing **Redo score** route is blocked by the finished-match marker guard, and the normal result-entry writer deliberately skips completed fixtures. A dedicated correction action is needed rather than reopening live marking.
- Reuse the existing game-score validation and authorised, audited correction pattern. Resolve the actual category/play-off scoring settings instead of the tournament-wide defaults.
- Enforce tournament scope and completion checks on the server, include stale-result protection, and preserve saved match identity and scheduling.
- Test authorised/unauthorised access, PAR 7 corrections, stale saves and downstream protection. Check the editor on mobile and desktop without altering the live tournament.