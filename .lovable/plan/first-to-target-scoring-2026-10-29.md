# First-to-target scoring

## New scoring choice
- Add **First to target** alongside Standard and Bells, with a configurable winning score initially set to **7**.
- One game per meeting: the first player or pair to reach the target wins. **7–6 is a win**; no two-point lead or timer applies.
- Award **1 standings point for a win and 0 for a loss**. Rally-point totals do not determine the pool winner.
- Retain existing round-robin pools and organiser-selected semifinals/final. Two pools of six can use this scoring without becoming a fixed template.

## Safe introduction
- Introduce it as a Riverside-only opt-in for new test tournaments first, following the existing tournament pilot policy.
- Preserve all saved Standard/Bells settings, games, results, bookings and standings. No automatic adoption by existing events.
- Do not publish, send invitations or create live fixtures as part of implementation.

## Technical implementation
- Extend the canonical scoring schema, original structure screen and scoring adapters; persist an explicit mode and target through existing per-division settings, adding a compatible field only if required.
- Carry the rule through setup handover, effective match settings, live scoring and result entry. A target finish must submit only once.
- Reuse one shared win-based standings strategy for pool displays and playoff qualification; retain Standard/Bells strategies unchanged.
- Update the scoped architecture notes and issue history.

## Verification
- Test 6–6 remains unfinished and 7–6 finishes with the correct winner; repeat with another configured target.
- Test a win earns exactly 1 point and a loss 0, regardless of rally totals.
- Test saved settings round-trip and Standard/Bells regression cases.
- Exercise an isolated Riverside test with two six-player pools and semifinal/final progression before requesting wider rollout.