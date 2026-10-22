# Playoffs visible upfront, games created automatically

## Why nothing happened in AABB
The Semifinal and Final were saved in the setup only. The running tournament never received them: they need an extra "Attach planned playoffs" step that nobody is prompted to do. So when Men's A finished its round robin, the tournament had no next stage to start.

## What changes
1. **Playoffs join the running tournament as soon as they are saved.** When you tick Semifinal/Final and set their dates, saving the setup adds them to the running tournament for that category only. Other categories, existing games and results are not touched.
2. **The full bracket shows straight away, below the round robin**, on a separate "Playoffs" section for each category:
   - Semifinal 1: A1 v B2 · play by Sat 14 Nov
   - Semifinal 2: B1 v A2 · play by Sat 14 Nov
   - Final: Winner SF1 v Winner SF2 · Sun 15 Nov 11:00–17:00, Courts 20/21
3. **Names replace the positions automatically.** Once the last round-robin game is played, "A1" becomes the real player's name in the bracket, the fixtures and the standings. The real Semifinal games are then created automatically with the play-by date. After both semis, the Final is created with the winners on its booked date.
4. **Progress line for every category** on Manage running tournament (round robin and playoffs, not just Swiss), e.g. "Men's A · Round robin 12 of 12 played · Semifinals created".
5. **AABB fix:** attach its Men's A playoffs now, so the semis appear (Riverside test tournament only).

## Safety
- If players are level on standings and it changes who qualifies, it stops and asks you instead of guessing.
- Positions are shown on screen only until the names are known. No empty "fake" games are saved, so nobody can book or enter results on a game with no players yet.
- Riverside first, then rollout after you sign off.

## Technical details
- The scoped `attachPlannedPlayoffs` (unit filter) runs from the structure/schedule save via `structured_commit` set_spec, which is append-only (existing stages must stay identical).
- Planned playoff stages get `waitForOrganiser=false` so `autoProgress` starts them once the source stage is decided.
- The bracket display reuses `provisionalPlayoffs()` and resolves labels from final standings via `stageLifecycle`.
- Tests cover scoped attach (other divisions untouched), auto-start after RR completion, tie blocking and placeholder→name resolution.
