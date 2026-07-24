## Goal
Give tournament admins full manual control over the schedule grid: add missing time slots on a given date/court, and clear or blank out empty cells that were left by the auto-scheduler.

## Context
The current tournament preview / Upcoming list (`src/pages/Tournaments.tsx`, `src/components/tournaments/ChampSchedulePreview.tsx`) only renders slots that the scheduler produced. If a needed slot (e.g. Saturday 16:30, 17:00) was never generated, admins can't drag anything into it because it doesn't exist. Conversely, half-empty rounds leave dead cells (Saturday 13:30 Court 3, 15:00, 16:00) with no visual indicator.

For the Nelspruit doubles tournament specifically, admin also needs the two missing Saturday slots (16:30 and 17:00) added immediately so they can move the manually-placed pairs in.

## Plan

### 1. "Add time slot" action (admin-only)
- Add an **Add slot** button in both:
  - `ChampSchedulePreview.tsx` (during wizard finalize step)
  - `Tournaments.tsx` Upcoming list header (per tournament, admin-only)
- Dialog fields: date, time (HH:mm), court (multi-select from tournament's court pool).
- Creates a placeholder `tournament_matches` row per court with `status='placeholder'`, no players, and a court booking hold (same as normal fixtures) so the court is reserved.
- Placeholder rows render as an empty grey cell labelled "Empty slot — drop a match here" and become valid drop targets for the existing drag-swap logic. Swapping a real match into a placeholder simply moves the match; the placeholder inherits the original match's date/time/court (so the old cell becomes the new empty).

### 2. "Clear / delete slot" action
- On any fixture row, add an admin overflow menu with:
  - **Mark as no game** → converts row to placeholder (keeps court booking, hides from standings/points).
  - **Delete slot** → removes the row and releases the court booking.
- Applies to already-placed matches too: "Mark as no game" first moves the pair to an available placeholder if one exists, otherwise warns admin to swap first.

### 3. Immediate manual fix for Nelspruit doubles
- As part of the same change, insert the two missing Saturday slots (16:30 and 17:00) across the courts currently used on that Saturday for the Nelspruit Masters doubles tournament, so admin can drag pairs in right away without waiting to use the new UI.

### 4. Guardrails
- Placeholder rows are excluded from standings, points, notifications, and marker.
- Court-booking sync (`saveFixtures`) treats placeholders as normal holds so no double-booking with league/other tournaments.
- Only club admins (and super admin) see the Add/Delete/Mark actions.

## Technical notes
- New enum value `placeholder` on `tournament_matches.status` (migration) plus filter updates in standings/points calculators and marker deep-link.
- Reuse existing `canSwap` / `doSwap` in `SwapFixtureButton.tsx` and drag handler — placeholders count as swappable targets with no player conflict.
- Court-booking creation reuses the same helper `saveFixtures` uses; deletion cancels the booking row.

## Deliverables
1. Migration: add `placeholder` status + filters.
2. `AddSlotDialog.tsx` (new) wired into preview + Upcoming list.
3. Row overflow menu with "Mark as no game" / "Delete slot".
4. One-off data insert for Nelspruit Saturday 16:30 & 17:00 slots.
