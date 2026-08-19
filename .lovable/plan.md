# Live tournament games: watch live, and hand over marking safely

## What you reported
1. Tapping the red **LIVE 6-10** chip on a tournament game opens the tournament standings page, not the live game.
2. Tapping **Mark** on a game that is already being scored opens a scoreboard at 0-0 instead of the running score.
3. Marking should stay protected: anyone may mark, but a second person must ask to **take over**, and the current marker confirms the hand-over. Everyone else should still be able to *watch* live.

## What the code does today (confirmed)
- On the Tournament Games list the whole card (including the LIVE chip) is one button that navigates to `/club-champs/<tournament id>` — the tournament/standings screen. There is no per-game live view for tournament matches at all, so nothing else could happen.
- **Mark** opens the marker with `?source=tournament&matchId=…`. If the game is already `in_progress` and the device's local storage does not hold that match's marker config, the marker shows "This match is already being marked" and bounces back to the fixtures list. There is no take-over option.
- The only "who is marking" record that exists today is `league_marker_locks`, used by league fixtures (with heartbeat, soft lock, "Take over?" confirm, and auto-bump of the previous marker). Tournament matches have no equivalent — ownership is decided purely by browser local storage, so the same person on another phone/browser is treated as an intruder, and a person who cleared their cache is locked out of their own match.
- The live score shown on the card comes from `side_a_points`/`side_b_points` on the match row; those are reset to 0-0 each time a game finishes, and the finished game moves into `game_scores.sets`.

The exact reason your reopened marker showed 0-0 is not yet proven (no game is live right now to inspect). It is either the bounce path above or a game-boundary state where the DB genuinely held 0-0. Step 1 of the work is to reproduce it against a live game and confirm before touching the restore logic.

## What will be built

### 1. Watch-live view for tournament games
- The LIVE chip becomes its own tap target: it opens a read-only live scoreboard for that match (current game score, games won, completed game scores, court, player names), updating in real time.
- The rest of the card keeps its current behaviour (opens the tournament).
- Nothing about scoring changes for spectators — it is view only.

### 2. Marker presence and hand-over for tournament games
Mirroring the league behaviour that already works, extended with an explicit hand-over:
- While someone marks a tournament game, a lock row with a 20s heartbeat records who is marking.
- If you press **Mark** and nobody holds a fresh lock, you mark as normal — with the running score restored from the database (completed games plus the current rally).
- If someone else holds a fresh lock, you get a choice instead of being bounced: **Watch live** or **Ask to take over**.
- A take-over request notifies the current marker in their marker screen: "<Name> asks to take over marking. Hand over?" — Yes hands over (they drop to the live view), No declines and the requester is told.
- Safety valves: if the current marker does not answer within 60 seconds, or their heartbeat goes stale (phone locked, app closed, >60s), the requester may take over anyway; a club admin can always force a take-over.
- On hand-over the incoming marker starts from the live database score, never from 0-0.

### 3. Score restore correctness
- Verify and, if needed, fix the reopen path so the marker always rebuilds from the database score (finished games plus the in-progress rally) rather than showing 0-0, including at game boundaries.

## Technical notes
- New table `champ_marker_locks` (match_id PK, user_id, user_name, heartbeat_at, plus `takeover_requested_by`/`_name`/`_at`) with GRANTs and RLS scoped to club members of the tournament's club; realtime enabled. Modelled on `league_marker_locks` so behaviour matches.
- New hook `use-champ-marker-lock` (acquire, heartbeat, release, observe, request/approve take-over) and a lightweight `use-champ-live-match` subscription on `club_champs_matches` for the watch view.
- `src/pages/Tournaments.tsx`: LIVE chip becomes a separate button routing to the new live view; the Mark button consults the lock before navigating.
- `src/pages/MatchMarker.tsx`: the local-storage "spectator gate" is replaced by the lock check plus the hand-over prompt; existing restore from `parseTournamentScores` stays and is covered by the verification step.
- Bells marker (`/bells-marker/:matchId`) gets the same lock and watch entry points so both tournament formats behave alike.
- No changes to standings, scheduling, results submission, ranking points or league marking.

## Rollout
Build behind normal use: lock table first, then watch-live view, then hand-over. If anything misbehaves on a live night, the Mark button falls back to today's behaviour (open marker) rather than blocking scoring.
