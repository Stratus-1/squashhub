# Tournament Wizard — Preview Schedule Before Finalizing

## Goal

When a club admin clicks **Generate Schedule** or **Rebuild Schedule** on the tournament wizard's Review step, the wizard should **not close**. Instead it should show a full schedule preview (same style as the Tournaments → Upcoming page) so the admin can:

1. See every generated fixture — dates, times, courts, leagues, pools.
2. Filter by league / pool / date, exactly like the Upcoming page.
3. **Go Back** to the wizard to change something and rebuild again.
4. **Finalize** to close the wizard when they're happy.

## Behaviour

- Rebuild/Generate still writes the schedule to the database (same as today), but on success the wizard advances to a new `"preview"` step instead of closing.
- The preview step reads `club_champs_matches` for the current tournament (fresh from DB) and renders them with the existing filter + colour-coding logic from `Tournaments.tsx`.
- Two footer buttons on the preview step:
  - **Back to Edit** — returns to the Review step, wizard stays open, admin can tweak players/pairings/dates and click Rebuild again.
  - **Finalize** — closes the wizard, shows the existing success toast, invalidates queries (current behaviour).
- Court bookings action (**Make Court Bookings**) is surfaced on the preview step too, so admins can create bookings after they're happy with the schedule.
- For "awaiting player pairs" (registration-only save) the flow is unchanged — nothing to preview yet, wizard closes as today.

## Technical Notes

**Files:**
- `src/components/club-admin/ClubChampsTab.tsx` — add `"preview"` step, new component, wire up `createChamp.onSuccess`.
- New component `src/components/club-admin/ChampSchedulePreview.tsx` — reads matches/entries for one `champId`, renders the filter dropdowns + colour-coded match rows. Extract the shared bucket/pool-derivation helpers into `src/lib/tournament-formats/schedule-buckets.ts` so both `Tournaments.tsx` and the preview use identical logic (no duplicated colour maps).
- Refactor `Tournaments.tsx` to import from the new helper module — no visual change there.

**Wizard flow:**
- Add `"preview"` to `activeSteps` conditionally (only when `editingChampId` exists and `!awaitingPlayerPairs`).
- In `createChamp.onSuccess`, if the tournament now has generated matches → `setStep("preview")` instead of `setShowWizard(false)` + `resetWizard()`. Keep the toast.
- Preview step's **Back** goes to `"review"`; **Finalize** runs the current close-wizard logic.
- If the admin clicks Rebuild again from Review, the same success path re-enters the preview with fresh data (react-query invalidation already covers this).

## Out of Scope

- No changes to the fixture generator, playoff logic, or booking creator.
- No changes to the public Tournaments → Upcoming page beyond the shared-helper refactor.
