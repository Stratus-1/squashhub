# Tournament Beta: can it run start to finish without the old builder?

## Short answer
Almost, but not yet. You never open the old **builder** (the setup wizard). But after Create you land on the old tournament management page, and Beta still depends on it for entries and day-to-day running. That page detects Beta tournaments and turns off the old game generators, so the two generators never clash. The remaining gaps are listed below.

## 1. What Beta creates and saves itself
- The tournament record, plus copies of older fields the management page still reads (gender, match type, number of groups, league formats, fees, registration mode, dates, invite and result settings).
- Divisions, stages and pools in new dedicated tables. Each stage stores its own qualification, stage change and schedule rules.
- Progression rules, saved by stage and pool position. Renaming a pool never changes who meets whom.
- Rounds and games for the opening stages, saved in the shared games tables and tagged with division, stage and pool.
- Venues and courts, limited to the courts picked for the tournament.
- The date window, stage dates and round dates.
- Everything is saved in one step: either all of it is saved or none of it is.
- Not created by Beta: **participants/entries**.

## 2. Where Beta still relies on the old flow
- **Management page:** after Create you go to the old Tournaments admin page. It is safe (the old generators and the "generate play-offs" button are switched off, and the Beta engine panel appears instead), but it is still the old page.
- **Entries:** players get in through the old registration, invite and allocation screens. Beta only reads the entries.
- **Older-format fields:** Beta has to fill in the older-format fields (such as number of groups and league formats) because the old page, registration and notifications still read them.
- **Scheduling:** games get no date or time when they are created. Setting times and courts uses the shared per-game schedule dialog, with no bulk scheduling. I haven't confirmed that the dialog appears on Beta games.

## 3. Later stages after Create
- These all work, using the Beta engine: round robin to round robin, Swiss rounds, top finishers from each pool into cross-pool play-offs (preview, then confirm), singles into doubles pairing (by rule or picked by hand) and moving to the next knockout round.
- **Each step needs an admin to click a button** in the Beta engine panel. Stages set to "automatic" still wait for a click, because nothing starts them on its own. So later stages are real, not just plans, but none of them start by themselves.
- Played games are kept when an entry is withdrawn or a stage is rebuilt.

## 4. Shared services
- **Live marking and scores:** work directly, because Beta games are in the same games table.
- **Standings:** the Beta panel ranks each pool from the tagged games.
- **Ranking points:** awarded for singles only. Doubles games never award points. This already happened before Beta, but it affects every doubles stage.
- **Result emails, reminders, member pages and bookings:** not checked line by line. They probably work unchanged, but that is not confirmed.

## 5. Missing for the acceptance test

### Blockers
1. **A Beta management page (or a clean Beta mode):** after Create, open a Beta-owned page for the tournament (entries, games, stage progress, the engine panel), not the old admin page.
2. **Entries inside Beta:** a Beta screen for entries and allocation (invite, add, withdraw, assign to a division), using the existing entries table and invite service.
3. **Scheduling Beta games:** set the date, time and court per round or in bulk from the stage and round dates and the chosen courts. Confirm the per-game dialog works on Beta games.
4. **Clear hand-off at each stage:** when a stage finishes, show "Stage X complete, start Stage Y" on the Beta page. Either make "automatic" really start the next stage, or remove the option until it can.
5. **Finish the tournament:** find the winner using "last stage decides" or "points added across stages", mark the tournament complete and show the result, all from Beta.

### Should fix (not old-builder dependencies)
- Confirm that result emails, reminders and member pages treat Beta stages and pools correctly.
- Award ranking points for doubles games (this affects the whole platform).
- Stop relying on older-format fields once the old page no longer needs them.

### Agreed limitations (not blockers)
- Knockout stays the last stage.
- The final result is either "last stage decides" or "points added across stages".
- Team and hybrid match types stay unavailable.

## Recommended next steps
1. Check the unverified parts: the per-game schedule dialog on Beta games, result emails, reminders and member pages.
2. Build the Beta tournament page (the Operate view), reusing the engine panel, live marking and schedule dialog.
3. Add Beta entries and allocation on top of the existing entries table.
4. Add bulk scheduling from round dates and the chosen courts.
5. Add stage-complete prompts (and decide what "automatic" should do), plus finishing the tournament.
6. Run a complete test tournament (Diamond League template) end to end in the browser, then delete it.

## Technical notes
- Create: `mapToExistingTournament` saves the older-format fields, then `structured_commit` saves divisions, stages, pools, rounds and games in one transaction. It checks that the tournament is a Beta tournament and that the user can manage it.
- The old page checks `isStructured` in `ClubChampsView.tsx` (around lines 135, 1589, 1730 and 1770).
- Moving between stages uses `confirmStructuredPlayoffs`, `startNextStructuredStage`, `nextSwissRound` and `nextKnockoutRound`. These are called only from `StructuredEnginePanel`.
- `award_points_for_champ_match` skips any game that has a partner.
- `insertFixtures` never sets `scheduled_date` or `scheduled_time`.
