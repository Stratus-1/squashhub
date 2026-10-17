# Planned Format (Step 9) redesign: per-category stage plans

Planning only. Nothing is implemented, published or written to any tournament until this plan is approved. Uitsig live data is not touched at any phase without separate approval.

## Goals
- One clean page replaces the current clutter: the tournament Swiss default, estimated vs confirmed rounds, the Swiss-rounds-per-category pilot table, large category exception cards and scattered confirm buttons.
- Each category gets an ordered **stage plan** (Stage 1 → Stage 2 → …). Plan it all upfront, or leave later stages undecided. Edit future stages at any time, including mid-tournament.
- A change to the plan never touches games that already exist. It produces an **impact preview**, and any future draw or schedule change needs its own explicit approval.
- Recommendations are advice only. They are shown beside a choice and never replace a saved decision.

## Proposed layout

```text
+--------------------------------------------------------------------------+
| PLANNED FORMAT                                   [Unsaved changes •]     |
| Starting format for every category                                       |
|  [ Swiss v ]  Rounds [ 5 ]   (Recommended for 12 entrants: 4-5 rounds)   |
+--------------------------------------------------------------------------+
| Category      Entr. Current stage         Rnds Source   Next stage      Status     |
| Men's A1        8   Round robin            7   Override  Shared playoff  Active R3  [Edit]|
| Men's A2        8   Round robin            7   Override  Shared playoff  Active R3  [Edit]|
| Men's B        12   Swiss                  5   Default   Undecided       Active R2  [Edit]|
| Ladies A        6   Swiss                  5   Default   Knockout (top4) Planned    [Edit]|
+--------------------------------------------------------------------------+
| v Men's B - stage plan                                                    |
|  1  Swiss            5 rounds -> ends after R[5]   ACTIVE  R1 done, R2 on |
|     Advances: all continue / top [ ] / positions ...                      |
|  2  (undecided)      [Choose format v]             PLANNED               |
|     [+ Add future stage]                                                 |
|  Impact of unsaved changes: none yet                                     |
+--------------------------------------------------------------------------+
| [Discard]                                   [Save plan]  [Continue ->]   |
+--------------------------------------------------------------------------+
```

- **Starting default**: one row for format plus rounds (rounds only for Swiss, number of pools only for pools). It applies to Stage 1 of every category without its own override.
- **Summary table**: one dense row per category or subcategory, showing entrants, current stage format, rounds, source (Default / Category / Override), planned next stage, status (Planned / Active Rn / Completed) and an Edit button. Shared-playoff groups such as Men's A1/A2 are grouped under their parent, with one shared "Next stage" cell.
- **Stage planner** (one category expanded at a time): stage cards in order. Each card has a format (Swiss, Round robin, Pools, Knockout, Positional playoff, Cross-league where the category allows it), rounds, an advancement rule (all continue / top N / positions per pool / mapping to the shared playoff) and a status badge. Completed stages are read-only. In the active stage, only "ends after round N" can change. Planned stages are fully editable or removable.
- **One Save plan button**: a sticky footer with an unsaved-changes dot, Discard, and Save plan / Continue. Leaving with unsaved edits asks first. Saving creates a new plan version.
- Light-only admin surface, following the existing tournament-admin light hierarchy. All 19 builder steps and their order stay unchanged.

## Changing format mid-tournament (example)
Men's B: Swiss, 5 rounds, now playing Round 4. The organiser edits Stage 1 to "ends after R4" and adds Stage 2 Round robin, top 6.

1. The plan saves as a new version. No games change.
2. The impact preview lists the Round 5 games already drawn or scheduled (and any bookings on them), the "Stage 2 will be drawn from standings after R4" step, and the progression/log changes.
3. A separate **Apply to draw** approval is needed. Only then are not-yet-played Round 5 games withdrawn and their bookings released or kept, as the organiser chooses. Played games are never withdrawn.
4. Stage 2 is drawn later through the existing generator, once Stage 1 is complete.

**Stage boundary vs round pairing:**
- "End after R4" and "add round robin" are stage-plan changes.
- Who plays whom inside a Swiss round stays the pairing engine's job, and nothing on this page changes it.

## Technical plan

### Data model (additive, backward compatible)
- Add `stagePlans: Record<categoryKey, StagePlanItem[]>` to the existing answers / `beta_lifecycle.format_plan`. Each `StagePlanItem` holds:
  - `id`, `kind`, `rounds`, `endAfterRound?`, `pools?`
  - `advance` (mode, topN, perPool, mapping ref)
  - `sharedWith?` (parent key, for A1/A2 playoffs)
  - `decided: boolean`
- Read compatibility: when `stagePlans[key]` is missing, derive Stage 1 from the existing `format`/`formatOverrides` (`swissRoundsConfirmed` ?? `swissRounds`), and later stages from the existing `stages`/`playoff`/`playoffOverrides`. Old drafts and saved tournaments open unchanged.
- Write compatibility (transitional): on save, also write Stage 1 back into `format`/`formatOverrides`. This keeps `step-draw.ts`, the Swiss progression view and the existing tests reading the same values. Retire the old keys only after phase 4.
- Active and completed state is **derived** from the generated `tournament_stages.status`, `club_champs_rounds` and the fixtures, never stored on the plan, so there is one truth.
- New table `tournament_plan_versions` (tournament_id, version, plan jsonb, created_by, created_at, applied_at null), with grants, RLS for club tournament admins only, and a club-scoped `tournament_id`. It provides "Saved vs applied" and the audit trail, in line with the confirmed Final Setup Version rule.

### Logic (pure, in `src/lib/smart-builder/stage-plan.ts`, reusing `contract.ts`)
- `resolveStagePlan(answers, key)`: the effective sequence plus the source of each value.
- `deriveStatus(plan, stages, rounds, fixtures)`: Planned / Active Rn / Completed for each stage.
- `validateStagePlan(...)`, reusing the `contract.ts` rules:
  - A stage's kind is fixed once generated, so ending early means "close it and add a new stage", never converting it.
  - Nothing after a knockout except qualifiers.
  - Qualifier counts must fit the next stage.
  - `endAfterRound` must not be below the highest round already played.
- `planImpact(oldPlan, newPlan, fixtures, bookings)`: games to withdraw (unplayed only), bookings affected, stages to draw later, and progression changes. It is display-only.
- `applyPlanVersion(...)`: one server function (RPC) that runs atomically and idempotently for each version. It re-checks played results, withdraws only the listed unplayed fixtures, records `applied_at`, and writes audit events. Withdrawn fixtures are marked, not deleted, so IDs survive.

### Consumers (no duplicate settings)
- The Progression & Log grouped block (`ParentCategoryProgression`, `RoundRobinPilotView`, the Swiss view) reads round counts and the next stage from `resolveStagePlan`, replacing the old saved copies. This removes the stale "Round 6" class of bug.
- The A1/A2 shared playoff placeholders come from `advance.mapping` on the shared stage.
- Upcoming Fixtures and scheduling (`formal-stage-schedule.ts`, `round-scheduling.ts`) read stage rounds and play-by dates from the same resolver.
- `step-draw.ts` builds `PlannedStage[]` from the resolved plan instead of `format` plus `playoff`.

### Edge cases
- A category with no entrants yet: rounds are shown as a recommendation only.
- Entrants change after the plan is saved: a warning appears, nothing changes automatically.
- `endAfterRound` set while the current round is half played: the change is blocked until that round is done, or the organiser picks "after R(n+1)".
- Byes, odd numbers, walkovers: the standings snapshot uses the existing standard tie-breaks.
- The shared playoff when one subgroup changes format: the mapping is re-validated and blocked if positions no longer exist.
- Two admins saving at once: a version check rejects the stale save and shows the newer version.
- Removing a planned stage that is already referenced by a shared playoff: blocked, with an explanation.
- Undecided later stages: progression shows "Next stage: undecided" and Continue is still allowed. Generating that stage's draw is blocked until it is decided.

### Tests
- Unit tests for the resolver, status derivation, validation (each `contract.ts` rule), the impact diff and backward-compatible reading of old answers.
- An apply test: played results, standings, bookings and IDs are unchanged; idempotent re-apply; a stale version is rejected.
- A component test for the page: unsaved indicator, Discard, the leave guard, one category expanded at a time.
- A regression test that Progression & Log shows the same rounds as the plan (Round 6 case) and that A1/A2 placeholders are unchanged.
- Run the existing tournament suites in full.

## Phased rollout
1. **Read-only preview** (Riverside, flag-gated): the new page renders from existing data and saves nothing. Synthetic Riverside tournament only.
2. **Save plan** (Riverside): stage plans, versions and the transitional write-back. Consumers switch to the resolver.
3. **Mid-tournament changes** (Riverside synthetic E2E): impact preview plus the separate Apply approval, then sign-off.
4. **Pilot** with Uitsig, only with your separate approval, starting read-only. Then roll out to all clubs and retire the old Swiss pilot table and exception cards.

## Blockers and open decisions
- **Bookings on withdrawn games:** when an applied change withdraws scheduled games, should their court bookings be released by default or kept? The proposal is that the organiser chooses each time, with "keep" as the default.
- **Cross-league stage:** only shown where the category already has league sources, so it is not available for every category.
- **Stopping Swiss early:** the engine currently has no "close a Swiss stage early" operation. It is a new server function in phase 3, so mid-tournament changes cannot go live before then.
- **Pilot timing:** Uitsig's current Men's A1/A2 shared Final still lacks a qualification rule. The new planner would let the organiser set it, but setting it is a live decision that needs your approval.
