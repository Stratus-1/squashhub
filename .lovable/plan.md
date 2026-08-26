# Guarantee league replacements remain saved

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

3. **Make concurrent edits safe**
   - Replace warn-after-write behavior with an atomic backend save using the last-known lineup timestamp/version.
   - Reject stale writes, refetch the authoritative lineup, and tell the captain that another user changed it.
   - Save all affected positions transactionally so a multi-position swap cannot partially persist.

4. **Verify every entry path**
   - Add regression coverage for reserve swap → weekly lineup edit → reopen → start marking.
   - Cover drag reorder, roster drop, clear, wizard apply, two-device stale edits, multiple reserves, and fixtures without a summary row.
   - Confirm a completed/scored rubber remains immutable and no RLS policy is weakened.
   - Run focused league lineup/substitution tests, then the broader suite and production build. Do not publish.

## Expected result

Once implemented, a captain-confirmed fixture lineup will remain the source of truth through refreshes, later weekly allocation changes, and match-marker startup. Only an explicit fixture edit/reset by an authorized captain or admin can change it.
