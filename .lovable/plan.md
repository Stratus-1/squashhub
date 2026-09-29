# Diamond League in the normal tournament setup (team format)

## What the email actually describes
It is a **team competition**, not individuals:
- 48 players → organiser makes **8 teams of 6**, players numbered 1–6 by strength (men and women together).
- Teams split into **Pool A and Pool B** (4 teams each). The email says "pools"; you called them "divisions" — same thing here.
- Every meeting between two teams (a "tie") is always the same: **6 singles** (20 min, points, order #6 → #1), then **3 doubles** (30 min, points, pairs 5+6, 3+4, 1+2, same order).
- Tie result = total points of all 9 games; the winning team gets **+5 bonus**.
- Weeks 1–3: round robin inside each pool (A1vA4 & A2vA3 / A1vA2 & A3vA4 / A1vA3 & A2vA4). Pool ranking = points added up over 3 weeks.
- Week 4 semis (crossover): A1vB2, A2vB1, A3vB4, A4vB3. **Points carry forward** from the pools.
- Week 5 finals: **points reset**, straight shoot-out: W1vW2 (1st/2nd), L1vL2 (3rd/4th), W3vW4 (5th/6th), L3vL4 (7th/8th).
- Start 17:45, finish 21:15, every Wednesday.

The current "Diamond League" template is wrong for this (it runs an individual singles round robin then pairs players up). It will be replaced.

## What the organiser will do on Monday 5 October
1. Open normal Tournaments → new tournament → pick **Diamond League (teams)**.
2. Enter the 8 team names and drop each team's 6 players into slots #1–#6 (the teams are his, the app never reshuffles them), and put 4 teams in Pool A, 4 in Pool B.
3. Pick the 5 Wednesdays and courts. The app creates the first 3 weeks' ties with all 9 games in the fixed order, timed from 17:45.
4. Send out teams + schedule for weeks 1–3.
5. After week 3, the app ranks each pool and creates the crossover semis. After week 4, it creates the four placing finals.

## What players and markers see
- Each tie shows the 9 games in playing order; markers score each game on points as today (timed Bells-style scoring).
- Tie card: running team points, winner, +5 bonus.
- Pool table: team, ties played, points, bonus, total. Semi table shows carried + semi points. Final result = places 1–8 by team.

## Needs your confirmation (nothing invented)
1. **Draws:** if a tie ends level on points, does anyone get the +5 (split, none)?
2. **Pool / semi tie-break:** if two teams finish on equal total points, what decides it?
3. **Finals:** a level final on points — how is it decided?
4. **Courts:** how many courts per night? (9 games × 2 ties = 18 games in 3.5 hours.)
5. **Absent player:** is a substitute allowed, or is that game forfeited (and for how many points)?

## Technical details
- Reuse the existing team-tie model rather than a new engine: tournament entrant units become **teams** with ordered roster slots; each tie expands into rubbers from a fixed `tieFormat` (6 singles by position desc, 3 doubles pairs [5,6],[3,4],[1,2]) — same data shape as `Stage.tieFormat` in `smart-builder/ties.ts`.
- Stages: `pool_rr` (2 pools, fixed round pairings from the email) → `crossover` mapping (A1-B2, A2-B1, A3-B4, A4-B3) with `standings: carry` → `placement_finals` (W/L of semis, `standings: reset`), via the existing `StageMapping` in `tournaments/mapping.ts` and progression in `progression.ts`.
- Team standings: sum of rubber points + tie bonus (5, confirmed); tie-breaks left unset until you answer → progression blocks with a plain message instead of guessing.
- Replace `DIAMOND_LEAGUE_PRESET` in `presets.ts`; update `tournament-presets.test.ts`; add tests for tie expansion (9 games, order), pool round pairings, crossover mapping, carry vs reset, 1–8 placings.
- Scoring uses existing `time_capped_points` (20/30 min caps).
- Docs: `TOURNAMENT_ENGINE_INTEGRITY.md`, issue log. Preview only, not published.
