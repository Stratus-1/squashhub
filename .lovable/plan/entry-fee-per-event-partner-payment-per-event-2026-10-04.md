# Entry fee per event + partner payment per event

## What you'll get
- **Fee per event:** the tournament's entry fee becomes the price of one event. A player in Men's Singles + Men's Doubles owes 2 x the fee. One event = exactly what it costs today, so single-event tournaments don't change.
- **Partner payment stays as before, per event:** in invitations a player still names their doubles partner and can tick "I'll pay for my partner", using the same partner screen the old builder used. Paying for a partner covers **only that doubles event**. If the partner also entered Mixed Doubles, they still owe that event themselves.
- **Amounts shown everywhere:** invitation, registration card, partner picker, admin Registrations list and the payment screens show the breakdown, e.g. "2 events x R150 = R300" and "Includes R150 for partner Ben (Men's Doubles)".
- **Adding or removing an event:** before payment, the amount owed updates. If a player who already paid adds an event, a separate "additional event" fee is added. Paid fees are never changed or deleted.
- **Pairs confirm per event:** a doubles pair is confirmed once that event is paid for both players, whoever paid.

## Not changing
- Card, EFT, account and delegate payment flows stay the same. Only the amount they charge changes.
- Paid history and existing fee records, scoring, draws, and how fees get to the club's ledger.
- Bells (time-capped) tournaments, which already allow only one event per player.

## Tests
- 1 event = old amount; 3 events = 3 x the fee.
- A pays for B in Men's Doubles: A owes 2 events, B owes only their other events.
- Pair confirms only when that event is covered for both players.
- Event added after payment → separate extra fee, paid fee untouched.
- Event removed before payment → lower amount.
- Old single-event registrations and invitations still work.

---

## Technical details
- New SQL `champ_registration_due_cents(reg_id)` = event fee x (own events not covered by a partner + partner events this member pays for). If `division_choices` is empty, it counts as 1 event (legacy).
- New `champ_member_event_paid(champ, member, group)`: true when the member is covered by a paying partner whose fee is paid, or when their own fee is paid.
- `champ_pair_settle` and `get_doubles_pairing_state` paid flags use the per-event check.
- `ensure_tournament_entry_fee`, `accept_tournament_invite`, `charge_champ_entries_to_payer`, `tournament_invite_payment_context`, `step_pair_payment_context` use the due amount. A new `refresh_tournament_entry_fee(reg)` updates the unpaid fee amount, or adds an "additional events" fee when the existing fee is already paid. Called after event choices and pair changes.
- `champ_apply_paid_registration` and `champ_registration_payment_settles_pairs` mark a partner's registration paid only when every one of the partner's events is covered. Otherwise they only settle the pair.
- Client: a shared `entryDue()` helper plus an RPC read for display, replacing `entry_fee_cents` in the components that pass it as the charge amount (Yoco/PayFast/PayNow take a client amount, so the client reads the server amount).
- One additive migration (functions only, no column drops).
- Update `src/lib/AGENTS.md` and the issue log.
