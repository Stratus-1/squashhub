# Guarantee league replacements and controlled corrections

## Confirmed current state

The original incident had three causes, all in the fixture scorecard flow:

1. Saved fixture players were discarded when the fixture summary row did not yet exist.
2. The default weekly lineup was applied before the fixture-specific lineup, so the originals won.
3. Reserve swaps made before setup completion could exist only in local state.

Those paths are now corrected: saved `league_match_results` players are authoritative on reload, fixture overrides take precedence over weekly/default allocations, and replacement-dialog swaps save immediately.

However, the guarantee is not yet complete:

- The database trigger `sync_match_results_from_lineup` still updates unscored fixture player rows whenever the weekly lineup changes. It does not currently respect `lineup_set_at`, so it can overwrite a captain-confirmed fixture lineup with the weekly defaults.
- Replacement-dialog swaps save immediately, but roster drag/drop, position reordering, clearing a player, and the whole-lineup wizard do not all use the same immediate, players-only persistence path.
- Current stale-write detection warns after writing; it does not prevent one open device from overwriting a newer lineup saved by another device.

## Implementation plan

1. **Protect confirmed fixture lineups in the backend**
   - Update the weekly-lineup synchronization function so it may seed empty/unconfirmed fixture rows, but never overwrite a fixture side/position that has been explicitly confirmed.
   - Preserve score and participant locks exactly as they are.
   - Keep existing authorization and row-level security unchanged.

2. **Use one authoritative save path for every lineup edit**
   - Route replacement selection, clearing, roster assignment, drag/drop, reordering, and wizard application through the same players-only persistence function.
   - Show a saving/saved/error state and roll back or refetch if persistence fails, rather than leaving an unsaved local lineup that appears successful.
   - Ensure “Reset to default” remains the only explicit action that discards fixture overrides.

3. **Apply the match-state authorization rule per rubber**
   - Before any play is recorded for a rubber, the latest authorized save wins. A team captain may still make a last-minute replacement while the fixture is in progress, provided that specific rubber has not started.
   - As soon as a rubber has live points, completed games, a forfeit, or a winner, lock its participants against further captain changes. Other not-yet-started rubbers in the same fixture remain editable.
   - After play has started or results have been submitted, expose a separate correction action only to the relevant club admin/platform admin. This may replace the recorded player identity while the game-by-game scores, rubber winners, and forfeit state stay exactly as played.
   - Bonus points are not frozen by this correction. When the corrected participant changes who counted as an original (permanent squad) player versus a reserve, recalculate the original-player bonus, the fixture point totals, and the resulting league standings from the corrected participants, using the league's own bonus rules. The club admin's final edit is the authoritative version.
   - Show the admin the recalculated before/after totals before saving, so a correction never silently shifts standings.
   - Record who made the post-play correction, when it was made, the before/after participant identity, and the before/after bonus and total points. Do not silently treat this as a normal captain lineup save.


4. **Make concurrent edits safe**
   - Replace warn-after-write behavior with an atomic backend save using the last-known lineup timestamp/version.
   - Before play starts, accept the latest valid captain/admin save; reject a stale open-screen write that was based on an older server version, refetch, and clearly show the newer authoritative lineup.
   - Save all affected positions transactionally so a multi-position swap cannot partially persist.

5. **Verify every entry path and role boundary**
   - Add regression coverage for reserve swap → weekly lineup edit → reopen → start marking.
   - Cover drag reorder, roster drop, clear, wizard apply, two-device stale edits, multiple reserves, and fixtures without a summary row.
   - Verify captains can replace players in unstarted rubbers while another rubber is live, but cannot change a rubber once its play begins.
   - Verify club admins can correct the participant on a played/submitted rubber from the existing standings → game review path, while the score/result remains exactly unchanged and the correction is audited.
   - Confirm ordinary members and captains cannot invoke the post-play correction directly, and do not weaken existing row-level security.
   - Run focused league lineup/substitution tests, then the broader suite and production build. Do not publish.

## Expected result

Once implemented, a captain-confirmed fixture lineup will remain the source of truth through refreshes, later weekly allocation changes, and match-marker startup. Captains may keep adjusting each unplayed rubber, with the latest valid save prevailing; play locks that rubber. Club admins retain a separate, audited identity-correction path after play without altering the recorded score.
