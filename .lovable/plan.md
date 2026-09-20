# Tournament rounds and stages: per-league knockout, upfront round robin

Investigation complete. This plan changes how rounds, stages and deadlines are decided. No code has been changed.

## A) What causes the confusion today

Verified against the code and the live Nelspruit Club Champs 2026 data.

1. **One deadline list for the whole tournament.** `tournaments.round_play_by` is a single jsonb list of rounds ("Round 1 → 5 Sep, Round 2 → 12 Sep…"). Every league reads the same list *by position*. A league on round 5 and a league on round 7 can be at completely different stages, so a league's final picks up whichever date happens to sit at that slot. Nelspruit's 1st League final sat at round 7 and the 3rd League final at round 5 — same plan, different meaning.
2. **Stage names are guessed from bracket slots, then frozen into the fixture.** When a round is created the name is computed from the number of slots and written into the match row. Nelspruit has rounds of 6 matches labelled "Round of 16", the same label "Quarter-final" on two consecutive rounds, and in the 2nd League two different round-6 rows labelled "Quarter-final" and "Section A · Semi-final" with different dates. Those wrong names are now permanent text on completed fixtures.
3. **A pool's last match is treated as that pool's "Final".** The round plan is validated per *section*: the last round of a section must be "final", the one before it "semi_final". But a section winner still has to meet the other sections' winners, so that match is really a league semi-final. A recent patch renames it at display time; the stored labels and the plan's `round_type` values are still wrong.
4. **The stored plan is self-contradictory.** In the live data, rounds labelled "Semi-final" carry `round_type: final`, rounds labelled "Round 5" carry `round_type: semi_final`. Nothing reconciles label, type and the actual field size.
5. **Round-setup UI works on the current round position.** The setup panel edits `deadlines[currentRound - 1]`, i.e. the global list again, and only lets the organiser touch the current and next round.
6. **The whole-tournament banner picks one league's stage.** The event-level "next action" reduces every league to a single focus section, so the fastest league's stage becomes the headline for the whole championship.
7. **Notifications inherit all of it.** The notice builder uses the round's stored label and `COALESCE(match.play_by, round.play_by)` — so a wrong label and a borrowed date go straight into the message.

## B) Model changes

No destructive schema work. Additions only.

**`tournaments`** — new jsonb `milestone_play_by`:
```json
{ "quarter_final": "2026-09-15", "semi_final": "2026-09-20", "final": "2026-09-22" }
```
Required at setup for knockout events. `round_play_by` stays as-is and keeps meaning "early rounds", used for round-robin and early knockout rounds only.

**`club_champs_rounds`** — three new columns:
- `stage_key text` — one of `early`, `quarter_final`, `semi_final`, `final`, `third_place`. The machine-readable truth; `label` stays the free-text display name.
- `scope text` — `section` (a pool round) or `league` (a cross-pool round). Section 0 rows become `league`.
- `field_size int` — how many players in the whole league contested this round. Recorded at generation, so history can never be re-derived wrongly later.

**`club_champs_matches`** — `stage_key text`, filled at generation. `stage_label` stays for display and is never rewritten for completed matches.

No column is dropped; no existing row is deleted.

## C) Generation and progression, per league

Each league (`group_number`) is an independent competition. Nothing at tournament level decides its stage.

**League field size.** After every result, count the players still alive across *all* the league's pools plus the league bracket — a pool winner who then loses a cross-pool match is out. Byes never eliminate. Withdrawals count as eliminations.

**Stage rule (league level, not pool level).**

```text
alive = players still in the whole league
alive == 2          -> Final
alive == 3 or 4     -> Semi-final
alive 5..8          -> Quarter-final
alive > 8           -> early round, named "Round N"
```

Uneven pools and byes are handled because the rule counts *survivors*, never matches or slots. Three pools with 1, 1 and 2 left = 4 alive = semi-finals, even though no single pool is at a semi-final.

**Which deadline applies.** If the stage is a milestone, use `milestone_play_by[stage]`. Otherwise use the early-round deadline for that league's round number. A league that reaches its final early simply waits for the common Final date — the app never forces an earlier play-by.

**What gets generated when.**
- *Knockout:* only round 1 of each pool is created at setup. Each subsequent round is created when its feeder round is fully resolved, for that league alone. A league finishing early never triggers generation in another league.
- *Cross-pool stage:* created when the league's survivors reach a bracket size (2/4/8) or every pool is decided — existing rule, now the only trigger.
- *Round robin:* the complete fixture list is generated at setup, with one date per round from the organiser's round dates. Playoff fixtures are still generated only once qualification is known, and use the milestone dates.

**Admin control is preserved.** Manual placement, seeding and the drag-and-drop draw board stay exactly as they are; generation only proposes pairings, and the organiser can still override the round name and play-by date before confirming.

**Labelling rule.** A round is only ever called "Final" when winning it makes that player the league champion. Anything else in a multi-pool league is named by the league-level rule: a pool's last match while another pool still runs is "2nd League Semi-final", never "Section A Final". Section letters may still appear as a secondary tag on early rounds.

## D) UI changes

**Knockout setup** splits into two clearly separated blocks:
- *Early rounds* — Round 1, Round 2, … each with a play-by date, optional notes, and an "Add another round" button available at any time, including after the event starts.
- *Championship milestones* (required) — Quarter-final, Semi-final, Final play-by dates, described as "must be played by" rather than fixed match dates.

**Round robin setup** keeps a single list of round dates, plus the milestone block only when playoffs are enabled.

**Progress display** drops the single "Current round: Semi-Finals" banner for multi-league knockouts and shows one line per league: "1st League — Semi-finals, 4 players left, play by 20 Sep". The tournament-level card shows a summary ("3 of 6 leagues decided") and never a single global stage.

**Fixture lists and player-facing labels** read the stage from `stage_key`, so admin views, the games page, invitations and notices all say the same thing.

## E) Migration and Nelspruit safety

1. Backfill `milestone_play_by` for existing knockout tournaments from any plan rows already named Quarter-final/Semi-final/Final; leave blank where absent and prompt the organiser once.
2. Backfill `stage_key`, `scope` and `field_size` on existing round and match rows by recomputing survivors from the actual results, **write-once and only where currently null**.
3. **Completed matches are never relabelled or regenerated.** Their scores, winners, dates and ledger effects are untouched. Where a completed match carries a historically wrong `stage_label`, the display falls back to the recomputed `stage_key`, but the stored text stays for audit.
4. For Nelspruit specifically: correct the contradictory plan rows (label vs `round_type`), set milestones to QF 17 Sep / SF 20 Sep / Final 22 Sep, and resolve the duplicate round-6 rows in the 2nd League. Each correction is listed and confirmed before it runs.
5. Everything ships behind the recomputation path first, so the new stage names can be compared against the current screens before anything is written.

## F) Tests and acceptance

Unit tests on the league-level stage rule:
- 4 entrants, one pool: R1 = Semi-final, R2 = Final.
- 6 entrants, one pool: R1 has 2 byes, alive 4 → Semi-final, then Final.
- 8 entrants, two pools of 4: pool rounds = Quarter-final then Semi-final (not "Pool Final"), cross-pool = Final.
- 12 entrants, three pools of 4: pools of 1, 1, 2 survivors → 4 alive → Semi-final at league level.
- 20 entrants, two pools of 10: early "Round 1/2" while alive > 8, then QF/SF/Final by survivor count.
- Byes and withdrawals never change the survivor count wrongly.

Deadline tests: milestone stage takes the milestone date; early round takes the early date; a league reaching the final early still gets the common Final date; two leagues on the same round number at different stages get different dates.

Independence tests: a decided 1st League never changes the 3rd League's stage, action or deadline.

Notification tests: the generated message names the league-level stage and the correct play-by.

Regression: the full existing suite (948 tests) must stay green; a fixture built from the real Nelspruit rows must produce the current correct results and no relabelling of completed matches.

## Assumptions

- Milestone deadlines are shared across all leagues of a championship (one Final day for the event). If a league should be allowed its own Final date, say so and I will make the milestone block per league.
- Third-place playoffs stay optional and out of scope unless you want them included.
- No publish until you ask.
