# Live status should follow the marker, and resuming must never start at 0-0

## What is happening today

Two separate things are behind what you are seeing.

**1. The LIVE chip does not know whether anyone is actually marking.**
On the Tournament Games list, a game shows `LIVE` purely because its database status is `in_progress`. That status is set on the first point and is never cleared when the marker leaves the screen. The marker-presence records (added with the take-over work) are only consulted when someone taps **Mark** — they are not used to draw the chip. So a game that nobody is scoring keeps flashing LIVE, and the next person assumes it is occupied.

**2. Reopening the marker can show 0-0.**
When the marker screen is opened for a tournament game, it first checks whether this browser already has a saved session for that same game. If it does, it keeps that saved session and **skips reading the score back from the database entirely**. If the saved local score has been lost or was saved before any points (app update, cleared storage, different phone, different person, private tab), the board comes up at 0-0 even though the real running score is safely in the database.

## What will change

### Live status follows the marker
- The `LIVE` chip appears only when someone is actively marking (a marker heartbeat within the last 60 seconds).
- A game that is `in_progress` but has no active marker shows an amber **Paused 6-10 · Resume** chip instead, so it is obvious the game is under way but free for anyone to pick up.
- Tapping **Resume** goes straight into the marker at the current score; tapping **LIVE** still opens the read-only live scoreboard, as it does now.
- The live sort order keeps genuinely live games at the top, with paused games just under them.
- The same treatment is applied to the read-only live scoreboard page (it says "waiting for a marker" instead of pretending someone is scoring) and to the admin tournament view.

### Resume always picks up where the game left off
- Opening the marker for a tournament game always reads the current score from the database, even when this browser has a saved session.
- The database score and the local saved session are then compared, and the one that is further along wins. So a marker returning to their own phone keeps their exact game state (server, serve side, undo history), while anyone else — or the same person on a fresh device — resumes from the stored score instead of 0-0.
- Time-capped (Bells) games get the same marker-presence heartbeat, so their LIVE chip also falls away when the marker exits, with the bell timer still driving the countdown.

### Leaving cleanly
- Exiting the marker (back, dashboard, closing the tab) releases the marker record immediately, and also fires a last-gasp release when the tab is closed or backgrounded so the game does not stay "held" for up to a minute on a hard close.

Nothing is deleted or reset when a marker exits: the score, the completed games and the status stay exactly as they are — only the "someone is marking this" flag disappears.

## Technical notes

- `src/pages/Tournaments.tsx`: use the existing `useChampMarkerLocks(matchIds)` hook to build a fresh-lock set; `isLive(m)` becomes `in_progress && freshLock`, with a new `isPaused(m)` = `in_progress && !freshLock`. Render the amber Resume chip for paused games (route through the existing `openMarker` so the take-over guard still applies).
- `src/pages/MatchMarker.tsx`: remove the early `return` in the `searchParams` effect that short-circuits the database load when a stored config matches the same `sourceId`; instead always run `loadLinkedTournamentMatch` and pass the freshly parsed `initialScores` into the config.
- `src/components/marker/MarkerScoreboard.tsx`: `loadPersisted` already discards local state when the database has progressed further — keep that logic and make it the single decision point once the database values are reliably supplied.
- Add a `pagehide`/`visibilitychange` release in `useChampMarkerHeartbeat` (`src/hooks/use-champ-marker-lock.ts`) alongside the existing unmount delete.
- `src/pages/BellsMarker.tsx`: add `useChampMarkerHeartbeat` for the match id.
- `src/pages/TournamentMatchLive.tsx` and `src/pages/ClubChampsView.tsx`: label matches with no fresh lock as paused rather than live.
- No database schema change; `champ_marker_locks` already carries everything needed.
