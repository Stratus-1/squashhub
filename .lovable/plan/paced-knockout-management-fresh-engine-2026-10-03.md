# Paced knockout management (fresh engine)

## What you will get
- **Builder (setup only):** a knockout category gets two new choices: **Knockout pace** (Paced across the rounds / Immediate) and **Pairing strategy** (Progressive closer-ranked / Traditional seeded 1v8, 2v7…). It no longer gets round-robin round counts or "this matchup needs N rounds" messages.
- **Manage Tournament, new "Knockout rounds" panel** for each knockout league, week by week:
  - Active players (still in), eliminated players (and the round they lost), byes shown as "through, still active".
  - Target milestone (e.g. Quarter-finals by 14 Nov) and **eliminations still needed**.
  - **On track / At risk** badge, with plain warnings such as "3 matches must now be completed in Round 3 to reach the Semi-finals on 21 Nov."
  - **Proposed fixtures for the current round only**, built from pace + pairing strategy. The admin can swap players, remove a match (that player stays active) or add one, then **Confirm fixtures**.
  - After results come in (or a round is postponed), everything recalculates. No future fixtures are ever created that assume a winner.
- The existing draw screens move under Manage Tournament. The Builder keeps design only.

## How pacing works
- Inputs: active players now, the milestone field size (8 for QF, 4 for SF, 2 for Final), and the scheduling rounds left before that milestone.
- Eliminations needed = active − milestone size. **Paced:** spread evenly over the remaining rounds (more early if uneven), e.g. 9 players → 8 for QF with 3 rounds left = 1 match in Round 1, others wait. **Immediate:** as many matches as the active field allows each round (normal halving).
- A round can never have more matches than active players ÷ 2. If the remaining need exceeds what the remaining rounds allow, the panel shows At risk with the exact number required.
- Odd counts: the unpaired player gets a bye and stays active. A bye never counts as an elimination.

## Shared vs own semi-final/final (unchanged setting)
- Uses the existing Club Champs "Stages & scheduling" setup as it is today: a league that falls under the shared playoff stages ("All categories (common date)", with playoff sync on) takes its milestone dates from those shared stages, and earlier rounds are paced to reach them.
- A league that has its own playoff stages (stage set to that category, or sync off) paces against its own dates, or runs freely if it has none.
- No new global rule is added.

## Safety
- Diamond League, pools, round robin, Swiss, cross-league and legacy tournaments are untouched (panel only shows for knockout categories, never for Diamond).
- Confirming fixtures only creates rows for the current round through the existing match-creation path (same rows as today's next-round draw), so marking, results, standings and emails keep working.
- Played or scored matches are never changed. Pace, strategy and any edited pairings are stored on the tournament's existing Beta settings (no schema change).
- Nothing is published.

## Assumptions (please correct if wrong)
1. "The existing per-league option" = the shared-vs-per-category playoff stage choice in Stages & scheduling described above.
2. Defaults: Paced + Progressive for new knockout categories. Existing tournaments behave as Immediate + Traditional so nothing already running changes.
3. "Progressive" pairs neighbouring ranks from the bottom up (e.g. 8v9 first when only one match is needed), so the strongest players are spared early.

## Technical details
- New pure module `src/lib/tournaments/paced-knockout.ts`: `activeField(matches, group)` (re-using `active-draw.ts` elimination rules), `milestoneFor(category, plan)` (resolving shared vs own stage dates through `round-plan.ts` / `stage-schedule.ts`), `pacePlan({active, target, roundsLeft, pace})` → matches per round + risk, `proposePairings(active, ranks, strategy, count)` → pairs + byes.
- Tests in `src/test/paced-knockout.test.ts`: pacing (9→8, 12→8, 20→8), immediate mode, odd fields/byes, both pairing strategies, risk warnings after a postponed round, shared vs own milestone resolution.
- Builder: `FormatPlan` gains `koPace` and `koPairing` (device-local answers, persisted to `beta_lifecycle.format_plan`); `step-draw.ts` skips `roundShortfall`/`roundDeadlines` round-count errors for knockout and makes the knockout stage create only the first paced round.
- Manage: new `StepKnockoutRoundsPanel.tsx` inside `StepTournamentManagement` / run overview; confirm writes via the existing `ConfirmDrawDialog` insert path; refuses if any match in that round already has a result.
- Record the rule in `src/components/smart-builder/AGENTS.md`; log in the issue log.
