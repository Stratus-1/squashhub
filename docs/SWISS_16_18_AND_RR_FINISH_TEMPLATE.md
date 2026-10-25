# Swiss Pairing Templates — 18 and 16 Players, 5 Rounds + Round-Robin Finish Option (Final)

Status: **FINAL TEMPLATE** — approved per the Uitsig/Riverside model, frozen 25 Oct 2026.
Change only with explicit owner approval; any change must update this document, the code model and the tests together.

Companion documents: `docs/SWISS_24_PLAYER_TEMPLATE.md` (24-player model), `docs/TOURNAMENT_VIEW_TEMPLATES.md` (progression / standings / play-off views).

## Source of truth

- Models: `src/lib/tournaments/swiss-no-repeat.ts` — `SWISS_HALF_MODELS["18:10"]`, `["18:8"]`, `["16:8"]`, `preferredSwissTemplate(...)`, `strictSwissPlan(...)`, `swissHalves(...)`.
- Round 1–2 base shape: `src/lib/tournaments/swiss-positional.ts` — `slotTemplate(n, round)` (fold; winners/losers halves folded).
- Round-robin finish: `src/lib/tournaments/swiss-rr-finish.ts` — `RR_GROUP_SCHEDULE`, `rrFinishSplit`, `rrFinishRound`, `rrFinishIssues`, `TEN_REMAINDER_CHART`, `hybridSwissTable`; standings in `src/lib/tournaments/swiss-rr-standings.ts` — `rrFinishStandings`.
- Tests: `src/test/swiss-no-repeat.test.ts`, `src/test/swiss-rr-finish.test.ts` (28 tests, all passing 25 Oct 2026).

## Shared rules (both field sizes)

- Entrants seeded 1 (strongest) to N. **Positions = current standings after each completed round** — position numbers below always mean *current position*, never seed. A player never owns a position; the winner takes the better slot of each pair.
- 5 rounds, no byes (even fields). Games per round: 18 → 9 (45 total), 16 → 8 (40 total).
- The field splits into two halves that **never mix** from the split round onwards.
- **18 players: halves are uneven — top 10 (positions 1–10) and bottom 8 (positions 11–18).** Because the halves are uneven they split early: fixed half pairings and no-repeat repair apply **from Round 2** (`swissStrictFromRound(18) = 2`).
- **16 players: halves are even — 8 and 8.** Fixed half pairings and no-repeat repair apply **from Round 3** (`SWISS_NO_REPEAT_FROM_ROUND = 3`); Round 2 uses the standard winners-half/losers-half fold, which is the same mirror-within-halves shape.
- **No position pair repeats** across Rounds 1–5 (verified by test).
- **No actual-opponent repeats**: if the players currently occupying paired positions have already met, `strictSwissPlan` repairs the unsaved round by swapping within the same half only. Saved/locked games are never rewritten. If no legal pairing exists the round fails closed with an explicit message — it never silently repeats opponents.
- **Existing Uitsig tournaments are frozen**: these templates apply only to new tournaments that opt in prospectively (`swiss-sequencing-policy.ts`); saved fixtures are never regenerated.

## 18-player model (top 10 / bottom 8)

### Round 1 — full fold (seed order), whole field

1v18, 2v17, 3v16, 4v15, 5v14, 6v13, 7v12, 8v11, 9v10.

### Round 2 — mirror within each half (halves split here)

| Top half (1–10) | Bottom half (11–18) |
|---|---|
| 1 v 10 | 11 v 18 |
| 2 v 9 | 12 v 17 |
| 3 v 8 | 13 v 16 |
| 4 v 7 | 14 v 15 |
| 5 v 6 | |

### Round 3

| Top half (1–10) — `18:10` | Bottom half (11–18) — `18:8` |
|---|---|
| 1 v 5 | 11 v 14 |
| 2 v 6 | 12 v 13 |
| 3 v 7 | 15 v 18 |
| 4 v 8 | 16 v 17 |
| 9 v 10 | |

### Round 4

| Top half (1–10) | Bottom half (11–18) |
|---|---|
| 1 v 3 | 11 v 13 |
| 2 v 4 | 12 v 14 |
| 5 v 7 | 15 v 17 |
| 6 v 9 | 16 v 18 |
| 8 v 10 | |

### Round 5 — final neighbours (adjusted so no position pair repeats)

| Top half (1–10) | Bottom half (11–18) |
|---|---|
| 1 v 2 | 11 v 12 |
| 3 v 4 | 13 v 14 |
| 5 v 8 | 15 v 16 |
| 6 v 10 | 17 v 18 |
| 7 v 9 | |

## 16-player model (halves of 8)

### Round 1 — full fold (seed order), whole field

1v16, 2v15, 3v14, 4v13, 5v12, 6v11, 7v10, 8v9.

### Round 2 — mirror within each half

| Top half (1–8) | Bottom half (9–16) |
|---|---|
| 1 v 8 | 9 v 16 |
| 2 v 7 | 10 v 15 |
| 3 v 6 | 11 v 14 |
| 4 v 5 | 12 v 13 |

### Round 3

| Top half (1–8) | Bottom half (9–16) |
|---|---|
| 1 v 4 | 9 v 12 |
| 2 v 3 | 10 v 11 |
| 5 v 8 | 13 v 16 |
| 6 v 7 | 14 v 15 |

### Round 4

| Top half (1–8) | Bottom half (9–16) |
|---|---|
| 1 v 3 | 9 v 11 |
| 2 v 4 | 10 v 12 |
| 5 v 7 | 13 v 15 |
| 6 v 8 | 14 v 16 |

### Round 5 — final neighbours

| Top half (1–8) | Bottom half (9–16) |
|---|---|
| 1 v 2 | 9 v 10 |
| 3 v 4 | 11 v 12 |
| 5 v 6 | 13 v 14 |
| 7 v 8 | 15 v 16 |

## Round-robin finish option (Swiss Rounds 1–2, then groups of 4 for Rounds 3–5)

The "round robin in the final 3 rounds" combination, built on the Swiss models above. **Off by default** — with the toggle off none of this runs; it is a per-category opt-in (Riverside pilot).

### Structure

1. Requires **exactly 5 Swiss rounds**.
2. Rounds 1–2 are normal Swiss (the models above).
3. After Round 2 the standings are **frozen as a snapshot** (recomputed only from Rounds 1–2 results, which are final by then — it never moves).
4. Snapshot positions **1–4, 5–8, 9–12, …** — as many groups of 4 as the organiser chose — play a **full round robin** in Rounds 3–5 on fixed pairing positions. Everyone else (the remainder) carries on Swiss among themselves.
5. Standings stay cumulative, but the hybrid table keeps the grouped players in their frozen position block and ranks the remainder independently; qualifying (Round 1–2) opponents' points are frozen at Round 2 so later round-robin results can never change the Swiss cohort's tie-breaks.

### Fixed group-of-4 schedule (every pair meets exactly once)

| Round | Game 1 | Game 2 |
|---|---|---|
| 3 | 1 v 4 | 2 v 3 |
| 4 | 1 v 3 | 2 v 4 |
| 5 | 1 v 2 | 3 v 4 |

Group numbers are positions within the group taken from the frozen Round 2 snapshot. Pairing positions inside a group never change; the rank inside each group is recalculated from round-robin games only, using the tournament's own tie-break order. Fully tied players share the same rank number.

### Feasible group counts (`rrFinishIssues`)

The remainder must never be 1, 2 or 3 players (too few to Swiss for three rounds without repeats).

| Field | 1 group | 2 groups | 3 groups | 4 groups |
|---|---|---|---|---|
| 18 players | rest 14 ✓ | rest 10 ✓ (approved 10-player chart below) | rest 6 ✓ | rest 2 ✗ |
| 16 players | rest 12 ✓ | rest 8 ✓ | rest 4 ✓ | rest 0 ✓ (everyone in groups) |

### Approved 10-player remainder chart (`TEN_REMAINDER_CHART`)

Used when 18 players run 2 groups of 4, leaving 10 on Swiss. Fixed-position chart (local slots 1–10 from the post-Round-2 order); no position pair repeats; neighbours meet only in the final round. Remainder slots advance by winner-takes-the-better-slot of each chart pair.

| Round | Pairs |
|---|---|
| 3 | 1v6, 2v7, 3v8, 4v9, 5v10 |
| 4 | 1v3, 2v5, 4v6, 7v9, 8v10 |
| 5 | 1v2, 3v4, 5v6, 7v8, 9v10 |

### Invariants

1. The Round 2 snapshot is frozen; group membership and pairing positions never change.
2. A round-robin game that repeats a Round 1–2 pairing is **allowed but surfaced as a warning** (`rrFinishRepeats`) — a round robin cannot always avoid them.
3. Round-robin results never alter the Swiss remainder's tie-breaks, and Swiss results never alter group ranks.
4. The option refuses invalid setups up front: wrong round count, fewer than one group, or a remainder of 1–3 players.
5. Display stays honest: group standings show pairing position and live rank separately; provisional groups may be shown before Round 2 ends but are always labelled provisional, with no bookings or notices generated from them.
