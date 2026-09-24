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
