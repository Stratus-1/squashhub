# Tournament rounds and stages: one central round list, per-league progress

Investigation complete against the code and the live Nelspruit Club Champs 2026 data. No code has been changed.

The core idea: **round definitions and dates are tournament-wide and edited in exactly one place. Progress through those rounds is per league.** Today both halves are muddled — dates live in four places and stages are guessed per pool.

## A) What causes the confusion today

### A1. The same round date can be entered in four different places

| Where | What it writes | Problem |
|---|---|---|
| Edit Tournament → round schedule panel (`SelfScheduledRounds` inside `ClubChampsTab`) | `tournaments.round_play_by` (a positional list) | Only lets the organiser edit the *current* and *next* round, indexed by position |
| "Set up the next round" dialog when progressing a league (`NextRoundSetupDialog`) | A new `club_champs_rounds` row **and** back-fills `tournaments.round_play_by` | Creates a second definition of the same round, per league and per pool |
| Fixture generation (`use-generate-next-round`) | `club_champs_matches.play_by` on each new fixture | A third copy, frozen onto the fixture |
| Dates & Courts | the fixture's scheduled date | Separate concern, but reads the same muddled deadline |

Because there are several copies, the app has a `mergeRoundDeadlines` helper whose only job is to reconcile them ("earliest date wins"), and the notice builder has to fall back through three of them (`match.play_by` → `round.play_by` → generic). Whichever copy was written last wins, which is exactly why dates appeared to move.

### A2. One positional list shared by leagues at different stages

`tournaments.round_play_by` is read *by position*: "round 6" means slot 6 for every league. A 20-player league and a 4-player league reach completely different stages at round 6, so the wrong date is handed out. In Nelspruit the 1st League's final is round 7 and the 3rd League's is round 5.

### A3. Stage names are guessed from bracket slots, then frozen

Names are computed from the number of slots when a round is created and written permanently into the fixture. In the live data that produced rounds of 6 matches labelled "Round of 16", "Quarter-final" on two consecutive rounds, and two different round-6 rows in the 2nd League labelled "Quarter-final" and "Section A · Semi-final" with different dates.

### A4. A pool's last match is treated as that pool's "Final"

The stored plan is validated per *pool*: a pool's last round must be "final". But the pool winner still has to meet the other pools' winners, so that match is really a league semi-final. A recent patch renames it on screen; the stored names and types are still wrong, and the plan contradicts itself (rows labelled "Semi-final" carry type "final", rows labelled "Round 5" carry type "semi-final").

### A5. The event banner picks one league's stage

The tournament-level "next action" reduces every league to a single focus, so the fastest league's stage becomes the headline for the whole championship.

## B) Model changes

Additive only. Nothing is dropped or deleted.

**`tournaments.round_definitions`** (new jsonb) — **the single source of truth** for early rounds:
```json
[ { "round": 1, "label": "Round 1", "play_by": "2026-08-29", "notes": "" },
  { "round": 2, "label": "Round 2", "play_by": "2026-09-05" } ]
```
One entry per round number, tournament-wide. Round 6 may exist even though only the biggest league ever uses it.

**`tournaments.milestone_play_by`** (new jsonb) — centrally defined championship deadlines, required at knockout setup:
```json
{ "quarter_final": "2026-09-17", "semi_final": "2026-09-20", "final": "2026-09-22" }
```

**`club_champs_rounds`** stops being a competing date store and becomes a per-league *reference* to a central definition:
- `stage_key text` — `early` | `quarter_final` | `semi_final` | `final` | `third_place`
- `scope text` — `section` (pool round) or `league` (cross-pool round)
- `field_size int` — league survivors when the round was created, recorded once for audit
- `play_by` becomes an **override**, normally null. When null the effective date is resolved centrally. Existing values are preserved as overrides on historical rounds.

**`club_champs_matches`** gains `stage_key`. Its `play_by` stays, but is only written for completed/historical fixtures and genuine per-match exceptions; live fixtures resolve their date centrally.

**Resolution order (one rule, used everywhere):** match override → round override → `milestone_play_by[stage_key]` if the league is at a milestone → `round_definitions[round]`.

**`tournaments.round_play_by`** is retained read-only for backward compatibility and migrated into `round_definitions`.

**Audit:** editing a central round date writes a row recording who changed it, from what to what, and how many fixtures were affected.

## C) Generation and progression, per league

Each league (`group_number`) is an independent competition. Nothing at tournament level decides its stage.

**League field size.** After every result, count players still alive across all the league's pools *and* its cross-pool bracket. A pool winner who then loses a cross-pool match is out. Byes never eliminate. Withdrawals count as eliminations.

**Stage rule — league level, never pool level:**
```text
alive = players still in the whole league
alive == 2        -> Final
alive == 3 or 4   -> Semi-final
alive 5..8        -> Quarter-final
alive > 8         -> early round, named from the central definition ("Round N")
```
Uneven pools and byes are handled because the rule counts *survivors*, not matches or slots. Three pools with 1, 1 and 2 left = 4 alive = semi-finals, even though no single pool is at a semi-final.

**Which deadline applies.** Milestone stage → the central milestone date. Early round → the central definition for that league's next round number. A league reaching its final early simply waits for the common Final date; the app never forces an earlier play-by.

**Progressing a league** references the central definition rather than creating anything:
- If the next applicable round is already centrally defined: *"Progress 2nd League to Round 6 — play by Fri 12 Sep (central tournament round)."* The date is shown read-only with an "Edit central round dates" link.
- If it is a milestone stage: *"Progress 2nd League to the Semi-final — play by Sun 20 Sep (championship milestone)."*
- If the next early round does not exist centrally yet: the organiser is stopped and prompted — *"Round 7 is not defined for this tournament yet. Add it?"* — which opens the same single central editor. Once added, every league references it.
- Per-league overrides are still possible but are an explicit, labelled exception ("Override this league's date"), never the default path.

**What gets generated when.**
- *Knockout:* only round 1 of each pool at setup. Each later round is created when its feeder round is fully resolved, for that league alone. A league finishing early never pushes another league forward.
- *Cross-pool stage:* created when the league's survivors reach 2/4/8 or every pool is decided.
- *Round robin:* the full fixture list is generated at setup, dated from the central round definitions, because all opponents are known. Playoff fixtures are still generated only once qualification is known, and use the milestone dates.

**Admin control is preserved.** Manual placement, seeding and the drag-and-drop draw board are unchanged. Generation proposes pairings; the organiser can still rearrange them before confirming.

**Labelling rule.** A round is only called "Final" when winning it makes that player the league champion. In a multi-pool league a pool's last match while another pool still runs is "2nd League Semi-final", never "Section A Final". Section letters may still appear as a secondary tag on early rounds.

## D) UI changes and consolidation

**One authoritative editor — "Tournament rounds & deadlines"** — reachable from Edit Tournament and from every progress screen via a link. It contains:
- *Early rounds*: Round 1, Round 2, Round 3 … each with a name and one play-by date, an "Add another round" button available at any time (including mid-tournament), and a note of which leagues currently use each round.
- *Championship milestones* (required for knockout): Quarter-final, Semi-final, Final play-by dates, described as "must be played by", not fixed match dates.

**Screens that currently duplicate entry, and what happens to them:**
- `SelfScheduledRounds` inside Edit Tournament → becomes the central editor (extended to all rounds, not just current/next). It is the one place dates are typed.
- `NextRoundSetupDialog` → stops writing `tournaments.round_play_by` and stops inventing dates. It shows the referenced central round and date read-only, with the stage name suggested from the league rule, plus the explicit override and "Add central round" paths above.
- `AllNextRoundDrawsDialog`, `TournamentNextActionBar`, `KnockoutCard`, `TournamentProgressCard`, `ConfirmDrawDialog` → display the resolved central date; no date inputs.
- `use-generate-next-round` → stamps the resolved date onto new fixtures for history, and refuses to generate when the required round is not centrally defined.
- `mergeRoundDeadlines` ("earliest of the copies wins") is retired in favour of the single resolution order.

**Editing a central date** updates every league and fixture that references it. Fixtures that are completed, or already booked onto a court, are protected: the organiser is shown how many would be affected and completed ones are left untouched, with the change recorded in the audit log.

**Progress display** drops the single "Current round: Semi-Finals" banner for multi-league knockouts. Each league gets its own line — "1st League — Semi-finals, 4 players left, play by 20 Sep" — and the tournament card shows a summary ("3 of 6 leagues decided"), never one global stage.

**Fixture lists, invitations and notices** all read the stage from `stage_key` and the date from the single resolution order, so admin screens, the games page and player messages always agree.

## E) Migration and Nelspruit safety

1. Build `round_definitions` from each tournament's existing `round_play_by`, taking the organiser's dates as-is.
2. Backfill `milestone_play_by` from any plan rows already named Quarter-final / Semi-final / Final; leave blank where absent and prompt the organiser once.
3. Backfill `stage_key`, `scope` and `field_size` on existing round and match rows by recomputing survivors from the actual results — **write-once, only where null**.
4. Where an existing `club_champs_rounds.play_by` differs from the new central definition, keep it as an explicit override rather than silently rewriting it, and list the differences for review.
5. **Completed matches are never relabelled or regenerated.** Scores, winners, dates and any ledger effects are untouched. Where a completed match carries a historically wrong stage name the display falls back to the recomputed stage, but the stored text stays for audit.
6. Nelspruit specifically: set the central milestones to QF 17 Sep / SF 20 Sep / Final 22 Sep, correct the contradictory plan rows (name vs type), and resolve the duplicate round-6 rows in the 2nd League. Each correction is listed and confirmed before it runs.
7. The recomputation runs in comparison mode first, so the new stage names and dates can be checked against the current screens before anything is written.

## F) Tests and acceptance

**Central definition**
- Progressing a league to an already-defined round references that date and creates no new definition.
- Progressing a league to an undefined round is blocked and prompts to add it centrally.
- A central round exists and is used by one league while another league never reaches it.
- Editing a central date updates all referencing unplayed fixtures and leaves completed ones alone; the audit row records the change.
- No screen other than the central editor can write a round date, except the explicitly labelled per-league override.

**Stage rule**
- 4 entrants, one pool: R1 = Semi-final, R2 = Final.
- 6 entrants, one pool: R1 with 2 byes, 4 alive → Semi-final, then Final.
- 8 entrants, two pools of 4: pool rounds = Quarter-final then Semi-final (not "Pool Final"); cross-pool = Final.
- 12 entrants, three pools of 4: survivors 1, 1, 2 → 4 alive → league Semi-final.
- 20 entrants, two pools of 10: early rounds while alive > 8, then QF/SF/Final by survivor count.
- Byes and withdrawals never distort the survivor count.

**Deadlines**
- Milestone stage takes the milestone date; early round takes the central round date.
- A league reaching its final early still gets the common Final date.
- Two leagues on the same round number but different stages get different dates.

**Independence**
- A decided 1st League never changes the 3rd League's stage, action or deadline.

**Notifications**
- The generated message names the league-level stage and the centrally resolved play-by.

**Regression**
- The existing suite (948 tests) stays green; a fixture built from the real Nelspruit rows reproduces the current correct results with no relabelling of completed matches.

## Assumptions

- Milestone deadlines are shared across all leagues of a championship (one Final day for the event). Say the word if a league should be allowed its own Final date.
- Per-league date overrides remain possible but as a deliberate exception, not a second entry point.
- Third-place playoffs stay out of scope unless you want them included.
- No publish until you ask.
