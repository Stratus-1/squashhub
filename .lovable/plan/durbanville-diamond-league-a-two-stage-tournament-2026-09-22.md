# Durbanville "Diamond League" — a two-stage tournament

Trevor's event is a tournament, not a league, so everything below is built into the existing tournament setup (divisions, timed scoring, pools, winner scope) — nothing changes for leagues.

## What Durbanville run

- Six players in a group, ordered 1 to 6.
- Stage 1: everyone plays singles, 20 minutes on the clock.
- Stage 2, after the singles are done: doubles, paired 6+5, 4+3, 2+1, 30 minutes (shorter for the weaker groups).
- Winner per group today; possibly a cross-group decider later.

## What already works

- Two divisions in one tournament, one set to singles and one to doubles.
- Timed "play to the bell" scoring with points-scored standings, with the minutes set per division and a break allowance.
- Pools, seeded ordering, and the choice between one winner per pool and one winner per division.

## The three things missing

### 1. Does stage 2 wait for stage 1?

New setting on each division: **runs alongside the others** (today's behaviour) or **runs after** a chosen division. When it runs after, the doubles division stays closed — no fixtures, no scores — until the singles division is complete, and it then opens automatically with the finishing order carried across.

### 2. How the doubles pairs are formed

New setting on a doubles division that follows another one: **how to pair the finishing order**.

- **Adjacent** — neighbours in the order: 6+5, 4+3, 2+1. This is Durbanville's way, and it's the default.
- **Balanced** — strongest with weakest: 1+6, 2+5, 3+4.
- **Manual** — the organiser drags the pairs together.

("Snake" is the name we already use for spreading players across pools, so it isn't reused here.)

Pairs are shown for approval before the doubles fixtures are created, so a late substitution can be corrected.

### 3. Minutes per pair, not just per division

The clock is already set per division. Add an optional per-pool override inside a division, so the top group's doubles can run 30 minutes while a weaker group runs 20.

## Setup preset

A **Diamond League** button in tournament setup fills it all in: Stage 1 singles round-robin, 20 minutes, timed scoring; Stage 2 doubles round-robin that follows Stage 1, adjacent pairing, 30 minutes; winner per pool.

## Technical notes

- `tournaments` gains `division_follows` (JSON: group_number -> group_number it waits for), `division_pairing_method` (JSON: group_number -> `adjacent` | `balanced` | `manual`), and `pool_durations` (JSON: `"group:pool"` -> minutes) alongside the existing `group_durations`.
- New `src/lib/tournaments/stage-sequence.ts`: division ordering, "is this division unlocked yet", and `pairFromOrder(order, method)` producing the pair list; unit-tested for 6, 8 and odd counts.
- Doubles fixtures are generated from the preceding division's final standings order (existing standings aggregation), written as `champ_doubles_pairs` plus `club_champs_matches`, so live marking, results and standings work unchanged.
- The Bells time-cap resolver gains the per-pool lookup before falling back to per-division and tournament defaults.
- Draw generation for a locked division is blocked with a clear reason ("Stage 1 must finish first") rather than hidden, so organisers understand the gate.

## Not included

Cross-group deciders stay as they are today — the existing "one winner per division" setting already meets that if Durbanville later want the group winners to meet.
