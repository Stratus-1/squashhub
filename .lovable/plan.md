# Restore Uitsig’s planned play-off fixtures

## Confirmed problem
- Men's A and Ladies B both have **Semifinal, Final and 3rd/4th place** selected in saved setup.
- The running draw contains only Semifinal and Final. The six extra rows are two semifinals and one final per category—not the third/fourth-place matches.
- Both finals have 21 November saved on their fixture rows, but no start time or court. Setup specifies **09:15–13:15, Courts 1 and 4**.
- Upcoming Fixtures treats unresolved play-off rows as Swiss slots because the tournament mixes formats, so those rows are hidden.

## Correction
1. Carry the saved third/fourth-place selections into the running play-off plan on an explicit setup save. Add one semifinal-losers match per affected category, without replacing the existing semifinal or final stages.
2. Show planned play-offs in Upcoming Fixtures even before the players qualify, using factual position/winner/loser labels. Keep unresolved Swiss pairings hidden.
3. Include the third/fourth-place match in the progression presentation and use **Loser SF1 vs Loser SF2**, not winner labels.
4. Apply the latest saved final sessions to pending play-off slots, allocating actual start times and selected courts within the window. Schedule placement matches before championship finals, check shared court capacity, and report clashes instead of inventing space.
5. Preserve existing fixture identities, reserved slots, bookings and completed results on repeated saves. Do not regenerate round-robin games or change other categories.

## Verification and live-data boundary
- Add focused tests for late placement additions, repeat-save idempotency, mixed-format fixture visibility, loser labels, saved session inheritance and ordering.
- Check the signed-in Uitsig screens and validate the proposed fixture changes before applying them.
- Apply only the confirmed Men's A and Ladies B missing placement fixtures and pending final allocations through the authorised save flow; no scores, players or existing personal bookings change.
- Publication and end-of-tournament position calculations are outside this correction.

## Technical details
- Fix `drawPlanOf` to retain the supported structure flags, and the existing-stage attachment path to support append-only placement additions.
- Use the existing placeholder/adoption and play-off scheduling machinery, with the latest saved setup sessions as scheduling authority; do not weaken `structured_commit` stage immutability.
- Update the shared provisional-Swiss filter to distinguish play-off fixtures from Swiss rounds, and the shared planned-bracket projection to include placement rounds.