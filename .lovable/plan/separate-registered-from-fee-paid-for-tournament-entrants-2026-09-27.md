# Separate "Registered" from "Fee paid" for tournament entrants

## Why two players were missing
The standings page reads the draw (12 players). Juano Eksteen and Marius du Plessis were placed in the draw by the organiser, but their entry record still says "Invited" — they never accepted in the app, and placing them didn't update their entry. The other 10 accepted via the invite link, and because there is no fee, the system stored them as "paid". So the draw and the entry list disagree, and "paid" is being misused to mean "registered".

## What changes
Every entrant gets two separate statuses:

- **Registration:** Invited, Registered, Declined/Withdrawn.
- **Fee:** Not required (free tournament), Due, Pending (EFT awaiting confirmation), Paid, Waived.

Rules:
- **Free tournament:** accepting the invite (or the organiser adding the player) sets Registered, fee = Not required. Nobody is shown as "Paid".
- **Fee required:** a player only becomes Registered once the fee is Paid or Waived. Until then they show "Accepted — fee due" and stay out of the draw.
- **Organiser places a player in the draw:** that player is automatically marked Registered (source: added by organiser), so the draw and entry list always match.
- Players list, standings, counts, WhatsApp lists and invite reminders all use Registration; finance screens use Fee.

## Existing data
- Current "paid" rows on free tournaments become Registered + Not required (no money was involved, nothing in the books changes).
- Real paid rows become Registered + Paid; pending EFT rows become Fee Pending.
- Players already in a draw but still "Invited" (Juano, Marius) become Registered, source "added by organiser".
- No payments, fees or journal entries are altered.

## Technical details
- Add `registration_status` and `fee_status` columns to `club_champs_registrations` (text + validation trigger), backfilled from `status`, `confirmed_at`, `paid_at`, `fee_paid_cents` and the tournament fee; keep `status` as a synced legacy column so existing functions keep working.
- Trigger on `club_champs_entries` insert: set the matching registration to Registered.
- Update `accept_tournament_invite`, `ensure_tournament_entry_fee`, EFT confirm and waive paths to set both fields.
- `src/lib/tournaments/entrant-status.ts` reads the new fields (falls back to legacy); update `entry-counts.ts`, `TournamentRegistrationsDialog`, register/invite cards, and add tests for free vs fee-required vs organiser-added.
- Log in the project issue log. Nothing published.
