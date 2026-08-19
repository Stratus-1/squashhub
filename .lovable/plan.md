# Tournament invites: register, pick a partner, pay by EFT with proof

Today the invite card on the dashboard is only "Accept Invite / Decline". Accepting credits the entry fee to the player's account and, if the club uses Yoco, opens a card payment. There is no partner selection, no bank details, and nowhere to upload proof of payment.

## What changes for the player

The invite card button becomes **"Register to accept"**. Tapping it opens a short registration sheet instead of instantly accepting:

1. **Tournament summary** — name, format, dates, play days/times, entry fee.
2. **Partner step** (only for doubles where players choose their own partners) — searchable list of eligible club members, same eligibility rules already used on the tournament page (correct gender, not already paired). Choosing a partner enters both players.
3. **Payment step**, driven by what the tournament allows:
   - Card allowed and a gateway is configured → "Pay R… by card" as today.
   - **EFT allowed (or the only method)** → the sheet shows the club's bank name, account name, account number, branch code, the payment reference and the exact amount, with a Copy button, followed by an **Upload proof of payment** control (photo or PDF). The registration is marked "Awaiting EFT" and the proof is attached to it.
   - No fee → straight confirm.
4. Decline stays exactly as it is.

After uploading, the card shows "Proof uploaded — awaiting club confirmation" so the player knows nothing more is expected of them.

## What changes for the admin

In the tournament Registrations dialog, rows awaiting EFT gain a **View proof** link (opens the uploaded file) next to the existing "Mark paid" action. Club admins also get a notification when a proof is uploaded so payments do not sit unnoticed.

## Technical notes

- New private storage bucket `payment-proofs`, with policies letting a member upload/read their own file (path prefixed by club id and member id) and club admins read files for their club.
- New columns on `club_champs_registrations`: `proof_url text`, `proof_uploaded_at timestamptz`, `proof_uploaded_by uuid`.
- New component `src/components/tournaments/TournamentInviteRegisterDialog.tsx` holding the steps; it reuses `register_doubles_pair`, `accept_tournament_invite`, `get_club_bank_details` and the existing `startClubCheckout` helpers so no payment logic is duplicated or changed.
- `TournamentInviteActions.tsx` keeps its status/notification handling; its accept button opens the new dialog rather than firing the RPC directly. Partner invites keep their current one-tap Accept.
- The EFT panel is the same layout already used in `TournamentRegisterCard.tsx`, extracted into a small shared `EftPaymentPanel` so both surfaces (invite card and tournament page) show identical bank details plus the new upload control.
- `TournamentRegistrationsDialog.tsx` gains the proof link column.
