# Enter and pay for other players

## What a member will see
On a tournament entry screen (for example Nelspruit Family Doubles), below the normal "Enter" option there is a new section: **Also enter and pay for someone else**.

- A search box to add any player eligible for that tournament (family members, children, club mates).
- Each added person appears as a row showing their name, the entry fee, and an optional partner picker ("Partner: choose later" by default).
- A running total: "3 entries — R450".
- One payment for the whole group, using whatever the organiser allows: card, EFT proof, or "Add it to my account".
- After paying, everyone added is entered straight away and gets a notification saying who entered and paid for them.

The payer can come back later and add more people; already-paid entries are not charged again.

## Rules
- Only players eligible for that tournament can be added; anyone already entered is shown as unavailable.
- Partner choice stays optional and follows the existing partner rules for that tournament (it is hidden for tournaments where the organiser pairs players or partners rotate).
- If the payer does not pay, the extra entries stay unpaid and visible as outstanding, exactly like a normal unpaid entry.
- Paying for others never changes who the payer's own partner is.

## Technical details
- New database-side function `register_and_pay_for_players(champ_id, payer_member_id, entries[])` creating/updating `club_champs_registrations` rows for each listed member (with optional `partner_member_id`), marked as paid-by-payer, idempotent on `(champ_id, club_member_id)`; entries already paid are skipped.
- Add `paid_by_member_id` (nullable) to `club_champs_registrations` so group payments are auditable and reconcilable, with grants and policies matching the existing table.
- Account charge path reuses the existing tournament-debit RPC, raising one fee line per entered player against the payer, linked to the registration, idempotent on re-runs.
- Card/EFT path reuses the current gateway session creation with the combined amount; on webhook confirmation all registrations in the group are marked paid together (idempotent, out-of-order safe).
- UI: new `GroupEntryCard` used by `TournamentRegisterCard.tsx` and `TournamentInviteRegisterDialog.tsx`, reusing the eligible-player search already used by the partner picker (paginated to avoid the 1000-row limit) and `DoublesPartnerPicker` for optional partners.
- Notifications: in-app notification per entered player via the existing communications engine; no automatic emails.
- Tests: fee-total calculation, idempotent re-payment, and partner-optional handling.
