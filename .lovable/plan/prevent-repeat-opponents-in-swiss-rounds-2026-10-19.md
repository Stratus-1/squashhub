# Prevent repeat opponents in Swiss rounds

## Confirmed problem
The positional projection follows fixed position pairings without checking previous opponents. If the same players remain in positions 3 and 7, the later 3-versus-7 slot can repeat their earlier match. The screenshot shows 18 players in this draw; the safeguard must work for 24 players too.

## What will change
- Check actual player identities and all earlier Swiss opponents before confirming a future pairing.
- Keep the preferred positional pairing when it is legal; otherwise find a non-repeating pairing, prioritising nearby positions.
- Never allow a repeat as a silent fallback. If no legal pairing exists with already-confirmed games preserved, stop that draw's progression and show the organiser the conflict.
- Use the same accepted pairings in the progression log, proposed court games and automatic fixture creation.
- Future TBD position pairings remain provisional: opponent history takes priority over a fixed position route.

## Safety and rollout
- Preserve played results, existing fixtures, bookings and tournament settings. No retrospective reshuffling.
- Keep existing confirmed pairings fixed while evaluating the remaining players; defer confirmation where undecided players prevent a safe complete pairing.
- First validate behind a Riverside-only opt-in with synthetic players. Uitsig activation requires a separate approval and a read-only impact review of its running draws.
- No publishing, live-data changes or player notifications in this implementation step.
- Round robin and knockout formats are unchanged; no play-by dates are added.

## Verification
- Regression cases for positions 3 and 7 retaining their places after meeting earlier.
- Five-round 18-player and 24-player simulations with unchanged positions and varied results: every player appears once per round and no opponent pair repeats.
- Partial results, confirmed future games, odd fields and byes; no-solution cases must block rather than repeat.
- Verify the Riverside progression screen and projected fixtures agree with the pairing used for creation.

## Technical details
- Reuse existing tournament pairing helpers and opponent-history rules; add a shared history-aware resolution step rather than implementing pairing logic inside pages.
- Integrate through `swiss-progression-view.ts`, `projected-court-fixtures.ts` and the server auto-progression engine; include server-side repeat rejection so the browser is not the only protection.
- Preserve fixture identity and schedule-slot identity independently when a proposed opponent changes.
- Update scoped architecture rules and the issue log; rebuild the bundled auto-progression engine only after approved changes.