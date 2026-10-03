# Diamond League in the Step-by-Step Beta — integration report and plan

No code changes yet. This is the findings report plus the proposed approach.

## What exists today (source of truth)

The working Diamond League is the Current Builder's **Structure → Diamond League** team mode:

- Setup UI: `DiamondRulesPanel`, `DiamondAllocationBoard`, `DiamondFixturesPreview` (`components/tournaments/DiamondLeagueSetup.tsx`), driven by `diamondMode` + `diamondDraft` inside `ClubChampsTab.tsx`.
- Rules/maths: `lib/tournaments/team-league.ts` (config defaults, tie games, pool rounds, crossover semis, placing finals, `buildPoolWeeks`, `autoSlotPlayers` with locks, team names).
- Data: one `team_league_events` row per tournament (linked 1:1 by `tournament_id`) holding `config`, `teams`, `weeks`; the tournament row itself is a normal `club_champs` row with `scoring_mode = time_capped_points` (new events) and `doubles_serving_method`.
- Fixtures: `persistDiamond` → `syncDiamondFixtures` (`lib/tournaments/diamond-fixtures.ts`) writes stable `dl:` match rows; knockout weeks already stored are never wiped.
- Runtime: `TeamLeagueManager`, `DiamondStandings`, `diamond-live-summary`, `diamond-position-points`, `diamond-participants` (replacements), DB trigger `diamond_seed_doubles_from_singles`, Bells marker, Tournaments/ClubChampsView display.
- Current Builder skips its Schedule step in Diamond mode; dates come from the weekly fixture dates.

## Important finding: a second, unrelated "Diamond League" already exists in the Beta

The Beta already ships a "Diamond League" pre-built template (`StepTemplates.tsx` → `diamondTemplate()` in `smart-builder/stage-builder.ts`, `smart-builder/diamond-league.ts`, `DiamondLeaguePanel`). It models Diamond League as generic pool-v-pool **stages** on the structured engine (`mapped` stages). It does **not** use `team_league_events`, `buildPoolWeeks`, `dl:` rows or the Diamond standings/trigger. Tournaments created that way would not behave like the live Diamond League. This is the biggest risk and the plan addresses it.

## Schema / type assumptions in the Beta that would reject or overwrite Diamond League

- `CompKind` in `StepByStepBuilder.tsx` is `pools | knockout | swiss | cross | later` — no Diamond option.
- `QuickPath` in `quick-path.ts` is `round_robin | swiss | knockout | custom`.
- `step-draw.ts` "Generate draw & fixtures" converts the tournament to the structured engine (`step_prepare_draw` + `generateStructuredTournament`). Run on a Diamond tournament, it would create a second fixture set beside the `dl:` rows — must be hard-blocked.
- `consistency.ts` / readiness / Final Format Review / playoff chain / pool plan / `playoff-schedule` / `stage-bookings` all assume structured stages; they must skip Diamond tournaments, not "repair" them.
- `step-handover.ts` inserts `club_champs` with Beta-derived scoring/format fields; for Diamond it must set exactly what the Current Builder sets (`time_capped_points`, `doubles_serving_method`) and nothing structured (`builder_spec`, `beta_lifecycle.format_plan` stages).
- `step_sync_admin_entrants` enters players as `club_champs_registrations`; Diamond players live in `team_league_events.teams` slots. Needs a decision (see Open questions).
- `run-overview.ts` derives lifecycle from structured stage games; Diamond progress must come from the existing Diamond weeks/standings.

## Recommended approach: guided shell, shared Diamond engine

```text
Beta steps:  Basics -> Category -> Structure [Diamond League] -> Dates & courts -> Fees/payments -> Messaging -> Summary
                                              |
                                              v
                         Diamond-specific branch (existing components):
                         Rules -> Teams & player slots -> Fixtures preview
                                              |
                         Complete setup -> same persistDiamond / syncDiamondFixtures
```

1. **Extract, don't rewrite.** Move `persistDiamond` and `createDiamond`'s checks out of `ClubChampsTab.tsx` into a pure-ish shared module (e.g. `lib/tournaments/diamond-persist.ts`) with identical behaviour; the Current Builder calls it unchanged. Covered by a snapshot test showing the same `team_league_events` row and `dl:` fixtures before/after the move.
2. **Add "Diamond League" as a Structure choice** in the Beta (`CompKind` gains `diamond`). Choosing it switches to a Diamond branch that renders the existing `DiamondRulesPanel`, `DiamondAllocationBoard`, `DiamondFixturesPreview` with the same `DiamondDraft` shape (stored device-local in the Beta answers until Complete setup).
3. **Shared steps reused:** basic info/name, category (Men/Ladies/Mixed), courts + start/end time, entry fee and accepted payment methods, invitations/WhatsApp link/messaging, lifecycle stage. Weekly dates come from the Diamond fixture dates (as in the Current Builder), not the Beta's per-stage timeline.
4. **Steps hidden for Diamond:** subcategories/pool plan, seeding, match scoring overrides, playoffs, Club Champs stages & scheduling, Confirm final format, Generate draw, play-off court booking/slot order, structured run overview.
5. **Handover:** Summary's "Complete setup" creates/updates the `club_champs` row the same way the Current Builder does for Diamond, then calls the shared persist. Re-saving updates the linked event (never a second one). Tournament marked in `beta_lifecycle` as `structure: "diamond"` so every Beta screen routes correctly.
6. **Guards:** Generate draw, consistency, pool plan, playoff scheduling and run overview return "Diamond League — managed by the Diamond League engine" and do nothing when a `team_league_events` row exists for the tournament. Same guard if an existing Diamond tournament is opened in the Beta.
7. **Retire the stage-based Beta template path for new drafts:** the "Diamond League" pre-built template opens the new Diamond branch instead of `diamondTemplate()`. Existing drafts made from the old template are left untouched (no migration); flagged in the UI as the "experimental stage model". Needs your OK.
8. **After creation**, management, results, standings, marking and display stay entirely in the existing Diamond screens.

## What will not change

Existing Diamond tournaments, `team_league_events` rows, `dl:` fixtures, results, standings, scoring, doubles re-seeding trigger, crossover/placing rules, the Current Builder's Diamond flow. No schema change, nothing published.

## Risks

- Extracting `persistDiamond` touches the Current Builder file — mitigated by a behaviour-identical move and before/after tests.
- Two "Diamond League" models currently coexist in the Beta; leaving the stage-based one reachable invites incompatible tournaments.
- Player entry: Diamond teams use slot assignment, the Beta uses registrations; mixing them could double-count entrants.
- Courts: Diamond uses a court count/selected courts; the Beta has venue/court pool — map selected court ids only.

## Open questions (assumptions stated)

- Players: assume the Beta's Diamond branch uses the existing team slot board only (no `club_champs_registrations`) and invitations/fees work as in the Current Builder's Diamond mode.
- Assume the stage-based Beta "Diamond League" template should be replaced by the new branch for new drafts (step 7).

## Tests

- Persist extraction: identical event row and `dl:` rows for a fixture draft.
- Beta Diamond handover creates exactly one `club_champs` + one `team_league_events`; re-save updates, never duplicates.
- Generate draw / consistency / playoff scheduling refuse Diamond tournaments.
- Existing Diamond suites (`diamond-*.test.ts`, `team-league.test.ts`) pass unchanged.
- Playwright on Riverside preview: create a Diamond draft through the Beta (draft only, no invites sent) and confirm it opens in the existing Diamond screens.
