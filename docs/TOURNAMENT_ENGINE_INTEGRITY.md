# Tournament Engine Integrity Rules

Two layers:

1. **Engine / integrity layer** (`src/lib/tournaments/contract.ts`, plus existing `round-control.ts`, `final-standings.ts`, `preserve-schedules.ts`, DB guards) — deterministic and strict.
2. **Smart Builder BETA** (`src/lib/smart-builder/*`) — advisory. It gathers intent and produces a specification. It may recommend; it never silently changes tournament logic.

## Contract (must be resolved before fixtures are generated)

Per division: unit (players/pairs) and expected count; seeding source and method; an ordered stage plan. Per stage: kind (round robin / pools / knockout / Swiss / placement), pool count and size, Swiss round count, and schedule rule **FIXED** (date), **PLAY-BY** (deadline) or **WINDOW** (start+end). A deadline is never treated as a match date. Playoff stages also need: qualifiers per pool, a mapping rule (`cross_pool`, `reseed`, `same_pool`), generation mode (`automatic` / `owner_approval`, default owner approval) and scheduling mode. Placement: champion only or all positions.

`contractIssues()` returns errors for anything unresolved; errors block generation. The builder surfaces the same rules via `engineContractIssues()` in `validate.ts`.

## Must never happen (guarded + tested in `src/test/tournament-engine-integrity.test.ts`)

- Future stage created before its prerequisites complete (unless placeholders are explicitly allowed) — `canGenerateStage`.
- Knockout/playoff turned into round robin — `assertStageKinds`, `assertKnockoutShape`; DB unique index on placement rows.
- Round count changed because entrants were removed; completed results recalculated or overwritten on rebuild — `planRebuild` keeps decided fixtures verbatim and uses the configured round count with CURRENT active entrants only.
- Eliminated entrants reintroduced — `assertNoReentry`.
- Advancing from the wrong division/pool — `mapQualifiers` rejects foreign-division standings.
- Playoffs without an explicit mapping rule — `mapQualifiers`, `canGenerateStage`.
- Seeds changed after publication — `assertSeedsUnchanged`.
- Scheduling outside configured dates/courts/venues, or court clashes — `assertScheduleWithin`.
- Duplicate Swiss opponents — `swissRound` throws instead of repeating.
- Doubles pairs split — pairs are treated as single units throughout.

## Seeding

`snakePools` distributes ranked entrants in a balanced snake. Unranked entrants are returned separately for manual placement — no values are invented.

## Tournament Map

`tournamentMap()` gives the pre-generation summary (e.g. 48 players → 8×6 pools → 120 pool matches → top 2 → R16/QF/SF/Final → 15 playoff matches → 135 total).

## Builder opening order (Smart Builder BETA)

OWNER/SCOPE → AUDIENCE → SEEDING DATA → EXPECTED ENTRIES → FORMAT → ROUNDS → SCHEDULING → PLAYOFFS → VALIDATION/MAP → GENERATE.

- `definition.event` stores scope (club / regional / national), owner, audience, discovered eligible count and ranking coverage, chosen seeding source and expected entries. Owner and audience are separate.
- `src/lib/smart-builder/scope.ts`: valid audience options per scope ("all members" and "league players only" are distinct choices), scope-based seeding priority (club → ladder; regional → regional ranking/league strength; national → national ranking) as defaults only, and `recommendSeeding` which skips sources under 50% coverage and never invents values.
- Readiness asks these items first (`scope`, `event_audience`, `event_seeding`, `expected_entries`) before design questions. The AI is told the same order and must never set eligible counts or coverage itself.
- Organisation subtree resolution reuses the existing invite-scope/organisation helpers; it is not duplicated here.

## Competition hierarchy (`src/lib/tournaments/hierarchy.ts`)

TOURNAMENT → DIVISION → STAGE → POOL (only in pool stages) → ROUND → FIXTURE.

- A **division** is a separate title/category (Men's, Ladies, 1st League). A **pool** is a grouping inside one division's stage. A **team** is a participant. Never interchangeable.
- Each division is configured independently (format, pools, rounds, scheduling, playoffs). "Apply this structure to other divisions" copies with fresh ids and is an explicit owner action only.
- Pools in the same stage share format, scoring and qualification (`hierarchyIssues`) unless `allowMixedPoolFormats` is explicitly set.
- Names are **display labels only**. Logic keys on stable ids + kind; a division named "Pool A" or a pool named after a team stays what it is. Ids may not be reused across kinds.
- Every fixture carries tournament/division/stage/round ids; `poolId` only in pool stages. Knockout/playoff fixtures belong to the division's knockout stage, never to a source pool, and cannot carry a pool-stage format (`assertFixtureIdentity`) — the Nelspruit guard.
- League structure use per division (`leagueUse`): `division_allocation` (league → division, no seeding change), `pool_seeding` (strength only, one division), `team_allocation` (teams kept as units), `ignore`, `manual`. Undecided blocks allocation (`applyLeagueUse`).
- Defaults: Men's/Ladies for categories, Pool A/B/C…; always renamable.

## Custom / mixed format — ordered stage builder (2026-09-24)
- "I know what I want → Custom / mixed" opens the stage builder (`StageBuilder.tsx`, `lib/smart-builder/stage-builder.ts`), not Guide me.
- Each stage stores separate dimensions: `discipline`, `kind` (format), `groups/groupSize` (grouping), `swissRounds/legs/thirdPlace` (rounds), `schedule`, and `progression` from the previous stage. Stage order = array order, re-linked via `input.fromStageId`.
- `progression.mode`: `qualifiers` (top N → knockout, existing play-off path), `all_continue` (same units, seeded by previous table), `form_pairs` (singles → doubles; `pairing` fold/positions/manual). `standings`: carry/reset. `def.finalStandings`: last_stage/cumulative.
- `contractIssues` blocks: unresolved transition, singles→doubles without `form_pairs`, doubles→singles, odd count for pairing, anything but qualifiers after a knockout, missing generation mode.
- Engine: `nextStageFixtures` / `startNextStructuredStage` reuse `generateStage`; pair units are `a+b` ids persisted via partner columns in the same atomic commit. `finalStandings` credits pair wins to both partners.
- `classifyEdit`: stages that already have games can't be moved/removed/reconfigured; edits to later, not-yet-created stages don't regenerate anything.
- `poolStandings` treats a one-field round robin/Swiss as one pool (previously returned nothing — play-offs after a one-field RR/Swiss would have been empty).

## Stage transitions (pool stage → next stage)

The progression between a pool/group stage and the next stage is stored explicitly as a
`StageTransition` (`src/lib/tournaments/transition.ts`) on the destination stage's
`qualify.transition`, and mirrored into `tournament_stages.config.transition` with the
resolved `source_stage_id`. Three independent concepts:

1. **Qualification** — which finishing positions advance (`positions`), from which source
   pools (`sourcePoolIndexes`).
2. **Mapping method** — `cross_pool` (owner picks which pools are crossed), `reseed` (one
   qualifier field, canonical bracket order) or `manual` (explicit slot → slot map).
3. **Pairing rule** — cross-pool only: `winner_runner_up` or `same_position`.

Rules enforced by the engine:

- Stored against stable ids: source stage spec id and 0-based pool indexes. Pool display
  names are labels only and can never change a mapping.
- A qualifier slot resolves only from its configured pool and position.
- A participant may never occupy two destination places.
- No play-off generation until the source stage's results are complete; before then the
  preview shows slot labels ("Pool A #1 vs Pool D #2").
- Cross-pool pairings must cover every source pool exactly once.
- Destination knockout fixtures carry the destination stage/round ids and `pool_id` NULL.
- Divisions are isolated: standings from another division are refused.
- Once the destination stage has games, its mapping is locked (editor and engine both refuse).

Tests: `src/test/stage-transition.test.ts`.
