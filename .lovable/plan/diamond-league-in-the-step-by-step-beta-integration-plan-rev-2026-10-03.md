# Diamond League in the Step-by-Step Beta — integration plan (revised)

Plan only. No code changes yet.

## Source of truth: the proven Diamond League

The working Diamond League is the Current Builder's **Structure → Diamond League** team mode, set up almost entirely on one page:

- Setup UI: `DiamondRulesPanel`, `DiamondAllocationBoard`, `DiamondFixturesPreview` (`components/tournaments/DiamondLeagueSetup.tsx`), driven by `diamondMode` + `diamondDraft` in `ClubChampsTab.tsx`.
- Rules: `lib/tournaments/team-league.ts` (defaults, tie games, pool rounds, crossover semis, placing finals, `buildPoolWeeks`, `autoSlotPlayers` with locks).
- Data: a normal `club_champs` row (`scoring_mode = time_capped_points`, `doubles_serving_method`) plus one linked `team_league_events` row (`config`, `teams`, `weeks`).
- Fixtures: `persistDiamond` → `syncDiamondFixtures` writes stable `dl:` match rows and never wipes stored knockout weeks.
- Runtime and display: `TeamLeagueManager`, `DiamondStandings`, `diamond-live-summary`, `diamond-position-points`, `diamond-participants`, DB trigger `diamond_seed_doubles_from_singles`, Bells marker, Tournaments and ClubChampsView.

None of the above changes behaviour.

## The Beta Diamond League path to remove

The Beta has its own separate interpretation (Diamond League modelled as generic structured-engine stages). Entry points to remove for future creation:

1. `lib/smart-builder/step-templates.ts` — `PREBUILT_TEMPLATES` entry `key: "diamond_league"`.
2. `components/smart-builder/StepTemplates.tsx` — the `diamond_league` handler that creates a draft via `emptyDefinition` + `diamondTemplate()`.
3. `components/smart-builder/StageBuilder.tsx` — the "Load Diamond League template" button and the `DiamondLeaguePanel` mount plus `diamond` special cases.
4. `components/smart-builder/DiamondLeaguePanel.tsx` — removed (also saved club templates with `template_key = DIAMOND_KEY`; that save button goes with it).
5. `lib/smart-builder/diamond-league.ts` and `diamondTemplate()` in `stage-builder.ts` — removed once nothing references them; related Beta-only tests (`pool-v-pool-builder`, `stage-builder`, `explicit-mapping`, `builder-canonical-state` Diamond cases) updated or dropped. Generic pool-v-pool / mapped-stage support stays (used by other formats).
6. `ClubTournamentBeta.tsx` line 122 copy "including Diamond League" — points to the new option instead.

Existing data is not touched: no tournament rows, `team_league_events`, fixtures, results or saved `tournament_templates` rows are deleted or migrated. If an old Beta draft built from the stage template is opened, it shows a read-only note "Built with the retired Beta Diamond model — start a new Diamond League" rather than crashing.

## New approach: one Diamond option, compact one-page setup

```text
Beta landing / Structure choice: [Diamond League]
        |
        v
Compact Diamond League page (the existing one-page setup, reused as-is):
  name + category + dates/courts/times
  Rules panel -> Team & player slot board -> Fixtures preview
        |
  Separate only: Fees/payments, Messaging & invitations (existing Beta screens)
        |
  Save / Complete setup -> same persistDiamond + syncDiamondFixtures
        |
  Runs in the existing Diamond screens (standings, results, marking, reporting)
```

1. **Extract, don't rewrite.** Move `persistDiamond` and `createDiamond`'s validation out of `ClubChampsTab.tsx` into a shared module (e.g. `lib/tournaments/diamond-persist.ts`) with identical behaviour; the Current Builder calls it unchanged.
2. **Single Diamond entry** in the Beta (landing tile and Structure choice, `CompKind` gains `diamond`). Selecting it opens a dedicated compact page that mounts the existing Diamond components together — not split across the long guided wizard.
3. **Kept outside the compact page** (genuinely separate): fees/payment methods, messaging/invitations/WhatsApp link, lifecycle hand-off. Everything else stays on the one page.
4. **Hidden for Diamond:** subcategories/pool plan, seeding, scoring overrides, playoffs, stages & scheduling timeline, Confirm final format, Generate draw, play-off court booking/slot order, structured run overview.
5. **Handover:** creates/updates the `club_champs` row exactly as the Current Builder does for Diamond, then the shared persist; re-saving updates the same linked event, never a second one. `beta_lifecycle` records `structure: "diamond"` so Beta screens route correctly.
6. **Guards:** Generate draw (`step-draw.ts`), consistency, pool plan, playoff scheduling, stage bookings and run overview do nothing for a tournament with a `team_league_events` row and point to the Diamond screens instead.
7. After creation, all management, standings and reporting stay in the existing Diamond views.

## Beta assumptions that would otherwise reject or overwrite Diamond League

- `CompKind` / `QuickPath` have no Diamond option.
- `step-draw.ts` would generate a second structured fixture set beside the `dl:` rows.
- Consistency/readiness/Final Format Review/playoff chain assume structured stages.
- `step-handover.ts` writes Beta format fields and `format_plan`; Diamond must write only what the Current Builder writes.
- `step_sync_admin_entrants` uses `club_champs_registrations`; Diamond players live in team slots.
- `run-overview.ts` derives progress from structured stages.

## Risks

- Extracting `persistDiamond` touches the Current Builder file — behaviour-identical move with before/after tests.
- Removing the Beta template code must not remove generic mapped-stage features other formats use.
- Player entry: Diamond uses the slot board only; no Beta registrations, to avoid double-counting.
- Courts: map Beta selected court ids into the Diamond court list only.

## Assumptions (correct me if wrong)

- Diamond players are placed via the existing team slot board; invitations and fees behave as in the Current Builder's Diamond mode.
- Saved club `tournament_templates` rows of the old Beta Diamond kind stay in the database but are no longer offered.

## Tests

- Persist extraction: identical event row and `dl:` rows for a fixture draft.
- Beta Diamond save creates exactly one `club_champs` + one `team_league_events`; re-save never duplicates.
- Generate draw / consistency / playoff scheduling refuse Diamond tournaments.
- No remaining Beta reference to `diamondTemplate`/`DIAMOND_KEY`; only one Diamond option shown.
- Existing Diamond suites (`diamond-*.test.ts`, `team-league.test.ts`) pass unchanged.
- Playwright on Riverside preview: create a Diamond draft through the Beta (no invites sent), confirm the compact page and that it opens in the existing Diamond screens.
