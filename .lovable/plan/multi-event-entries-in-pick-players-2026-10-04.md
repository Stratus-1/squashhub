# Multi-event entries in "Pick players"

## What I found
The one-choice dropdown is not just a screen limit. The saving and draw steps also assume one person = one event:
- **Picked players** are stored as one event per person on the device.
- **Saving entries** writes each person's event list as exactly one event, and only one doubles partner per person.
- **Generate draw & fixtures** refuses a draw where any player appears more than once ("a player appears in the draw more than once"). So Albert in Men's Singles + Men's Doubles would be blocked even if the screen allowed it.
- Invited players can pick several events, but they share **one** partner field. Two doubles events with different partners can't be stored correctly today either.

So a screen-only change would look right but fail at save or draw time. The fix needs small, targeted backend changes too.

## What you will see
- Each picked player is shown as a row with **event chips** (Men's Singles, Men's Doubles, Mixed Doubles...). Tap a chip to add or remove that event. The player stays picked.
- Only events the player may enter can be tapped. Blocked events show greyed out with the reason (for example "Ladies only").
- A header line shows **"N unique players · M total entries"**.
- "Place by league" still fills in an event for unplaced players. Search, the available-members count and bulk add stay as they are.
- Pairing in doubles events works per event: Albert can partner Ben in Men's Doubles and Cara in Mixed Doubles.
- Coming back to the screen shows saved selections. Older saved tournaments (one event per player) load as a single chip.

## Rules (same for admin picks and invitations)
- One registration per person, with a list of their events. The person is never duplicated.
- Each event is a separate entry: its own pool place, fixtures and fee line.
- Doubles partner is stored **per event**.
- Bells/time-capped tournaments keep their current one-event-only rule.
- Removing one event withdraws only that entry. Played games and results are never touched, and unpaid fees for that event are reversed with an audit record (existing behaviour).

## Technical details
- `StepAnswers.picks`: value becomes `string | string[]`. A helper `placesOf(id)` normalises old string values, so no migration of saved drafts is needed. All uses in `StepByStepBuilder.tsx` (counts, `pickOk`, `pairsFor`/`unpairedIn`, messages, summary, entrants) switch to per-event iteration. `entrants` sends one item per (member, event, partner).
- New pure helper `src/lib/smart-builder/pick-entries.ts` (normalise, toggle, counts, eligibility reason) with unit tests.
- Migration (one, additive):
  - `club_champs_registrations.division_partners jsonb` (event number → partner id). `partner_member_id` is kept and mirrored when a person has a single doubles event, so existing screens keep working.
  - `step_sync_admin_entrants`: group incoming items by member, so `division_choices` holds all events and `division_partners` holds partners per event. Withdraw logic is unchanged.
  - `apply_registration_division_choices`: write the per-event partner into `club_champs_entries`.
  - `step_prepare_draw`: the duplicate-player guard and the pair-integrity checks become **per event** (`group`), reading the per-event partner with fallback to `partner_member_id`.
- `step-draw.ts` pair reconciliation becomes per event, using the same fallback.
- Fees: check `ensure_tournament_entry_fee` charges per event entry. If it charges once per registration, extend it to one line per event, following the existing fee settlement rules.
- Tests: one player/one event; one player/3 events; several players with different mixes; remove a single event; blocked event; reload of old and new saved selections; unique vs total counts; draw accepts the same person in two events and still rejects the same person twice in one event.
- Nothing is published, and no Riverside entries are changed outside a test tournament.

## Open question
The invitation/self-registration screen currently has one partner field. The plan makes the backend support a partner per event. Changing the invite screen to **ask** for a partner per doubles event would be a follow-up, unless you want it included now.
