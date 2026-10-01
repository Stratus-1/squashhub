# Diamond League: carry points into the finals as well

## How it works now
- Semi-finals: pool points carry over (166, 164 … as shown). Correct.
- Finals: points reset to zero. Who plays in which final is decided by who won each semi. There is no setting for this, and there wasn't one when the semis were created.

## What the owner wants (confirmed)
- Points keep adding up from the pool weeks through the semis and into the finals. Nothing resets.
- Final pairings come from the running totals after the semis: the top 2 play for 1st/2nd, the next 2 for 3rd/4th, then 5th/6th and 7th/8th.
- Final places 1–8 go by the highest running total (pool + semi + final, bonuses included). A team can lose its final match and still finish higher.

## Changes
1. **New setting in Diamond League setup: "Points in finals"**, with two options: *Carry on (running total)* or *Reset*. New Diamond Leagues default to *Carry on*. Riverside Club DL is set to *Carry on*.
2. **Create finals** (Standings tab and the manager) pairs teams from the "After semi-finals" table when *Carry on* is chosen. The semis already created stay as they are, so no games are touched.
3. **New "After finals (running total)" table**, in the same colour coding, gives the final places 1–8. The wording "points reset for finals" is replaced with "points carry into finals".
4. **Ties in the running total** use the club's saved tie-break order (most ties won, most games won, points difference, head-to-head). No new rules are made up. If teams are still level, they are flagged for the organiser.
5. *Reset* keeps today's behaviour exactly, so other events don't change.

## Technical details
- Add `finalsPoints: "carry" | "reset"` to the Diamond config in `team-league.ts`. Existing saved configs keep `reset` unless an organiser changes them, except Riverside Club DL, which is set to `carry` through its config.
- Add `diamondFinalTiesFromTable(semiTableOrder, courtOf)` next to `diamondFinalTies`. `syncDiamondFixtures` picks one or the other based on the setting.
- In DiamondStandings and TeamLeagueManager, build `finalTable = standings(ids, finalTies, carry = semiTable totals, tieBreaks)`.
- Add tests: pairing by running totals, carried totals deciding places, and the reset path unchanged.
- Preview only. Nothing is published.
