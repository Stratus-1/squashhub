# Tournament fees and payments belong to the host club

## What went wrong (Louna Stevens)
- Louna entered Nelspruit's "Family Doubles". The R150 entry fee was put on her **White River** account, because fees are always charged to the player's home-club membership.
- Seeing R150 owing, she used "Top up via EFT" twice (R150 each, 15 seconds apart, no reference). A top-up always goes to the club she's signed into, so both pending payments landed at **White River**.
- The same thing can happen to every player who enters another club's or association's tournament (e.g. the CSIR Bells and NA Open entrants from other clubs).

## Fix for the future
1. **Charge entry fees to the host.** When a player from another club enters, the fee is billed on the host club's books. If the player has no record at the host club, a visitor record is created there automatically, linked to the same national person (no duplicate person).
2. **Pay the fee directly, not via a top-up.** The tournament entry shows "Pay entry fee" (card or EFT). The EFT goes into the **host club's** Pending Payments, linked to that exact fee, with the tournament name and an automatic reference.
3. **Guard on top-ups.** If a player tries a plain top-up while their only amount owing is another club's tournament fee, we tell them to pay it from the tournament instead.
4. **No double top-ups.** A second identical EFT request within a minute is blocked.
5. **Assistant answer.** The assistant can now read pending payments and say which club and fee they belong to, instead of only handing over to support.

## Louna's existing records
- Move the R150 Family Doubles fee from White River to Nelspruit (fee plus its book entries, balanced).
- Move **one** R150 pending EFT to Nelspruit's Pending Payments, linked to that fee. Cancel the second as a duplicate (kept on record, not deleted).
- Only Louna is corrected now. Other players already charged at their home club stay as they are unless you ask.

## Technical details
- `ensure_tournament_entry_fee`: resolve the host club from `club_champs.club_id`; if the registrant's `club_members.club_id` differs, find or create a visitor `club_members` row at the host (matched by `person_id`/`user_id`) and bill that row. Association-hosted events (NA Open) keep the current behaviour until an association ledger exists.
- New `member_credit_transactions.fee_payment_id` link; the EFT pay-fee path writes `club_id` = host club.
- Pending top-up dedupe (same member, amount, method within 60s) enforced in the database.
- Journal corrections through balanced reversing entries, with a backup and an audit log entry.
- Tests: fee billed to host, visitor record reused (not duplicated), EFT lands at host, duplicate blocked, home-club members unaffected.
