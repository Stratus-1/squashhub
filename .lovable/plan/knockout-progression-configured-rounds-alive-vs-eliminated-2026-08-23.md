# Knockout progression: configured rounds, alive vs eliminated

## What I found (verified against live data and code)

Riverside "Mens singles Riverside" (`league_formats {1: knockout}`, `league_sections {1: 4}`, self-scheduled): 32 entries in division 1, split into 4 sections of 8. Round 1 is complete in every section (4 matches each, no byes) and Round 2 already exists (2 matches per section, unplayed). `round_play_by` holds a single entry: `[{label: "Round 1", date: 2026-09-04}]`.

### Root cause 1 — standings ignore the knockout entirely
`getGroupStandings` in `src/pages/ClubChampsView.tsx` builds a table from `club_champs_entries` filtered by `group_number` only. It has no notion of knockout stage, section, or elimination, so all 32 registered entrants stay listed as normal rows forever. It also never splits by section (`poolCountFor` only returns >1 for Swiss), so four independent 8-player draws render as one 32-row league table. The strikethrough added earlier lives only in the match-row renderers, not here.

### Root cause 2 — progression is derived from row counts, not configuration
`knockoutState()` in `src/lib/tournaments/knockout.ts` looks at the highest existing `round_number` per section and sets `canGenerateNext = roundComplete && latestRoundMatches.length > 1`. `KnockoutCard.tsx` then labels the button purely from `roundLabel(latestRoundMatches.length)` — "…→ Semi-final" appears simply because two matches remain, not because semi-finals are the configured next stage. There is no stored round plan: rounds only exist once their matches are inserted, and `round_play_by` is a label/date array with no stable id, type or order. Duplicate generation is only prevented incidentally (the newly created round becomes "latest" and is incomplete); a double-click or a partially-resolved round has no explicit guard or audit trail.

## Recommended data model

New table `public.club_champs_rounds` — the organiser's declared progression, one row per configured stage per division (and per section where sections exist):

- `id`, `champ_id`, `group_number`, `section_number` (0 = league finals bracket)
- `round_number` (1..n, stable order), `round_type` (`knockout` | `semi_final` | `final` | `third_place`)
- `label`, `play_by` (date, nullable), `notes`
- `scheduling_mode` (`self` | `club`) so a finals night can be club-scheduled
- `status` (`pending` | `active` | `complete`), `generated_at`, `generated_by`
- standard `created_at` / `updated_at`, GRANTs for `authenticated` + `service_role`, RLS mirroring `club_champs_matches` (club members read, champs-admins write)

`club_champs_matches` gains `round_id uuid references club_champs_rounds` (nullable for legacy rows) so every match points at its configured stage. `round_play_by` stays as-is for backwards compatibility and is read only when no rounds rows exist.

Entrant state is **derived, never stored** (preserves history, satisfies points 5 and 7): a new pure module `src/lib/tournaments/knockout-progression.ts` computes, per division/section, `registered` (from entries), `alive`, `eliminated` (with the round they went out in), and `advancedTo` (next round number) from the ko match rows. Original pool/section assignment in `club_champs_entries` is never mutated or deleted.

## Organiser setup UX (Structure step, `ClubChampsTab.tsx`)

For each division whose format is `knockout`, a "Rounds" editor replaces the current free-form deadline list:

- SquashHub proposes the sequence from the entrant count and section sizing (8 per section → Round 1, Semi-final, Final).
- The organiser can add/remove intermediate knockout rounds, so `R1 → SF → F` or `R1 → R2 → R3 → SF → F` are both expressible; the last two rows are always semi-final and final, and the editor validates that the round count matches the bracket depth.
- Each row carries its own play-by date (optional), notes, and a per-round "players arrange their own court" / "club schedules courts" switch. Self-scheduled rounds never require court, date or time.
- Saving writes `club_champs_rounds`. Editing later never touches rounds that already have matches.

## Live admin UX after each round

`KnockoutCard` becomes progression-aware. Per division/section it shows a single status line — *Current: Round 1 · 4/4 complete · Next: Semi-final* — plus at most one context-aware action, enabled only when all three hold: current round complete, next configured round exists, next round not yet generated. The button is named from the configured round (`Generate Semi-finals`, `Generate Final`), never inferred from a match count. When matches are unresolved the button is disabled with the count outstanding, and an explicit "Resolve outstanding matches" override (walkover/void, recorded in the existing audit trail) is the only way past it. Generation is guarded server-side by a unique index on `(champ_id, group_number, section_number, round_number, bracket_position)` so a double-click cannot duplicate a round.

Sections keep their own blocks; the league-final bracket (`section_number = 0`) remains a separate configured round generated only when every section is decided.

## Standings / participant display

For knockout divisions the round-robin standings table is replaced by a **draw participants** panel, rendered one block per section (never interleaved), preserving the serpentine seed order and existing ladder badges:

- Seed #, name, status badge: `Alive — Semi-final`, `Eliminated — Round 1`, `Bye`.
- Eliminated entrants stay in the list, struck through using the shared `ELIMINATED_NAME_CLASS`, with a "Knocked out in <round>" tooltip. They are excluded from every generation input.
- Round-robin/Swiss divisions in the same tournament keep the existing standings table unchanged.

Player-facing (`MyChampionships.tsx`, `Tournaments.tsx`): unchanged actions, plus an explicit "Eliminated in <round>" state on the player's own card and no upcoming-match prompt once out. Winners see "Through to <next round>" with the round's play-by deadline.

## Migration / backfill (non-destructive)

1. Create `club_champs_rounds` + `round_id` column; no data deleted.
2. Backfill rounds from existing ko matches: for each `(champ_id, group_number, section_number)` derive the full depth from the first-round match count, insert rounds 1..n typed knockout/semi-final/final, mark rounds that already have matches `active`/`complete`, and copy dates from `round_play_by` where labels line up. Link existing matches via `round_id`.
3. Riverside specifically: 4 sections × 8 → rounds 1 (complete), 2 = Semi-final (generated, unplayed), 3 = Final (pending); its existing Round 1 deadline attaches to round 1. Nelspruit tournaments are backfilled by the same rule. No match rows, results, bookings or entries are rewritten.

## Tests

New `src/test/knockout-progression.test.ts` plus additions to `knockout.test.ts`:

- configured sequences of 1, 2 and 3 knockout rounds before semi-final/final, including validation errors when the plan is too short/long for the bracket;
- uneven brackets with byes (5, 6, 12 entrants) — bye winners advance, byes never count as eliminations;
- eliminated-player derivation: correct round attribution, alive/eliminated/advanced partitioning, and eliminated entrants excluded from next-round input;
- duplicate/premature generation: generating twice is a no-op, generation blocked while a match is unresolved, override path recorded;
- historical preservation: entries and section membership unchanged after several rounds;
- section isolation: two sections progress independently, league final only when all sections decided.

## Out of scope

No changes to seeding/serpentine distribution, self-scheduled match booking (`self_schedule_champ_match`), result entry, or marker permissions.
