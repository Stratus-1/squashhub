# Swiss Pairing Template — 24 Players, 5 Rounds (Final)

Status: **FINAL TEMPLATE** — approved per the Uitsig model, frozen 25 Oct 2026.
Change only with explicit owner approval; any change must update this document, the code model and the tests together.

Companion document: `docs/TOURNAMENT_VIEW_TEMPLATES.md` (progression / standings / play-off views).

## Source of truth

- Model: `src/lib/tournaments/swiss-no-repeat.ts` — `SWISS_HALF_MODELS["24:12"]`, `preferredSwissTemplate(24, round)`, `strictSwissPlan(...)`.
- Round 1–2 base shape: `src/lib/tournaments/swiss-positional.ts` — `slotTemplate(24, round)`.
- Tests: `src/test/swiss-no-repeat.test.ts` (also 18- and 16-player models), `src/test/swiss-positional-draw.test.ts`, `src/test/swiss-preview-finals.test.ts`.

## Field structure

- 24 entrants, seeded 1 (strongest) to 24.
- Two halves of 12: **top half = positions 1–12, bottom half = positions 13–24** (bottom = top + 12).
- From Round 3 the halves **never mix**; every game is within one half.
- Positions = current standings after each completed round. Position numbers in the tables below always mean *current position*, not seed.
- 5 rounds, 12 games per round, 60 games total. No byes (even field).

## Approved position pairings

This is a **positional placing** system: the field is placed into a **top half and a bottom half** by current standing, and positions **rotate** each round to rank players effectively within the limited number of rounds.

### Round 1 — positional placing across the whole field (seed order)

1v24, 2v23, 3v22, 4v21, 5v20, 6v19, 7v18, 8v17, 9v16, 10v15, 11v14, 12v13.

Round 1 places the strongest seed against the weakest across the whole field; the halves split from Round 2.

### Round 2 — positional placing within each half

| Top half (1–12) | Bottom half (13–24) |
|---|---|
| 1 v 12 | 13 v 24 |
| 2 v 11 | 14 v 23 |
| 3 v 10 | 15 v 22 |
| 4 v 9 | 16 v 21 |
| 5 v 8 | 17 v 20 |
| 6 v 7 | 18 v 19 |

### Round 3 — rotation of positions within each half

| Top half (1–12) | Bottom half (13–24) |
|---|---|
| 1 v 6 | 13 v 18 |
| 2 v 5 | 14 v 17 |
| 3 v 4 | 15 v 16 |
| 7 v 12 | 19 v 24 |
| 8 v 11 | 20 v 23 |
| 9 v 10 | 21 v 22 |

### Round 4 — rotation of positions within each half

| Top half (1–12) | Bottom half (13–24) |
|---|---|
| 1 v 3 | 13 v 15 |
| 2 v 4 | 14 v 16 |
| 5 v 7 | 17 v 19 |
| 6 v 8 | 18 v 20 |
| 9 v 11 | 21 v 23 |
| 10 v 12 | 22 v 24 |

### Round 5 — final positional placing (adjusted)

| Top half (1–12) | Bottom half (13–24) |
|---|---|
| 1 v 2 | 13 v 14 |
| 3 v 5 | 15 v 17 |
| 4 v 6 | 16 v 18 |
| 7 v 8 | 19 v 20 |
| 9 v 12 | 21 v 24 |
| 10 v 11 | 22 v 23 |

Note: Round 5 is the plain adjacent pattern (1v2, 3v4, 5v6, 7v8, 9v10, 11v12) **adjusted** so that no position pair repeats an earlier round — 3v4 became 3v5/4v6, and 9v10 became 9v12/10v11.

## Invariants

1. **No position pair repeats** across Rounds 1–5 (verified by test: all 60 pair keys unique).
2. **No actual-opponent repeats**: if the two players currently occupying paired positions have already met, the strict solver (`strictSwissPlan`) repairs the unsaved round — swapping within the same half only. Saved/locked games are never rewritten.
3. **Halves never mix** from Round 3; rematch repairs stay inside the half.
4. **Rounds 1–2 are preserved** exactly once played; no-repeat repair applies from Round 3 (`SWISS_NO_REPEAT_FROM_ROUND = 3` for even halves).
5. **Fail closed**: if no complete legal pairing exists, the round reports "no pairing without repeat opponents exists" and stops — it never silently repeats opponents.
6. **Saved games always win**: confirmed games stay fixed; only unsaved slots are re-paired around them.
7. **Existing Uitsig tournaments are frozen**: this template applies only to new tournaments that opt in prospectively (see `swiss-sequencing-policy.ts`); saved Uitsig fixtures are never regenerated.
8. Position numbers are display/ordering slots — a player never "owns" a position; occupants change as results arrive (winner takes the better slot).

## Related approved models

- **18 players**: top 10 / bottom 8, strict from Round 2 — `SWISS_HALF_MODELS["18:10"]` and `["18:8"]`.
- **16 players**: halves of 8 — `SWISS_HALF_MODELS["16:8"]`.
- Other even field sizes: same halves rule with the generic round-gap formula (`swissRoundGap`: R3 = half−1, R4 = half, R5 = half−2).
