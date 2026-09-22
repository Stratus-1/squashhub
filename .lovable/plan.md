# Durbanville "Diamond League" — timed singles then paired doubles

## What Trevor described

- Teams of 6 players, ranked 1 to 6.
- Round 1: all six play a singles game, 20 minutes each (clock, not best-of-games).
- Round 2: the same six play doubles as fixed pairs taken from the order — 6+5, 4+3, 2+1.
- Doubles games are timed too, and the time differs by strength: weaker pairs 20 minutes, stronger pairs 30 minutes.

## Can SquashHub run it today?

Almost. Three pieces exist already:

- Team leagues that mix singles and doubles rubbers in one fixture (hybrid).
- Timed, "play until the bell" scoring with standings ranked on points scored (used by the Bells format).
- Fixtures, scorecards, live marking, standings and history.

Three pieces are missing, and this plan adds them.

## What gets built

### 1. A timed league option

A league can be set to timed scoring instead of best-of-games. Each rubber is played to a clock and the score recorded is points scored by each side. Standings then rank on points, exactly like Bells.

### 2. Per-rubber clock times

New settings on the league: minutes for singles rubbers and minutes for doubles rubbers, plus an optional override per position (so Doubles 1 can be 30 minutes while Doubles 3 is 20). Shown on the scorecard and used by the marker's countdown.

### 3. Pairs taken from the team order

A new pairing option, "Paired from the team order", which automatically builds doubles from the ranked six: 6+5, 4+3, 2+1. The captain still sees the pairs and can adjust before the fixture if a substitute comes in.

### 4. Setup preset

In league setup, a "Diamond League" preset that fills all of it in one tap: team of 6, six singles rubbers at 20 minutes, three doubles rubbers paired from the order at 30 minutes, timed scoring.

## Technical notes

- `league_rules` gains: `scoring_clock` (`games` | `timed`), `singles_minutes`, `doubles_minutes`, `rubber_minutes` (JSON per position override); `pairing_policy` gains a `ladder_pairs` value.
- `resolveFormat` / `rubberSlots` in `src/lib/leagues/format.ts` carry the clock minutes per slot; a new `ladderPairs()` helper derives 6+5 / 4+3 / 2+1 from team positions.
- Timed rubbers reuse the existing Bells marker and its time-cap resolution; league standings read points-scored aggregation when `scoring_clock = 'timed'`.
- Tests: pairing derivation, per-position minutes resolution, and timed standings aggregation.

## Out of scope

No change to existing singles leagues, NSA fixtures or any club's current scoring — every new setting defaults to today's behaviour.
